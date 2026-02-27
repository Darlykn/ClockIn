import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.middleware import get_current_user, require_role
from app.core.security import create_invite_token, hash_password
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import InviteTokenResponse
from app.schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter()


def _to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        is_active=user.is_active,
        has_2fa=user.totp_secret is not None,
        email=user.email,
    )


@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user (admin only)",
)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin")),
) -> UserResponse:
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' is already taken",
        )

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        full_name=body.full_name,
        email=body.email,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _to_response(user)


@router.get(
    "/",
    summary="List users with pagination and optional name search",
)
async def list_users(
    search: str | None = Query(default=None, description="Filter by full_name (partial, case-insensitive)"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin", "manager")),
) -> dict:
    q = select(User)
    if search:
        q = q.where(
            User.full_name.ilike(f"%{search}%")
            | User.username.ilike(f"%{search}%")
            | User.email.ilike(f"%{search}%")
        )
    q = q.order_by(User.full_name)

    result = await db.execute(q)
    all_users = result.scalars().all()
    total = len(all_users)
    offset = (page - 1) * per_page
    page_users = all_users[offset : offset + per_page]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total > 0 else 1,
        "items": [_to_response(u) for u in page_users],
    }


@router.get(
    "/employees",
    summary="List all active employees (id + full_name) for dropdowns",
)
async def list_employees(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin", "manager")),
) -> list[dict]:
    result = await db.execute(
        select(User).where(
            User.is_active == True,  # noqa: E712
            ~User.full_name.ilike("%Временный пропуск%"),
        ).order_by(User.full_name)
    )
    users = result.scalars().all()
    return [{"id": str(u.id), "full_name": u.full_name or u.username} for u in users]


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return _to_response(current_user)


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update user role, active status or full_name (admin only)",
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin")),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if body.role is not None:
        user.role = body.role

    if body.is_active is not None:
        if user_id == _current_user.id and not body.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot deactivate yourself; only another admin can deactivate you",
            )
        user.is_active = body.is_active

    if body.full_name is not None:
        user.full_name = body.full_name

    if body.email is not None:
        user.email = body.email

    if body.reset_2fa:
        user.totp_secret = None

    await db.commit()
    await db.refresh(user)
    return _to_response(user)


@router.post(
    "/{user_id}/generate-invite",
    response_model=InviteTokenResponse,
    summary="Generate a first-login invite token for a user (admin only)",
)
async def generate_invite(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin")),
) -> InviteTokenResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot invite a disabled user",
        )

    # Reset 2FA so user must set it up again via the invite link
    user.totp_secret = None

    token, jti = create_invite_token({"sub": str(user.id)})
    user.invite_jti = jti
    await db.commit()

    return InviteTokenResponse(invite_token=token)
