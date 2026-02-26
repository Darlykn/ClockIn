"""
Phase 3 — 2FA (TOTP) Flow Tests.

Tests:
  - test_2fa_full_setup_flow        : New user goes through full login+setup+verify
  - test_2fa_subsequent_login       : User with 2FA already set up logs in again
  - test_2fa_invalid_code           : Wrong OTP returns 401
  - test_reset_password_via_2fa     : Reset password with TOTP code
"""

import pyotp
import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import verify_password
from app.db.models import User


class TestTwoFactorSetupFlow:
    async def test_2fa_full_setup_flow(
        self,
        client: AsyncClient,
        fresh_user_no_2fa: dict,
    ) -> None:
        """
        Full first-login flow:
        1. POST /login → requires_2fa_setup + temp_token cookie
        2. POST /2fa/setup → qr_code_uri (Base64 PNG) + secret
        3. POST /2fa/verify with TOTP code → access_token + refresh_token cookie
        4. Verify access_token contains user sub (id)
        """
        # Step 1: Login
        resp_login = await client.post(
            "/api/auth/login",
            json={"username": fresh_user_no_2fa["username"], "password": fresh_user_no_2fa["password"]},
        )
        assert resp_login.status_code == 200, resp_login.text
        assert resp_login.json().get("requires_2fa_setup") is True
        assert "temp_token" in resp_login.cookies

        # Step 2: Setup 2FA
        resp_setup = await client.post("/api/auth/2fa/setup")
        assert resp_setup.status_code == 200, resp_setup.text
        setup_data = resp_setup.json()
        assert "qr_code_uri" in setup_data
        assert "secret" in setup_data

        # Verify QR code is a valid Base64 PNG
        qr_uri = setup_data["qr_code_uri"]
        assert qr_uri.startswith("data:image/png;base64,"), (
            f"Expected data:image/png;base64,... but got: {qr_uri[:50]}"
        )

        # Step 3: Verify with programmatically generated OTP
        secret = setup_data["secret"]
        otp_code = pyotp.TOTP(secret).now()
        resp_verify = await client.post("/api/auth/2fa/verify", json={"code": otp_code})
        assert resp_verify.status_code == 200, resp_verify.text

        verify_data = resp_verify.json()
        assert "access_token" in verify_data
        assert verify_data.get("token_type") == "bearer"

        # Verify refresh_token cookie was set
        assert "refresh_token" in resp_verify.cookies

        # Step 4: Decode access_token and check sub
        payload = jwt.decode(
            verify_data["access_token"],
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        assert "sub" in payload, "access_token must contain sub (user_id)"
        assert payload.get("type") == "access"

    async def test_2fa_full_setup_flow_get_me(
        self,
        client: AsyncClient,
        fresh_user_no_2fa: dict,
    ) -> None:
        """After completing full 2FA flow, /users/me returns user profile."""
        # Full login flow
        await client.post(
            "/api/auth/login",
            json={"username": fresh_user_no_2fa["username"], "password": fresh_user_no_2fa["password"]},
        )
        resp_setup = await client.post("/api/auth/2fa/setup")
        secret = resp_setup.json()["secret"]
        otp_code = pyotp.TOTP(secret).now()
        resp_verify = await client.post("/api/auth/2fa/verify", json={"code": otp_code})
        access_token = resp_verify.json()["access_token"]

        # Use access_token to call /users/me
        resp_me = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp_me.status_code == 200, resp_me.text
        me_data = resp_me.json()
        assert me_data["username"] == fresh_user_no_2fa["username"]
        assert me_data["has_2fa"] is True


class TestTwoFactorSubsequentLogin:
    async def test_2fa_subsequent_login(
        self,
        client: AsyncClient,
        employee_user: dict,
    ) -> None:
        """
        User with 2FA already configured gets requires_2fa_verify: true on login,
        and can verify without calling setup.
        """
        # Step 1: Login
        resp_login = await client.post(
            "/api/auth/login",
            json={"username": employee_user["username"], "password": employee_user["password"]},
        )
        assert resp_login.status_code == 200, resp_login.text
        login_data = resp_login.json()
        # User already has totp_secret set → requires_2fa_verify
        assert login_data.get("requires_2fa_verify") is True

        # Step 2: Verify directly (skip setup)
        otp_code = pyotp.TOTP(employee_user["totp_secret"]).now()
        resp_verify = await client.post("/api/auth/2fa/verify", json={"code": otp_code})
        assert resp_verify.status_code == 200, resp_verify.text
        assert "access_token" in resp_verify.json()

    async def test_2fa_invalid_code(
        self,
        client: AsyncClient,
        employee_user: dict,
    ) -> None:
        """Invalid OTP code (000000) returns 401."""
        # Login first to get temp_token
        await client.post(
            "/api/auth/login",
            json={"username": employee_user["username"], "password": employee_user["password"]},
        )
        # Attempt verify with wrong code
        resp = await client.post("/api/auth/2fa/verify", json={"code": "000000"})
        assert resp.status_code == 401, resp.text

    async def test_2fa_verify_without_login(self, client: AsyncClient) -> None:
        """Calling /2fa/verify without temp_token cookie returns 401."""
        resp = await client.post("/api/auth/2fa/verify", json={"code": "123456"})
        assert resp.status_code == 401, resp.text

    async def test_2fa_setup_without_login(self, client: AsyncClient) -> None:
        """Calling /2fa/setup without temp_token cookie returns 401."""
        resp = await client.post("/api/auth/2fa/setup")
        assert resp.status_code == 401, resp.text


class TestResetPassword:
    async def test_reset_password_via_2fa(
        self,
        client: AsyncClient,
        employee_user: dict,
        db: AsyncSession,
    ) -> None:
        """
        Password reset flow using TOTP code:
        1. POST /reset-password with username + OTP + new_password → 200
        2. Old password → 401
        3. New password → 200
        """
        new_password = "ResetNewPass456!"
        otp_code = pyotp.TOTP(employee_user["totp_secret"]).now()

        # Step 1: Reset password
        resp_reset = await client.post(
            "/api/auth/reset-password",
            json={
                "username": employee_user["username"],
                "otp_code": otp_code,
                "new_password": new_password,
            },
        )
        assert resp_reset.status_code == 200, resp_reset.text

        # Step 2: Old password should fail
        resp_old = await client.post(
            "/api/auth/login",
            json={"username": employee_user["username"], "password": employee_user["password"]},
        )
        assert resp_old.status_code == 401, f"Old password should be rejected, got: {resp_old.status_code}"

        # Step 3: New password should succeed
        resp_new = await client.post(
            "/api/auth/login",
            json={"username": employee_user["username"], "password": new_password},
        )
        assert resp_new.status_code == 200, f"New password should work, got: {resp_new.text}"

    async def test_reset_password_invalid_otp(
        self,
        client: AsyncClient,
        employee_user: dict,
    ) -> None:
        """Reset password with invalid OTP returns 401."""
        resp = await client.post(
            "/api/auth/reset-password",
            json={
                "username": employee_user["username"],
                "otp_code": "000000",
                "new_password": "SomeNewPass123!",
            },
        )
        assert resp.status_code == 401, resp.text

    async def test_reset_password_nonexistent_user(self, client: AsyncClient) -> None:
        """Reset password for non-existent user returns 400."""
        resp = await client.post(
            "/api/auth/reset-password",
            json={
                "username": "nobody_xyz_12345",
                "otp_code": "123456",
                "new_password": "SomePass123!",
            },
        )
        assert resp.status_code == 400, resp.text
