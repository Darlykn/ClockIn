"""
Phase 2 — Auth Flow Tests.

Tests:
  - test_create_user_as_admin       : POST /api/users/ → 201
  - test_login_success              : POST /api/auth/login with valid creds → 200
  - test_login_wrong_password       : POST /api/auth/login with bad password → 401
  - test_login_inactive_user        : POST /api/auth/login for disabled user → 403
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.db.models import User


class TestCreateUser:
    async def test_create_user_as_admin(
        self,
        client: AsyncClient,
        admin_headers: dict,
        db: AsyncSession,
    ) -> None:
        """Admin can create a new user; password stored as hash."""
        unique = uuid.uuid4().hex[:8]
        payload = {
            "username": f"qa_created_{unique}",
            "password": "CreatedPass123!",
            "role": "employee",
            "full_name": f"Created User {unique}",
        }

        resp = await client.post("/api/users/", json=payload, headers=admin_headers)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["username"] == payload["username"]
        assert data["role"] == "employee"
        assert data["has_2fa"] is False

        # Verify user in DB and that password is stored as hash (not plain text)
        result = await db.execute(select(User).where(User.username == payload["username"]))
        user = result.scalar_one_or_none()
        assert user is not None
        assert user.password_hash != payload["password"], "Password must be hashed in DB"
        assert verify_password(payload["password"], user.password_hash), "Hash must verify"

        # Cleanup
        await db.delete(user)
        await db.commit()

    async def test_create_user_duplicate_username(
        self,
        client: AsyncClient,
        admin_headers: dict,
        admin_user: dict,
    ) -> None:
        """Creating a user with an existing username returns 409 Conflict."""
        payload = {
            "username": admin_user["username"],
            "password": "SomePass123!",
            "role": "employee",
        }
        resp = await client.post("/api/users/", json=payload, headers=admin_headers)
        assert resp.status_code == 409, resp.text

    async def test_create_user_without_auth(self, client: AsyncClient) -> None:
        """Creating a user without a token returns 401."""
        payload = {"username": "noauth_user", "password": "pass", "role": "employee"}
        resp = await client.post("/api/users/", json=payload)
        assert resp.status_code == 401, resp.text

    async def test_create_user_as_employee_forbidden(
        self,
        client: AsyncClient,
        employee_token: str,
    ) -> None:
        """Employee cannot create users; returns 403."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        payload = {"username": "forbidden_new", "password": "pass", "role": "employee"}
        resp = await client.post("/api/users/", json=payload, headers=headers)
        assert resp.status_code == 403, resp.text


class TestLogin:
    async def test_login_success(
        self,
        client: AsyncClient,
        fresh_user_no_2fa: dict,
    ) -> None:
        """
        Login with valid credentials for a new user (no 2FA yet) returns 200
        and requires_2fa_setup flag.
        """
        resp = await client.post(
            "/api/auth/login",
            json={"username": fresh_user_no_2fa["username"], "password": fresh_user_no_2fa["password"]},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data.get("requires_2fa_setup") is True

        # temp_token cookie must be set
        assert "temp_token" in resp.cookies

    async def test_login_wrong_password(
        self,
        client: AsyncClient,
        fresh_user_no_2fa: dict,
    ) -> None:
        """Login with wrong password returns 401."""
        resp = await client.post(
            "/api/auth/login",
            json={"username": fresh_user_no_2fa["username"], "password": "WrongPass999!"},
        )
        assert resp.status_code == 401, resp.text

    async def test_login_nonexistent_user(self, client: AsyncClient) -> None:
        """Login with non-existent username returns 401."""
        resp = await client.post(
            "/api/auth/login",
            json={"username": "nobody_xyz_12345", "password": "SomePass!"},
        )
        assert resp.status_code == 401, resp.text

    async def test_login_inactive_user(
        self,
        client: AsyncClient,
        inactive_user: dict,
    ) -> None:
        """Login with disabled (is_active=False) user returns 403."""
        resp = await client.post(
            "/api/auth/login",
            json={"username": inactive_user["username"], "password": inactive_user["password"]},
        )
        assert resp.status_code == 403, resp.text
