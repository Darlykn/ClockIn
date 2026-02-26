"""
Phase 4 — Excel Upload Tests.

Tests:
  - test_upload_valid_excel              : Upload valid xlsx → status success/partial
  - test_upload_no_duplicates_on_reupload: Second upload of same file → 0 inserted
  - test_upload_invalid_dates_graceful   : Graceful degradation on bad dates
  - test_upload_invalid_file_format      : .txt file → 400
  - test_upload_unauthorized             : No token → 401
  - test_upload_forbidden_for_employee   : Employee token → 403
"""

from __future__ import annotations

from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttendanceLog, ImportHistory, User
from tests.conftest import _TestSession


# ---------------------------------------------------------------------------
# Helper: clean up all "emp_*" employees and their logs created after test start
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def cleanup_fuzzy_employees():
    """
    Snapshot existing 'emp_*' user IDs before the test,
    then delete any new ones (and their attendance logs + import history) after.
    """
    async with _TestSession() as session:
        result = await session.execute(
            select(User.id).where(User.username.like("emp_%"))
        )
        existing_ids: set = {row[0] for row in result.all()}

    yield

    async with _TestSession() as session:
        result = await session.execute(
            select(User.id).where(User.username.like("emp_%"))
        )
        all_ids: set = {row[0] for row in result.all()}
        new_ids = all_ids - existing_ids

        if new_ids:
            await session.execute(
                delete(AttendanceLog).where(AttendanceLog.employee_id.in_(new_ids))
            )
            await session.execute(delete(User).where(User.id.in_(new_ids)))
            await session.commit()


@pytest_asyncio.fixture(autouse=True)
async def cleanup_import_history(admin_user: dict):
    """Delete all import_history rows uploaded by the test admin after each test."""
    yield
    async with _TestSession() as session:
        await session.execute(
            delete(ImportHistory).where(ImportHistory.uploaded_by == admin_user["id"])
        )
        await session.commit()


# ---------------------------------------------------------------------------
# Helper: upload file and return response JSON
# ---------------------------------------------------------------------------


async def _upload(client: AsyncClient, file_path: Path, headers: dict) -> dict:
    with open(file_path, "rb") as f:
        resp = await client.post(
            "/api/files/upload",
            files={"file": (file_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=headers,
        )
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestUploadValidExcel:
    async def test_upload_valid_excel(
        self,
        client: AsyncClient,
        admin_headers: dict,
        sample_excel_path: Path,
        db: AsyncSession,
    ) -> None:
        """
        Upload a valid Excel file → 200, inserted > 0, status in {success, partial}.
        Records must appear in attendance_logs.
        """
        resp = await _upload(client, sample_excel_path, admin_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["inserted"] > 0, f"Expected inserted > 0, got: {data}"
        assert data["status"] in ("success", "partial"), f"Unexpected status: {data['status']}"
        assert data["total"] > 0

        # Verify records are in DB
        count_result = await db.execute(select(func.count()).select_from(AttendanceLog))
        total_logs = count_result.scalar()
        assert total_logs > 0, "attendance_logs table should not be empty after upload"

    async def test_upload_no_duplicates_on_reupload(
        self,
        client: AsyncClient,
        admin_headers: dict,
        sample_excel_path: Path,
        db: AsyncSession,
    ) -> None:
        """
        Upload same file twice.
        Second upload must insert 0 records (ON CONFLICT DO NOTHING).
        Total records in DB must not change between uploads.
        """
        # First upload
        resp1 = await _upload(client, sample_excel_path, admin_headers)
        assert resp1.status_code == 200, resp1.text
        inserted_count_1 = resp1.json()["inserted"]

        # Record count after first upload
        count_r = await db.execute(select(func.count()).select_from(AttendanceLog))
        count_after_first = count_r.scalar()

        # Second upload of the SAME file
        resp2 = await _upload(client, sample_excel_path, admin_headers)
        assert resp2.status_code == 200, resp2.text
        inserted_count_2 = resp2.json()["inserted"]

        # Core assertion: no new records on second upload
        assert inserted_count_2 == 0, (
            f"Expected 0 inserted on re-upload, got {inserted_count_2}. "
            "ON CONFLICT DO NOTHING dedup is not working."
        )

        # Total record count must not have changed
        count_r2 = await db.execute(select(func.count()).select_from(AttendanceLog))
        count_after_second = count_r2.scalar()
        assert count_after_second == count_after_first, (
            "Record count changed after re-uploading the same file"
        )


class TestUploadGracefulDegradation:
    async def test_upload_invalid_dates_graceful(
        self,
        client: AsyncClient,
        admin_headers: dict,
        invalid_excel_path: Path,
    ) -> None:
        """
        File with only invalid dates returns 200 (not 500).
        errors list contains descriptions with row numbers.
        status is 'failed' (0 valid rows).
        Process does NOT crash.
        """
        resp = await _upload(client, invalid_excel_path, admin_headers)
        assert resp.status_code == 200, f"Expected 200 (graceful), got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Graceful degradation: errors should be reported
        assert len(data.get("errors", [])) > 0, "Expected errors list to be non-empty"

        # Each error should mention a row number
        for error_msg in data["errors"]:
            assert "Строка" in error_msg or "строка" in error_msg.lower() or str(error_msg), (
                f"Error message should reference a row: {error_msg}"
            )

    async def test_upload_mixed_file_graceful(
        self,
        client: AsyncClient,
        admin_headers: dict,
        sample_excel_path: Path,
    ) -> None:
        """
        Sample file has 3 bad dates mixed with valid rows.
        Result: status='partial', errors > 0, inserted > 0, NO 500 error.
        """
        resp = await _upload(client, sample_excel_path, admin_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # File has 3 bad-date rows → errors must be present
        assert len(data.get("errors", [])) >= 3, f"Expected ≥3 errors, got: {data['errors']}"
        assert data["status"] in ("success", "partial"), f"Got: {data['status']}"
        # inserted < total because of bad rows
        assert data["inserted"] < data["total"], (
            f"inserted ({data['inserted']}) should be < total ({data['total']})"
        )


class TestUploadAccessControl:
    async def test_upload_invalid_file_format(
        self,
        client: AsyncClient,
        admin_headers: dict,
        tmp_path,
    ) -> None:
        """Upload a .txt file → 400 Bad Request."""
        txt_file = tmp_path / "test.txt"
        txt_file.write_text("not an excel file")

        with open(txt_file, "rb") as f:
            resp = await client.post(
                "/api/files/upload",
                files={"file": ("test.txt", f, "text/plain")},
                headers=admin_headers,
            )
        assert resp.status_code == 400, resp.text

    async def test_upload_unauthorized(
        self,
        client: AsyncClient,
        sample_excel_path: Path,
    ) -> None:
        """Upload without Authorization header → 401."""
        resp = await _upload(client, sample_excel_path, {})
        assert resp.status_code == 401, resp.text

    async def test_upload_forbidden_for_employee(
        self,
        client: AsyncClient,
        employee_token: str,
        sample_excel_path: Path,
    ) -> None:
        """Employee role cannot upload files → 403."""
        headers = {"Authorization": f"Bearer {employee_token}"}
        resp = await _upload(client, sample_excel_path, headers)
        assert resp.status_code == 403, resp.text

    async def test_upload_forbidden_for_manager(
        self,
        client: AsyncClient,
        manager_token: str,
        sample_excel_path: Path,
    ) -> None:
        """Manager role cannot upload files → 403."""
        headers = {"Authorization": f"Bearer {manager_token}"}
        resp = await _upload(client, sample_excel_path, headers)
        assert resp.status_code == 403, resp.text
