"""
Phase 6 — Analytics / Statistics Tests.

Tests:
  - test_stats_summary     : GET /api/stats/summary → AttendanceSummary schema
  - test_stats_calendar    : GET /api/stats/calendar → list[DailyStatus]
  - test_stats_heatmap     : GET /api/stats/heatmap → list[HeatmapCell]
  - test_stats_top_late    : GET /api/stats/top-late → list sorted by late_count DESC
  - test_stats_checkpoints : GET /api/stats/checkpoints → list[CheckpointLoad]
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AttendanceLog, ImportHistory, User
from tests.conftest import _TestSession


# ---------------------------------------------------------------------------
# Module-scoped fixture: seed attendance data for stats tests
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="module")
async def stats_employee() -> dict:
    """
    Create a dedicated employee with known attendance data for stats tests.
    Data: 5 entries on weekdays in 2026-01, some late (after 09:00).
    """
    uid_short = uuid.uuid4().hex[:8]
    emp_name = f"Stats Employee {uid_short}"
    emp_username = f"qa_stats_emp_{uid_short}"

    async with _TestSession() as session:
        emp = User(
            username=emp_username,
            password_hash="",
            role="employee",
            full_name=emp_name,
            is_active=True,
        )
        session.add(emp)
        await session.commit()
        await session.refresh(emp)
        emp_id = emp.id

        # 5 entries (Mon–Fri, 2026-01-05 to 2026-01-09)
        # Days 1, 2, 3: on time (08:50)
        # Days 4, 5: late (09:20)
        logs = []
        for day_offset, hour, minute in [
            (0, 8, 50),   # Mon on time
            (1, 8, 45),   # Tue on time
            (2, 8, 55),   # Wed on time
            (3, 9, 20),   # Thu late
            (4, 9, 25),   # Fri late
        ]:
            entry_dt = datetime(2026, 1, 5 + day_offset, hour, minute, 0, tzinfo=timezone.utc)
            exit_dt = datetime(2026, 1, 5 + day_offset, 18, 0, 0, tzinfo=timezone.utc)
            logs.append(AttendanceLog(
                employee_id=emp_id,
                raw_name=emp_name,
                event_time=entry_dt,
                event_type="entry",
                checkpoint="Вход А",
            ))
            logs.append(AttendanceLog(
                employee_id=emp_id,
                raw_name=emp_name,
                event_time=exit_dt,
                event_type="exit",
                checkpoint="Вход А",
            ))

        session.add_all(logs)
        await session.commit()

    yield {"id": emp_id, "username": emp_username, "name": emp_name}

    async with _TestSession() as session:
        await session.execute(delete(AttendanceLog).where(AttendanceLog.employee_id == emp_id))
        await session.execute(delete(User).where(User.id == emp_id))
        await session.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestStatsSummary:
    async def test_stats_summary_structure(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """
        GET /api/stats/summary with employee_id and date range.
        Verify all required fields are present and types are correct.
        """
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/summary",
            params={
                "employee_id": str(emp_id),
                "date_from": "2026-01-05",
                "date_to": "2026-01-09",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Required fields
        assert "attendance_pct" in data
        assert "avg_arrival" in data
        assert "avg_departure" in data
        assert "late_count" in data
        assert "overtime_count" in data
        assert "avg_duration_minutes" in data

        # Type checks
        assert isinstance(data["attendance_pct"], (int, float))
        assert isinstance(data["late_count"], int)
        assert isinstance(data["overtime_count"], int)

    async def test_stats_summary_values(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """
        Summary with known data: 5 worked days in 2026-01-05 to 2026-01-09 (5 workdays).
        2 late entries (09:20, 09:25 > 09:15 threshold).
        """
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/summary",
            params={
                "employee_id": str(emp_id),
                "date_from": "2026-01-05",
                "date_to": "2026-01-09",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # 5 worked days out of 5 workdays = 100%
        assert data["attendance_pct"] == 100.0, f"Expected 100%, got {data['attendance_pct']}"
        # 2 late entries
        assert data["late_count"] == 2, f"Expected 2 late days, got {data['late_count']}"

    async def test_stats_summary_no_data(
        self,
        client: AsyncClient,
        admin_headers: dict,
        admin_user: dict,
    ) -> None:
        """Summary for admin user with no attendance data returns 0s."""
        resp = await client.get(
            "/api/stats/summary",
            params={
                "employee_id": str(admin_user["id"]),
                "date_from": "2020-01-01",
                "date_to": "2020-01-31",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["attendance_pct"] == 0.0
        assert data["late_count"] == 0

    async def test_stats_summary_unauthorized(self, client: AsyncClient) -> None:
        """Summary without token → 401."""
        resp = await client.get("/api/stats/summary")
        assert resp.status_code == 401, resp.text


class TestStatsCalendar:
    async def test_stats_calendar_structure(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """
        GET /api/stats/calendar for January 2026.
        Must return list of DailyStatus with valid fields.
        """
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/calendar",
            params={"employee_id": str(emp_id), "year": 2026, "month": 1},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert isinstance(data, list)

        valid_statuses = {"normal", "late", "absent", "weekend"}
        for item in data:
            assert "date" in item
            assert "status" in item
            assert item["status"] in valid_statuses, f"Unexpected status: {item['status']}"

    async def test_stats_calendar_has_weekends(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """Calendar for January 2026 must include weekend entries."""
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/calendar",
            params={"employee_id": str(emp_id), "year": 2026, "month": 1},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        statuses = [item["status"] for item in resp.json()]
        assert "weekend" in statuses, "January 2026 must contain weekend entries"

    async def test_stats_calendar_holidays_as_weekend(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """New Year holidays and transferred days show as weekend, not absent."""
        emp_id = stats_employee["id"]
        # Январь 2026: 1–2 января без явки — выходной (праздник)
        resp = await client.get(
            "/api/stats/calendar",
            params={"employee_id": str(emp_id), "year": 2026, "month": 1},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        date_map = {item["date"]: item["status"] for item in resp.json()}
        assert date_map.get("2026-01-01") == "weekend"
        assert date_map.get("2026-01-02") == "weekend"

        # Март 2026: 9 марта — перенесённый выходной (8 марта в воскресенье)
        resp2 = await client.get(
            "/api/stats/calendar",
            params={"employee_id": str(emp_id), "year": 2026, "month": 3},
            headers=admin_headers,
        )
        assert resp2.status_code == 200, resp2.text
        date_map2 = {item["date"]: item["status"] for item in resp2.json()}
        assert date_map2.get("2026-03-09") == "weekend", (
            "9 March 2026 (transferred day off) should be weekend"
        )

    async def test_stats_calendar_worked_days_present(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """Days 2026-01-05 to 09 should have normal/late status (not absent)."""
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/calendar",
            params={"employee_id": str(emp_id), "year": 2026, "month": 1},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        date_map = {item["date"]: item["status"] for item in resp.json()}

        # First 3 days should be normal (on time)
        for day in ["2026-01-05", "2026-01-06", "2026-01-07"]:
            assert date_map.get(day) == "normal", (
                f"Expected 'normal' for {day}, got '{date_map.get(day)}'"
            )
        # Last 2 days should be late
        for day in ["2026-01-08", "2026-01-09"]:
            assert date_map.get(day) == "late", (
                f"Expected 'late' for {day}, got '{date_map.get(day)}'"
            )


class TestStatsHeatmap:
    async def test_stats_heatmap_structure(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """
        GET /api/stats/heatmap → list of HeatmapCell.
        Each cell has day_of_week (0–6), hour (0–23), intensity (int > 0).
        """
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/heatmap",
            params={
                "employee_id": str(emp_id),
                "date_from": "2026-01-01",
                "date_to": "2026-01-31",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Expected heatmap cells, got empty list"

        for cell in data:
            assert "day_of_week" in cell
            assert "hour" in cell
            assert "intensity" in cell
            assert 0 <= cell["day_of_week"] <= 6
            assert 0 <= cell["hour"] <= 23
            assert cell["intensity"] > 0

    async def test_stats_heatmap_empty_range(
        self,
        client: AsyncClient,
        admin_headers: dict,
        stats_employee: dict,
    ) -> None:
        """Heatmap for range with no data returns empty list (not error)."""
        emp_id = stats_employee["id"]
        resp = await client.get(
            "/api/stats/heatmap",
            params={
                "employee_id": str(emp_id),
                "date_from": "2020-01-01",
                "date_to": "2020-01-31",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == []


class TestStatsTopLate:
    async def test_stats_top_late_structure(
        self,
        client: AsyncClient,
        admin_headers: dict,
    ) -> None:
        """
        GET /api/stats/top-late → list of TopLateEmployee.
        Each item has employee_id, full_name, late_count.
        """
        resp = await client.get(
            "/api/stats/top-late",
            params={"limit": 5, "date_from": "2026-01-01", "date_to": "2026-01-31"},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) <= 5, f"Expected at most 5 items (limit=5), got {len(data)}"

        for item in data:
            assert "employee_id" in item
            assert "late_count" in item
            assert item["late_count"] > 0

    async def test_stats_top_late_sorted(
        self,
        client: AsyncClient,
        admin_headers: dict,
    ) -> None:
        """Top-late list must be sorted by late_count DESC."""
        resp = await client.get(
            "/api/stats/top-late",
            params={"limit": 10, "date_from": "2026-01-01", "date_to": "2026-01-31"},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        if len(data) >= 2:
            counts = [item["late_count"] for item in data]
            assert counts == sorted(counts, reverse=True), (
                f"Top-late must be sorted DESC by late_count, got: {counts}"
            )

    async def test_stats_top_late_limit(
        self,
        client: AsyncClient,
        admin_headers: dict,
    ) -> None:
        """top-late with limit=3 returns at most 3 items."""
        resp = await client.get(
            "/api/stats/top-late",
            params={"limit": 3},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) <= 3

    async def test_stats_top_late_unauthorized(self, client: AsyncClient) -> None:
        """top-late without token → 401."""
        resp = await client.get("/api/stats/top-late")
        assert resp.status_code == 401, resp.text

    async def test_stats_top_late_employee_forbidden(
        self,
        client: AsyncClient,
        employee_token: str,
    ) -> None:
        """Employee cannot access top-late → 403."""
        resp = await client.get(
            "/api/stats/top-late",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403, resp.text


class TestStatsCheckpoints:
    async def test_stats_checkpoints_structure(
        self,
        client: AsyncClient,
        admin_headers: dict,
    ) -> None:
        """
        GET /api/stats/checkpoints → list of CheckpointLoad.
        Each item has checkpoint (str) and count (int > 0).
        """
        resp = await client.get(
            "/api/stats/checkpoints",
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert isinstance(data, list)

        for item in data:
            assert "checkpoint" in item
            assert "count" in item
            assert isinstance(item["checkpoint"], str)
            assert isinstance(item["count"], int)
            assert item["count"] > 0

    async def test_stats_checkpoints_sum_matches_total(
        self,
        client: AsyncClient,
        admin_headers: dict,
        db: AsyncSession,
    ) -> None:
        """
        Sum of checkpoint counts must equal total attendance_logs in the date range.
        Uses default date range (last 30 days).
        """
        resp = await client.get(
            "/api/stats/checkpoints",
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        checkpoint_total = sum(item["count"] for item in data)

        # Query total attendance logs in default range (last 30 days)
        from datetime import date, timedelta
        from sqlalchemy import text

        today = date.today()
        dt_from = datetime(today.year, today.month, today.day, tzinfo=timezone.utc) - timedelta(days=30)
        dt_to = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=timezone.utc)

        count_result = await db.execute(
            select(func.count()).select_from(AttendanceLog).where(
                AttendanceLog.event_time.between(dt_from, dt_to)
            )
        )
        db_total = count_result.scalar()

        assert checkpoint_total == db_total, (
            f"Sum of checkpoint counts ({checkpoint_total}) must equal "
            f"total DB records in range ({db_total})"
        )

    async def test_stats_checkpoints_employee_forbidden(
        self,
        client: AsyncClient,
        employee_token: str,
    ) -> None:
        """Employee cannot access checkpoints → 403."""
        resp = await client.get(
            "/api/stats/checkpoints",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403, resp.text
