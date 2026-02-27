import base64
import io

import pyotp
import qrcode
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_temp_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import (
    FirstLoginRequest,
    InviteValidationResponse,
    LoginRequest,
    ResetPasswordRequest,
    TOTPSetupResponse,
    TOTPVerifyRequest,
    TokenResponse,
)

router = APIRouter()

_TEMP_TOKEN_COOKIE = "temp_token"
_REFRESH_TOKEN_COOKIE = "refresh_token"


def _get_temp_token(
    request: Request,
    temp_token: str | None = Cookie(default=None, alias=_TEMP_TOKEN_COOKIE),
) -> str | None:
    """Prefer Authorization Bearer (for SPA), fallback to cookie."""
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:].strip()
    return temp_token


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_TOKEN_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=86400,
    )


@router.post("/login", summary="Step 1: Password check")
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Для тестирования: пропуск 2FA — сразу выдаём полные токены
    if getattr(settings, "DISABLE_2FA_FOR_TESTING", False):
        data = {"sub": str(user.id)}
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)
        _set_refresh_cookie(response, refresh_token)
        return {"access_token": access_token, "token_type": "bearer"}

    temp = create_temp_token({"sub": str(user.id)})
    response.set_cookie(
        key=_TEMP_TOKEN_COOKIE,
        value=temp,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=600,
    )

    if user.totp_secret is None:
        return {"requires_2fa_setup": True, "temp_token": temp}
    return {"requires_2fa_verify": True, "temp_token": temp}


@router.post(
    "/2fa/setup",
    response_model=TOTPSetupResponse,
    summary="Step 2a: Generate TOTP secret and QR code",
)
async def setup_2fa(
    db: AsyncSession = Depends(get_db),
    temp_token: str | None = Depends(_get_temp_token),
) -> TOTPSetupResponse:
    user = await _user_from_temp_token(temp_token, db)

    secret = pyotp.random_base32()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        user.username, issuer_name="AttendTrack"
    )

    img = qrcode.make(uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode()
    qr_data_uri = f"data:image/png;base64,{b64}"

    return TOTPSetupResponse(qr_code_uri=qr_data_uri, secret=secret)


@router.post(
    "/2fa/verify",
    response_model=TokenResponse,
    summary="Step 2b: Verify TOTP code and issue full tokens",
)
async def verify_2fa(
    body: TOTPVerifyRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    temp_token: str | None = Depends(_get_temp_token),
) -> TokenResponse:
    user = await _user_from_temp_token(temp_token, db)

    if user.totp_secret is None:
        # Setup flow: secret comes from the request body (not yet saved)
        if not body.secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA not configured. Call /2fa/setup first.",
            )
        totp_secret_to_use = body.secret
    else:
        # Regular verify flow: use the already-stored secret
        totp_secret_to_use = user.totp_secret

    totp = pyotp.TOTP(totp_secret_to_use)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TOTP code",
        )

    if user.totp_secret is None:
        user.totp_secret = totp_secret_to_use
        await db.commit()

    data = {"sub": str(user.id)}
    access_token = create_access_token(data)
    refresh_token = create_refresh_token(data)
    _set_refresh_cookie(response, refresh_token)

    response.delete_cookie(_TEMP_TOKEN_COOKIE)

    return TokenResponse(access_token=access_token)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token using HttpOnly cookie",
)
async def refresh_tokens(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_TOKEN_COOKIE),
) -> TokenResponse:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Refresh token invalid or expired",
    )
    if not refresh_token:
        raise invalid

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise invalid

    if payload.get("type") != "refresh":
        raise invalid

    user_id = payload.get("sub")
    if not user_id:
        raise invalid

    from sqlalchemy import select
    import uuid as _uuid

    result = await db.execute(
        select(User).where(User.id == _uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise invalid

    data = {"sub": str(user.id)}
    new_access = create_access_token(data)
    new_refresh = create_refresh_token(data)
    _set_refresh_cookie(response, new_refresh)

    return TokenResponse(access_token=new_access)


@router.post("/reset-password", summary="Reset password using TOTP code")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or user.totp_secret is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found or 2FA not configured",
        )

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.otp_code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP code",
        )

    user.password_hash = hash_password(body.new_password)
    await db.commit()

    return {"message": "Password reset successful"}


@router.get(
    "/validate-invite",
    response_model=InviteValidationResponse,
    summary="Validate invite token and return user info",
)
async def validate_invite(
    token: str = Query(..., description="Invite JWT token"),
    db: AsyncSession = Depends(get_db),
) -> InviteValidationResponse:
    import uuid as _uuid

    try:
        payload = decode_token(token)
    except JWTError:
        return InviteValidationResponse(valid=False)

    if payload.get("type") != "invite":
        return InviteValidationResponse(valid=False)

    user_id_raw = payload.get("sub")
    if not user_id_raw:
        return InviteValidationResponse(valid=False)

    result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id_raw)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return InviteValidationResponse(valid=False)

    # Check that this is the latest invite (jti must match)
    token_jti = payload.get("jti")
    if not token_jti or user.invite_jti != token_jti:
        return InviteValidationResponse(valid=False)

    return InviteValidationResponse(
        valid=True,
        has_email=bool(user.email),
        email=user.email,
        full_name=user.full_name,
    )


@router.post("/first-login", summary="First login: set email and password via invite token")
async def first_login(
    body: FirstLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    invalid_token = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired invite link",
    )

    try:
        payload = decode_token(body.invite_token)
    except JWTError:
        raise invalid_token

    if payload.get("type") != "invite":
        raise invalid_token

    user_id_raw = payload.get("sub")
    if not user_id_raw:
        raise invalid_token

    import uuid as _uuid

    result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id_raw)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise invalid_token

    # Check that this is the latest invite (jti must match)
    token_jti = payload.get("jti")
    if not token_jti or user.invite_jti != token_jti:
        raise invalid_token

    if body.password != body.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match",
        )

    # Only update email if provided; existing email is kept for returning users
    if body.email:
        user.email = body.email
    user.password_hash = hash_password(body.password)
    # Reset 2FA so user sets it up again
    user.totp_secret = None
    # Invalidate the invite link after use
    user.invite_jti = None
    await db.commit()

    temp = create_temp_token({"sub": str(user.id)})
    response.set_cookie(
        key=_TEMP_TOKEN_COOKIE,
        value=temp,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=600,
    )

    if getattr(settings, "DISABLE_2FA_FOR_TESTING", False):
        data = {"sub": str(user.id)}
        access_token = create_access_token(data)
        refresh_token = create_refresh_token(data)
        _set_refresh_cookie(response, refresh_token)
        return {"access_token": access_token, "token_type": "bearer"}

    return {"requires_2fa_setup": True, "temp_token": temp}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Logout")
async def logout(response: Response) -> None:
    response.delete_cookie(_REFRESH_TOKEN_COOKIE)
    response.delete_cookie(_TEMP_TOKEN_COOKIE)


async def _user_from_temp_token(
    temp_token: str | None, db: AsyncSession
) -> User:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Temp token missing or invalid. Please login first.",
    )
    if not temp_token:
        raise invalid

    try:
        payload = decode_token(temp_token)
    except JWTError:
        raise invalid

    if payload.get("type") != "temp":
        raise invalid

    user_id_raw = payload.get("sub")
    if not user_id_raw:
        raise invalid

    import uuid as _uuid

    result = await db.execute(
        select(User).where(User.id == _uuid.UUID(user_id_raw))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise invalid
    return user
