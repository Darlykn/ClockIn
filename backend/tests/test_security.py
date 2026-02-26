"""
Phase 7 — Middleware and Security Tests.

Tests:
  - test_expired_access_token  : Expired JWT → 401
  - test_refresh_extends_session: POST /api/auth/refresh → new access_token with fresh exp
  - test_role_based_access     : Employee/manager role access restrictions
  - test_import_history_logged : After upload, /api/files/history contains the record
"""

from __future__ import annotations

import time
from datetime import timedelta
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.db.models import AttendanceLog, ImportHistory, User
from tests.conftest import _TestSession


class TestExpiredToken:
    async def test_expired_access_token(
        self,
        client: AsyncClient,
        admin_user: dict,
    ) -> None:
        """
        Create an already-expired access token and verify that
        protected endpoints return 401.
        """
        # Create token with negative expiry (already expired)
        expired_token = create_access_token(
            data={"sub": str(admin_user["id"])},
            expires_delta=timedelta(seconds=-1),
        )
        headers = {"Authorization": f"Bearer {expired_token}"}

        resp = await client.get("/api/users/me", headers=headers)
        assert resp.status_code == 401, (
            f"Expired token should return 401, got {resp.status_code}: {resp.text}"
        )

    async def test_invalid_token_format(self, client: AsyncClient) -> None:
        """Completely invalid (non-JWT) token returns 401."""
        headers = {"Authorization": "Bearer this-is-not-a-jwt-token"}
        resp = await client.get("/api/users/me", headers=headers)
        assert resp.status_code == 401, resp.text

    async def test_wrong_token_type(
        self,
        client: AsyncClient,
        admin_user: dict,
    ) -> None:
        """Refresh token used as access token returns 401 (wrong type)."""
        refresh_token = create_refresh_token(data={"sub": str(admin_user["id"])})
        headers = {"Authorization": f"Bearer {refresh_token}"}
        resp = await client.get("/api/users/me", headers=headers)
        assert resp.status_code == 401, (
            f"Refresh token must not be accepted as access token, got: {resp.status_code}"
        )

    async def test_no_authorization_header(self, client: AsyncClient) -> None:
        """Request without Authorization header to protected endpoint → 401."""
        resp = await client.get("/api/users/me")
        assert resp.status_code == 401, resp.text


class TestRefreshSession:
    async def test_refresh_extends_session(
        self,
        client: AsyncClient,
        employee_user: dict,
    ) -> None:
        """
        After full login+2FA, POST /api/auth/refresh using refresh_token cookie
        must return a NEW access_token with a fresh expiry.
        """
        import pyotp

        # Full login to get refresh cookie
        await client.post(
            "/api/auth/login",
            json={"username": employee_user["username"], "password": employee_user["password"]},
        )
        otp_code = pyotp.TOTP(employee_user["totp_secret"]).now()
        resp_verify = await client.post("/api/auth/2fa/verify", json={"code": otp_code})
        assert resp_verify.status_code == 200, resp_verify.text
        original_access_token = resp_verify.json()["access_token"]

        # Small delay to ensure new token has different exp
        time.sleep(1)

        # POST /api/auth/refresh (cookie is maintained by httpx client)
        resp_refresh = await client.post("/api/auth/refresh")
        assert resp_refresh.status_code == 200, (
            f"Refresh should return 200, got {resp_refresh.status_code}: {resp_refresh.text}"
        )
        refresh_data = resp_refresh.json()
        assert "access_token" in refresh_data

        new_access_token = refresh_data["access_token"]
        assert new_access_token != original_access_token, (
            "Refreshed access token must be different from original"
        )

        # Verify new token is valid and has fresh exp
        original_payload = jwt.decode(
            original_access_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        new_payload = jwt.decode(
            new_access_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        assert new_payload["exp"] >= original_payload["exp"], (
            "New access token expiry must be >= original"
        )

        # Verify new token actually works
        resp_me = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {new_access_token}"},
        )
        assert resp_me.status_code == 200, resp_me.text

    async def test_refresh_without_cookie_returns_401(self, client: AsyncClient) -> None:
        """Calling /api/auth/refresh without refresh_token cookie → 401."""
        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 401, resp.text


class TestRoleBasedAccess:
    async def test_employee_cannot_upload_file(
        self,
        client: AsyncClient,
        employee_token: str,
        sample_excel_path: Path,
    ) -> None:
        """Employee role cannot upload Excel files → 403."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        with open(sample_excel_path, "rb") as f:
            resp = await client.post(
                "/api/files/upload",
                files={"file": (sample_excel_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers=headers,
            )
        assert resp.status_code == 403, (
            f"Employee should get 403 on file upload, got {resp.status_code}"
        )

    async def test_employee_cannot_create_user(
        self,
        client: AsyncClient,
        employee_token: str,
    ) -> None:
        """Employee cannot create new users → 403."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        resp = await client.post(
            "/api/users/",
            json={"username": "forbidden_new_user", "password": "pass123", "role": "employee"},
            headers=headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_employee_cannot_list_users(
        self,
        client: AsyncClient,
        employee_token: str,
    ) -> None:
        """Employee cannot list all users → 403."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        resp = await client.get("/api/users/", headers=headers)
        assert resp.status_code == 403, resp.text

    async def test_manager_can_access_summary(
        self,
        client: AsyncClient,
        manager_user: dict,
        manager_token: str,
    ) -> None:
        """Manager can access /api/stats/summary → 200."""
        resp = await client.get(
            "/api/stats/summary",
            params={"employee_id": str(manager_user["id"])},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 200, (
            f"Manager should access summary, got {resp.status_code}: {resp.text}"
        )

    async def test_manager_can_list_users(
        self,
        client: AsyncClient,
        manager_token: str,
    ) -> None:
        """Manager can list users → 200."""
        resp = await client.get(
            "/api/users/",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 200, resp.text

    async def test_manager_cannot_create_user(
        self,
        client: AsyncClient,
        manager_token: str,
    ) -> None:
        """Manager cannot create users (admin only) → 403."""
        resp = await client.post(
            "/api/users/",
            json={"username": "manager_created", "password": "pass123", "role": "employee"},
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp.status_code == 403, resp.text

    async def test_employee_can_access_own_stats(
        self,
        client: AsyncClient,
        employee_user: dict,
        employee_token: str,
    ) -> None:
        """Employee can access their own stats → 200."""
        resp = await client.get(
            "/api/stats/summary",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200, (
            f"Employee should access own summary, got: {resp.status_code}: {resp.text}"
        )


class TestImportHistoryLogged:
    async def test_import_history_logged(
        self,
        client: AsyncClient,
        admin_headers: dict,
        admin_user: dict,
        sample_excel_path: Path,
        db: AsyncSession,
    ) -> None:
        """
        After uploading a file, GET /api/files/history must contain the upload record
        with correct fields: filename, uploaded_by, status, logs.
        """
        # Upload file
        with open(sample_excel_path, "rb") as f:
            resp_upload = await client.post(
                "/api/files/upload",
                files={"file": (sample_excel_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers=admin_headers,
            )
        assert resp_upload.status_code == 200, resp_upload.text

        # Check import history
        resp_history = await client.get("/api/files/history", headers=admin_headers)
        assert resp_history.status_code == 200, resp_history.text
        history_data = resp_history.json()

        assert history_data["total"] > 0, "Import history should not be empty after upload"
        items = history_data["items"]
        assert len(items) > 0

        # Find our upload (most recent)
        latest = items[0]
        assert latest["filename"] == sample_excel_path.name, (
            f"Expected filename '{sample_excel_path.name}', got '{latest['filename']}'"
        )
        assert latest["status"] in ("success", "partial", "failed")
        assert latest["logs"] is not None
        assert "inserted" in latest["logs"]
        assert "total" in latest["logs"]

        # Cleanup test upload records
        async with _TestSession() as session:
            await session.execute(
                delete(ImportHistory).where(ImportHistory.uploaded_by == admin_user["id"])
            )
            # Also clean up fuzzy-created employees and their logs
            from sqlalchemy import select as sa_select
            from app.db.models import User as UserModel
            result = await session.execute(
                sa_select(UserModel.id).where(UserModel.username.like("emp_%"))
            )
            emp_ids = [row[0] for row in result.all()]
            if emp_ids:
                await session.execute(
                    delete(AttendanceLog).where(AttendanceLog.employee_id.in_(emp_ids))
                )
                await session.execute(delete(UserModel).where(UserModel.id.in_(emp_ids)))
            await session.commit()
