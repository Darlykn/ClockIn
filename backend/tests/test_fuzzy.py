"""
Phase 5 — Fuzzy Name Normalization Tests.

Tests:
  - test_fuzzy_match_similar_names   : Extra spaces → same employee linked (no new user)
  - test_fuzzy_no_match_different_names : Different name → new employee created
"""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

import openpyxl
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttendanceLog, ImportHistory, User
from tests.conftest import _TestSession, FIXTURES_DIR


# ---------------------------------------------------------------------------
# Cleanup autouse: remove emp_* users created during this module's tests
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def cleanup_after_test(admin_user: dict):
    """Snapshot emp_* users before test, remove new ones after."""
    async with _TestSession() as session:
        result = await session.execute(
            select(User.id).where(User.username.like("emp_%"))
        )
        before_ids: set = {row[0] for row in result.all()}

    yield

    async with _TestSession() as session:
        result = await session.execute(
            select(User.id).where(User.username.like("emp_%"))
        )
        after_ids: set = {row[0] for row in result.all()}
        new_ids = after_ids - before_ids

        if new_ids:
            await session.execute(
                delete(AttendanceLog).where(AttendanceLog.employee_id.in_(new_ids))
            )
            await session.execute(delete(User).where(User.id.in_(new_ids)))

        # Also clean import history for test admin
        await session.execute(
            delete(ImportHistory).where(ImportHistory.uploaded_by == admin_user["id"])
        )
        await session.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_excel_with_names(names_and_dates: list[tuple[str, str]]) -> Path:
    """Create a temp Excel file with specified (name, datetime_str) pairs."""
    path = FIXTURES_DIR / f"fuzzy_test_{uuid.uuid4().hex[:8]}.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["ФИО", "Время", "Событие", "Точка"])
    for name, dt_str in names_and_dates:
        ws.append([name, dt_str, "вход", "Вход А"])
    wb.save(str(path))
    return path


async def _upload_excel(client: AsyncClient, path: Path, headers: dict):
    with open(path, "rb") as f:
        resp = await client.post(
            "/api/files/upload",
            files={"file": (path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=headers,
        )
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestFuzzyMatchSimilarNames:
    async def test_fuzzy_match_similar_names(
        self,
        client: AsyncClient,
        admin_headers: dict,
        db: AsyncSession,
    ) -> None:
        """
        Upload an Excel row with trailing space in name.
        Fuzzy matching (token_sort_ratio ≥ 90%) links it to the EXISTING employee.
        No new employee user should be created.

        Uses a unique QA-prefixed name to avoid collision with seed data.
        """
        uid_short = uuid.uuid4().hex[:8]
        exact_name = f"QA Тестов {uid_short}"
        fuzzy_name = f"QA Тестов {uid_short} "  # trailing space

        # Create employee with exact name
        emp = User(
            username=f"emp_{uid_short}",
            password_hash="",
            role="employee",
            full_name=exact_name,
            is_active=True,
        )
        db.add(emp)
        await db.commit()
        await db.refresh(emp)
        emp_id = emp.id

        # Upload Excel with fuzzy name variant (trailing space)
        # Use day=15 (unambiguous with dayfirst=True)
        dt_str = "2026-02-15 08:00:00"
        path = _make_excel_with_names([(fuzzy_name, dt_str)])
        resp = await _upload_excel(client, path, admin_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["inserted"] == 1, f"Expected 1 inserted, got: {data}"

        # Verify the log is linked to OUR SPECIFIC employee
        # (no seed employee has this unique name, so only our employee can match)
        result = await db.execute(
            select(AttendanceLog).where(AttendanceLog.employee_id == emp_id)
        )
        logs = result.scalars().all()
        assert len(logs) > 0, (
            f"Expected attendance_log to be linked to existing employee (id={emp_id}), "
            "but no logs found. Fuzzy matching may have created a new user instead."
        )

        # Verify no NEW employee was created with the cleaned fuzzy name
        cleaned_fuzzy = fuzzy_name.strip()
        new_result = await db.execute(
            select(User).where(
                User.full_name == cleaned_fuzzy,
                User.id != emp_id,
            )
        )
        duplicate = new_result.scalar_one_or_none()
        assert duplicate is None, (
            f"Fuzzy matching created a NEW user for '{cleaned_fuzzy}' "
            f"instead of reusing existing '{exact_name}'"
        )

        # Cleanup
        await db.execute(delete(AttendanceLog).where(AttendanceLog.employee_id == emp_id))
        await db.delete(emp)
        await db.commit()

    async def test_fuzzy_match_double_space(
        self,
        client: AsyncClient,
        admin_headers: dict,
        db: AsyncSession,
    ) -> None:
        """Double space in middle of name still matches (token_sort_ratio ≥ 90%)."""
        uid_short = uuid.uuid4().hex[:8]
        exact_name = f"QA Иванов {uid_short}"
        fuzzy_name = f"QA  Иванов {uid_short}"  # double space at the start

        emp = User(
            username=f"emp_{uid_short}",
            password_hash="",
            role="employee",
            full_name=exact_name,
            is_active=True,
        )
        db.add(emp)
        await db.commit()
        await db.refresh(emp)
        emp_id = emp.id

        dt_str = "2026-02-16 09:00:00"
        path = _make_excel_with_names([(fuzzy_name, dt_str)])
        resp = await _upload_excel(client, path, admin_headers)
        assert resp.status_code == 200, resp.text

        result = await db.execute(
            select(AttendanceLog).where(AttendanceLog.employee_id == emp_id)
        )
        logs = result.scalars().all()
        assert len(logs) > 0, (
            "Fuzzy match (double space) should link to existing employee"
        )

        # Cleanup
        await db.execute(delete(AttendanceLog).where(AttendanceLog.employee_id == emp_id))
        await db.delete(emp)
        await db.commit()


class TestFuzzyNoMatchDifferentNames:
    async def test_fuzzy_no_match_different_names(
        self,
        client: AsyncClient,
        admin_headers: dict,
        db: AsyncSession,
    ) -> None:
        """
        Upload Excel with a completely different name.
        Fuzzy score < 90% → NEW employee user created.

        Uses unique QA-prefixed names to avoid collision with seed data.
        """
        uid_existing = uuid.uuid4().hex[:8]
        uid_new = uuid.uuid4().hex[:8]
        existing_name = f"QA Существующий {uid_existing}"
        different_name = f"QA Совсем Другой {uid_new}"

        existing_emp = User(
            username=f"emp_{uid_existing}",
            password_hash="",
            role="employee",
            full_name=existing_name,
            is_active=True,
        )
        db.add(existing_emp)
        await db.commit()
        await db.refresh(existing_emp)
        existing_emp_id = existing_emp.id

        dt_str = "2026-02-17 08:30:00"
        path = _make_excel_with_names([(different_name, dt_str)])
        resp = await _upload_excel(client, path, admin_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["inserted"] == 1

        # Verify the log is NOT linked to the existing employee
        result = await db.execute(
            select(AttendanceLog).where(AttendanceLog.employee_id == existing_emp_id)
        )
        logs_for_existing = result.scalars().all()
        assert len(logs_for_existing) == 0, (
            f"Log should NOT be linked to '{existing_name}', but was"
        )

        # Verify a NEW employee was created
        new_result = await db.execute(
            select(User).where(User.full_name == different_name)
        )
        new_emp = new_result.scalar_one_or_none()
        assert new_emp is not None, (
            f"Expected a new user to be created for '{different_name}', but none found"
        )
        assert new_emp.id != existing_emp_id

        # Cleanup
        await db.execute(delete(AttendanceLog).where(AttendanceLog.employee_id == new_emp.id))
        await db.delete(new_emp)
        await db.execute(delete(AttendanceLog).where(AttendanceLog.employee_id == existing_emp_id))
        await db.delete(existing_emp)
        await db.commit()
