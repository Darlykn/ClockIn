"""
Analytics API routes.

All queries work directly via SQLAlchemy text() or ORM expressions
against PostgreSQL-specific functions (EXTRACT, DATE_TRUNC, etc.).
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.middleware import get_current_user, require_role
from app.db.models import AttendanceLog, User
from app.holidays import is_holiday, warm_cache_for_month
from app.db.session import get_db
from app.schemas.stats import (
    AttendanceSummary,
    AttendanceLogEntry,
    CheckpointLoad,
    DailyStatus,
    HeatmapCell,
    TopLateEmployee,
    TrendPoint,
)

router = APIRouter()

_LATE_TIME = time(9, 0, 0)
_OVERTIME_TIME = time(18, 0, 0)


def _parse_date(val: str | None, default: date) -> date:
    if val is None:
        return default
    return date.fromisoformat(val)


@router.get(
    "/summary",
    response_model=AttendanceSummary,
    summary="Attendance summary metrics",
)
async def get_summary(
    employee_id: uuid.UUID | None = Query(default=None),
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AttendanceSummary:
    df = _parse_date(date_from, date.today() - timedelta(days=30))
    dt = _parse_date(date_to, date.today())
    eid = _resolve_employee_id(employee_id, current_user)

    dt_from = datetime(df.year, df.month, df.day, tzinfo=timezone.utc)
    dt_to = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)

    late_minutes = settings.LATE_YELLOW_MINUTES
    late_sec = late_minutes * 60 + 9 * 3600
    overtime_sec = 18 * 3600

    if eid is None:
        # Aggregate across all employees (admin "all employees" view)
        # Exclude "Временный пропуск" employees from aggregate stats
        query = text(
            """
            WITH daily AS (
                SELECT
                    DATE(event_time AT TIME ZONE 'UTC') AS day,
                    a.employee_id,
                    MIN(event_time AT TIME ZONE 'UTC')  AS first_entry,
                    MAX(event_time AT TIME ZONE 'UTC')  AS last_exit
                FROM attendance_logs a
                JOIN users u ON a.employee_id = u.id
                WHERE event_time BETWEEN :dt_from AND :dt_to
                  AND u.full_name NOT ILIKE '%%Временный пропуск%%'
                GROUP BY DATE(event_time AT TIME ZONE 'UTC'), a.employee_id
            )
            SELECT
                COUNT(*)                                             AS worked_days,
                (SELECT COUNT(DISTINCT a.employee_id) FROM attendance_logs a
                 JOIN users u ON a.employee_id = u.id
                 WHERE event_time BETWEEN :dt_from AND :dt_to
                   AND u.full_name NOT ILIKE '%%Временный пропуск%%')  AS total_employees,
                AVG(EXTRACT(EPOCH FROM first_entry::time))           AS avg_arrival_sec,
                AVG(EXTRACT(EPOCH FROM last_exit::time))             AS avg_departure_sec,
                SUM(CASE WHEN EXTRACT(EPOCH FROM first_entry::time) > :late_sec THEN 1 ELSE 0 END)
                                                                     AS late_count,
                SUM(CASE WHEN EXTRACT(EPOCH FROM last_exit::time) > :overtime_sec THEN 1 ELSE 0 END)
                                                                     AS overtime_count,
                AVG(EXTRACT(EPOCH FROM (last_exit - first_entry)))   AS avg_duration_sec
            FROM daily
            """
        )
        result = await db.execute(
            query,
            {
                "dt_from": dt_from,
                "dt_to": dt_to,
                "late_sec": late_sec,
                "overtime_sec": overtime_sec,
            },
        )
        row = result.mappings().one()

        worked_days = int(row["worked_days"] or 0)
        total_employees = int(row["total_employees"] or 0)
        # Count workdays only in months that have actual data (exclude empty months)
        months_q = text(
            """
            SELECT DISTINCT
                EXTRACT(YEAR FROM event_time AT TIME ZONE 'UTC')::int  AS y,
                EXTRACT(MONTH FROM event_time AT TIME ZONE 'UTC')::int AS m
            FROM attendance_logs a
            JOIN users u ON a.employee_id = u.id
            WHERE event_time BETWEEN :dt_from AND :dt_to
              AND u.full_name NOT ILIKE '%%Временный пропуск%%'
            """
        )
        months_res = await db.execute(months_q, {"dt_from": dt_from, "dt_to": dt_to})
        data_months = {(r["y"], r["m"]) for r in months_res.mappings().all()}
        total_workdays = _count_workdays_for_months(df, dt, data_months) * total_employees if total_employees > 0 else 0
    else:
        query = text(
            """
            WITH daily AS (
                SELECT
                    DATE(event_time AT TIME ZONE 'UTC') AS day,
                    MIN(event_time AT TIME ZONE 'UTC')  AS first_entry,
                    MAX(event_time AT TIME ZONE 'UTC')  AS last_exit
                FROM attendance_logs
                WHERE employee_id = :eid
                  AND event_time BETWEEN :dt_from AND :dt_to
                GROUP BY DATE(event_time AT TIME ZONE 'UTC')
            )
            SELECT
                COUNT(*)                                             AS worked_days,
                AVG(EXTRACT(EPOCH FROM first_entry::time))          AS avg_arrival_sec,
                AVG(EXTRACT(EPOCH FROM last_exit::time))            AS avg_departure_sec,
                SUM(CASE WHEN EXTRACT(EPOCH FROM first_entry::time) > :late_sec THEN 1 ELSE 0 END)
                                                                    AS late_count,
                SUM(CASE WHEN EXTRACT(EPOCH FROM last_exit::time) > :overtime_sec THEN 1 ELSE 0 END)
                                                                    AS overtime_count,
                AVG(EXTRACT(EPOCH FROM (last_exit - first_entry)))  AS avg_duration_sec
            FROM daily
            """
        )
        result = await db.execute(
            query,
            {
                "eid": str(eid),
                "dt_from": dt_from,
                "dt_to": dt_to,
                "late_sec": late_sec,
                "overtime_sec": overtime_sec,
            },
        )
        row = result.mappings().one()

        worked_days = int(row["worked_days"] or 0)
        # Count workdays only in months that have data for this employee
        emp_months_q = text(
            """
            SELECT DISTINCT
                EXTRACT(YEAR FROM event_time AT TIME ZONE 'UTC')::int  AS y,
                EXTRACT(MONTH FROM event_time AT TIME ZONE 'UTC')::int AS m
            FROM attendance_logs
            WHERE employee_id = :eid
              AND event_time BETWEEN :dt_from AND :dt_to
            """
        )
        emp_months_res = await db.execute(emp_months_q, {"eid": str(eid), "dt_from": dt_from, "dt_to": dt_to})
        emp_data_months = {(r["y"], r["m"]) for r in emp_months_res.mappings().all()}
        total_workdays = _count_workdays_for_months(df, dt, emp_data_months)

    attendance_pct = round(worked_days / total_workdays * 100, 1) if total_workdays > 0 else 0.0

    avg_arrival = _sec_to_time(row["avg_arrival_sec"])
    avg_departure = _sec_to_time(row["avg_departure_sec"])
    avg_duration_hours = (
        round(float(row["avg_duration_sec"]) / 3600, 1)
        if row["avg_duration_sec"] is not None
        else None
    )

    return AttendanceSummary(
        attendance_pct=attendance_pct,
        avg_arrival_time=avg_arrival,
        avg_departure_time=avg_departure,
        late_count=int(row["late_count"] or 0),
        overtime_count=int(row["overtime_count"] or 0),
        avg_duration_hours=avg_duration_hours,
    )


@router.get(
    "/calendar",
    response_model=list[DailyStatus],
    summary="Daily status for Calendar View",
)
async def get_calendar(
    employee_id: uuid.UUID | None = Query(default=None),
    year: int = Query(default=None),
    month: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DailyStatus]:
    today = date.today()
    y = year or today.year
    m = month or today.month
    eid = _resolve_employee_id(employee_id, current_user) or current_user.id

    dt_from = datetime(y, m, 1, tzinfo=timezone.utc)
    if m == 12:
        dt_to = datetime(y + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    else:
        dt_to = datetime(y, m + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)

    query = text(
        """
        SELECT
            DATE(event_time AT TIME ZONE 'UTC') AS day,
            MIN(event_time AT TIME ZONE 'UTC')  AS first_entry
        FROM attendance_logs
        WHERE employee_id = :eid
          AND event_type = 'entry'
          AND event_time BETWEEN :dt_from AND :dt_to
        GROUP BY DATE(event_time AT TIME ZONE 'UTC')
        """
    )
    result = await db.execute(query, {"eid": str(eid), "dt_from": dt_from, "dt_to": dt_to})
    rows = {r["day"]: r["first_entry"].time() for r in result.mappings().all()}

    # Single-month view: if there is any data this month, all workdays are fair game
    has_data_this_month = len(rows) > 0

    await warm_cache_for_month(y, m)

    statuses: list[DailyStatus] = []
    cur = dt_from.date()
    end = dt_to.date()
    late_threshold = time(9, settings.LATE_YELLOW_MINUTES, 0)

    while cur <= end:
        if cur.weekday() >= 5:
            statuses.append(DailyStatus(date=cur, status="weekend"))
        elif is_holiday(cur) and cur not in rows:
            # Праздник/перенос без явки — показываем как выходной, не прогул
            statuses.append(DailyStatus(date=cur, status="weekend"))
        elif cur in rows:
            arrival = rows[cur]
            if arrival <= late_threshold:
                statuses.append(DailyStatus(date=cur, status="normal", first_entry=arrival))
            else:
                statuses.append(DailyStatus(date=cur, status="late", first_entry=arrival))
        elif cur <= today and has_data_this_month:
            statuses.append(DailyStatus(date=cur, status="absent"))
        cur += timedelta(days=1)

    return statuses


@router.get(
    "/calendar-range",
    response_model=list[DailyStatus],
    summary="Daily status for a date range (Year Calendar View)",
)
async def get_calendar_range(
    employee_id: uuid.UUID | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DailyStatus]:
    today = date.today()
    df = _parse_date(date_from, today - timedelta(days=365))
    dt = _parse_date(date_to, today)
    eid = _resolve_employee_id(employee_id, current_user) or current_user.id

    dt_from = datetime(df.year, df.month, df.day, tzinfo=timezone.utc)
    dt_to = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)

    query = text(
        """
        SELECT
            DATE(event_time AT TIME ZONE 'UTC') AS day,
            MIN(event_time AT TIME ZONE 'UTC')  AS first_entry
        FROM attendance_logs
        WHERE employee_id = :eid
          AND event_type = 'entry'
          AND event_time BETWEEN :dt_from AND :dt_to
        GROUP BY DATE(event_time AT TIME ZONE 'UTC')
        """
    )
    result = await db.execute(query, {"eid": str(eid), "dt_from": dt_from, "dt_to": dt_to})
    rows = {r["day"]: r["first_entry"].time() for r in result.mappings().all()}

    # Determine which months have data for this employee (any event type)
    months_query = text(
        """
        SELECT DISTINCT
            EXTRACT(YEAR FROM event_time AT TIME ZONE 'UTC')::int  AS y,
            EXTRACT(MONTH FROM event_time AT TIME ZONE 'UTC')::int AS m
        FROM attendance_logs
        WHERE employee_id = :eid
          AND event_time BETWEEN :dt_from AND :dt_to
        """
    )
    months_result = await db.execute(months_query, {"eid": str(eid), "dt_from": dt_from, "dt_to": dt_to})
    months_with_data: set[tuple[int, int]] = {
        (r["y"], r["m"]) for r in months_result.mappings().all()
    }

    # Warm holiday cache for all months in range
    cur_month = date(df.year, df.month, 1)
    end_month = date(dt.year, dt.month, 1)
    while cur_month <= end_month:
        await warm_cache_for_month(cur_month.year, cur_month.month)
        if cur_month.month == 12:
            cur_month = date(cur_month.year + 1, 1, 1)
        else:
            cur_month = date(cur_month.year, cur_month.month + 1, 1)

    late_threshold = time(9, settings.LATE_YELLOW_MINUTES, 0)
    statuses: list[DailyStatus] = []
    cur = df

    while cur <= min(dt, today):
        month_has_data = (cur.year, cur.month) in months_with_data
        if month_has_data:
            if cur.weekday() >= 5:
                statuses.append(DailyStatus(date=cur, status="weekend"))
            elif is_holiday(cur) and cur not in rows:
                statuses.append(DailyStatus(date=cur, status="weekend"))
            elif cur in rows:
                arrival = rows[cur]
                if arrival <= late_threshold:
                    statuses.append(DailyStatus(date=cur, status="normal", first_entry=arrival))
                else:
                    statuses.append(DailyStatus(date=cur, status="late", first_entry=arrival))
            else:
                # Workday in a month with data but no entry → absent (red)
                statuses.append(DailyStatus(date=cur, status="absent"))
        # Months without any data → skip entirely
        cur += timedelta(days=1)

    return statuses


@router.get(
    "/trend",
    response_model=list[TrendPoint],
    summary="Attendance trend by month (Line Chart)",
)
async def get_trend(
    employee_id: uuid.UUID | None = Query(default=None),
    months: int = Query(default=12, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TrendPoint]:
    eid = _resolve_employee_id(employee_id, current_user)

    today = date.today()
    dt_from = datetime(today.year, today.month, 1, tzinfo=timezone.utc) - timedelta(
        days=30 * months
    )

    if eid is None:
        # Exclude "Временный пропуск" employees from trend
        query = text(
            """
            WITH daily AS (
                SELECT
                    DATE_TRUNC('month', event_time AT TIME ZONE 'UTC')              AS month_trunc,
                    TO_CHAR(DATE_TRUNC('month', event_time AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
                    DATE(event_time AT TIME ZONE 'UTC')                             AS day,
                    a.employee_id
                FROM attendance_logs a
                JOIN users u ON a.employee_id = u.id
                WHERE event_time >= :dt_from
                  AND u.full_name NOT ILIKE '%%Временный пропуск%%'
                GROUP BY
                    DATE_TRUNC('month', event_time AT TIME ZONE 'UTC'),
                    DATE(event_time AT TIME ZONE 'UTC'),
                    a.employee_id
            ),
            monthly AS (
                SELECT
                    month,
                    COUNT(*)                        AS worked_days,
                    COUNT(DISTINCT employee_id)     AS active_employees,
                    MIN(day)                        AS first_day,
                    MAX(day)                        AS last_day
                FROM daily
                GROUP BY month
            )
            SELECT month, worked_days, active_employees, first_day, last_day
            FROM monthly
            ORDER BY month
            """
        )
        result = await db.execute(query, {"dt_from": dt_from})
        rows = result.mappings().all()

        trend: list[TrendPoint] = []
        for row in rows:
            ym = row["month"]
            y_val = int(ym[:4])
            m_val = int(ym[5:7])
            active = int(row["active_employees"] or 1)
            # Use actual data range within the month
            month_start = date(y_val, m_val, 1)
            month_end = _last_day(y_val, m_val)
            effective_start = max(month_start, row["first_day"]) if row["first_day"] else month_start
            effective_end = min(month_end, row["last_day"]) if row["last_day"] else month_end
            workdays = _count_workdays(effective_start, effective_end)
            total_possible = workdays * active
            pct = round(int(row["worked_days"]) / total_possible * 100, 1) if total_possible > 0 else 0.0
            trend.append(TrendPoint(month=ym, attendance_pct=pct))
    else:
        query = text(
            """
            WITH monthly AS (
                SELECT
                    TO_CHAR(DATE_TRUNC('month', event_time AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
                    COUNT(DISTINCT DATE(event_time AT TIME ZONE 'UTC'))                    AS worked_days,
                    MIN(DATE(event_time AT TIME ZONE 'UTC'))                               AS first_day,
                    MAX(DATE(event_time AT TIME ZONE 'UTC'))                               AS last_day
                FROM attendance_logs
                WHERE employee_id = :eid
                  AND event_time >= :dt_from
                GROUP BY DATE_TRUNC('month', event_time AT TIME ZONE 'UTC')
            )
            SELECT month, worked_days, first_day, last_day
            FROM monthly
            ORDER BY month
            """
        )
        result = await db.execute(query, {"eid": str(eid), "dt_from": dt_from})
        rows = result.mappings().all()

        trend = []
        for row in rows:
            ym = row["month"]
            y_val = int(ym[:4])
            m_val = int(ym[5:7])
            # Use actual data range within the month
            month_start = date(y_val, m_val, 1)
            month_end = _last_day(y_val, m_val)
            effective_start = max(month_start, row["first_day"]) if row["first_day"] else month_start
            effective_end = min(month_end, row["last_day"]) if row["last_day"] else month_end
            workdays = _count_workdays(effective_start, effective_end)
            pct = round(int(row["worked_days"]) / workdays * 100, 1) if workdays > 0 else 0.0
            trend.append(TrendPoint(month=ym, attendance_pct=pct))

    return trend


@router.get(
    "/heatmap",
    response_model=list[HeatmapCell],
    summary="Passage intensity heatmap (day-of-week × hour)",
)
async def get_heatmap(
    employee_id: uuid.UUID | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[HeatmapCell]:
    df = _parse_date(date_from, date.today() - timedelta(days=90))
    dt = _parse_date(date_to, date.today())
    eid = _resolve_employee_id(employee_id, current_user)

    dt_from = datetime(df.year, df.month, df.day, tzinfo=timezone.utc)
    dt_to = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)

    if eid is None:
        # Exclude "Временный пропуск" employees from heatmap
        query = text(
            """
            SELECT
                EXTRACT(DOW  FROM event_time AT TIME ZONE 'UTC')::int AS day_of_week,
                EXTRACT(HOUR FROM event_time AT TIME ZONE 'UTC')::int AS hour,
                COUNT(*)::int                                          AS intensity
            FROM attendance_logs a
            JOIN users u ON a.employee_id = u.id
            WHERE event_time BETWEEN :dt_from AND :dt_to
              AND u.full_name NOT ILIKE '%%Временный пропуск%%'
            GROUP BY
                EXTRACT(DOW  FROM event_time AT TIME ZONE 'UTC'),
                EXTRACT(HOUR FROM event_time AT TIME ZONE 'UTC')
            ORDER BY day_of_week, hour
            """
        )
        result = await db.execute(query, {"dt_from": dt_from, "dt_to": dt_to})
    else:
        query = text(
            """
            SELECT
                EXTRACT(DOW  FROM event_time AT TIME ZONE 'UTC')::int AS day_of_week,
                EXTRACT(HOUR FROM event_time AT TIME ZONE 'UTC')::int AS hour,
                COUNT(*)::int                                          AS intensity
            FROM attendance_logs
            WHERE employee_id = :eid
              AND event_time BETWEEN :dt_from AND :dt_to
            GROUP BY
                EXTRACT(DOW  FROM event_time AT TIME ZONE 'UTC'),
                EXTRACT(HOUR FROM event_time AT TIME ZONE 'UTC')
            ORDER BY day_of_week, hour
            """
        )
        result = await db.execute(
            query, {"eid": str(eid), "dt_from": dt_from, "dt_to": dt_to}
        )
    return [
        HeatmapCell(
            day_of_week=r["day_of_week"],
            hour=r["hour"],
            intensity=r["intensity"],
        )
        for r in result.mappings().all()
    ]


@router.get(
    "/top-late",
    response_model=list[TopLateEmployee],
    summary="Top employees by late arrival count (Bar Chart)",
)
async def get_top_late(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role("admin", "manager")),
) -> list[TopLateEmployee]:
    df = _parse_date(date_from, date.today() - timedelta(days=30))
    dt = _parse_date(date_to, date.today())

    dt_from = datetime(df.year, df.month, df.day, tzinfo=timezone.utc)
    dt_to = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)

    # Exclude "Временный пропуск" employees from top-late
    query = text(
        """
        WITH daily_first AS (
            SELECT
                employee_id,
                DATE(event_time AT TIME ZONE 'UTC') AS day,
                MIN(event_time AT TIME ZONE 'UTC')  AS first_entry
            FROM attendance_logs
            WHERE event_type = 'entry'
              AND event_time BETWEEN :dt_from AND :dt_to
            GROUP BY employee_id, DATE(event_time AT TIME ZONE 'UTC')
        )
        SELECT u.id, u.full_name, COUNT(*) AS late_count
        FROM daily_first d
        JOIN users u ON d.employee_id = u.id
        WHERE EXTRACT(EPOCH FROM d.first_entry::time) > 32400
          AND u.full_name NOT ILIKE '%%Временный пропуск%%'
        GROUP BY u.id, u.full_name
        ORDER BY late_count DESC
        LIMIT :limit
        """
    )
    result = await db.execute(
        query, {"dt_from": dt_from, "dt_to": dt_to, "limit": limit}
    )
    return [
        TopLateEmployee(
            employee_id=r["id"],
            full_name=r["full_name"],
            late_count=int(r["late_count"]),
        )
        for r in result.mappings().all()
    ]


@router.get(
    "/checkpoints",
    response_model=list[CheckpointLoad],
    summary="Checkpoint traffic distribution (Pie/Bar Chart)",
)
async def get_checkpoints(
    employee_id: uuid.UUID | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CheckpointLoad]:
    df = _parse_date(date_from, date.today() - timedelta(days=30))
    dt = _parse_date(date_to, date.today())
    eid = _resolve_employee_id(employee_id, current_user)

    dt_from = datetime(df.year, df.month, df.day, tzinfo=timezone.utc)
    dt_to = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)

    if eid is None:
        # Exclude "Временный пропуск" employees from checkpoint stats
        query = text(
            """
            SELECT checkpoint, COUNT(*)::int AS count
            FROM attendance_logs a
            JOIN users u ON a.employee_id = u.id
            WHERE event_time BETWEEN :dt_from AND :dt_to
              AND u.full_name NOT ILIKE '%%Временный пропуск%%'
            GROUP BY checkpoint
            ORDER BY count DESC
            """
        )
        result = await db.execute(query, {"dt_from": dt_from, "dt_to": dt_to})
    else:
        query = text(
            """
            SELECT checkpoint, COUNT(*)::int AS count
            FROM attendance_logs
            WHERE employee_id = :eid
              AND event_time BETWEEN :dt_from AND :dt_to
            GROUP BY checkpoint
            ORDER BY count DESC
            """
        )
        result = await db.execute(
            query, {"eid": str(eid), "dt_from": dt_from, "dt_to": dt_to}
        )
    return [
        CheckpointLoad(checkpoint=r["checkpoint"], count=r["count"])
        for r in result.mappings().all()
    ]


@router.get(
    "/employee-logs",
    response_model=list[AttendanceLogEntry],
    summary="Raw attendance log entries for an employee within a date range",
)
async def get_employee_logs(
    employee_id: uuid.UUID = Query(..., description="Employee UUID"),
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AttendanceLogEntry]:
    # Employees can only access their own logs
    if current_user.role not in ("admin", "manager") and employee_id != current_user.id:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    today = date.today()
    df = _parse_date(date_from, today.replace(day=1))
    dt = _parse_date(date_to, today)

    dt_from = datetime(df.year, df.month, df.day, tzinfo=timezone.utc)
    dt_to = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)

    stmt = (
        select(AttendanceLog)
        .where(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.event_time.between(dt_from, dt_to),
        )
        .order_by(AttendanceLog.event_time)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return [
        AttendanceLogEntry(
            event_time=log.event_time,
            event_type=log.event_type,
            checkpoint=log.checkpoint,
        )
        for log in logs
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_employee_id(
    requested: uuid.UUID | None, current_user: User
) -> uuid.UUID | None:
    """
    Admins and managers may query any employee; None means all employees.
    Regular employees always get their own ID.
    """
    if current_user.role in ("admin", "manager"):
        return requested  # None → aggregate all employees
    return current_user.id


def _sec_to_time(seconds: float | None) -> time | None:
    if seconds is None:
        return None
    total = int(seconds)
    h = (total // 3600) % 24
    m = (total % 3600) // 60
    s = total % 60
    return time(h, m, s)


def _count_workdays(start: date, end: date) -> int:
    """Рабочие дни (пн–пт) без праздников по производственному календарю РФ."""
    count = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5 and not is_holiday(cur):
            count += 1
        cur += timedelta(days=1)
    return count


def _count_workdays_for_months(
    start: date, end: date, months_with_data: set[tuple[int, int]]
) -> int:
    """Рабочие дни только в месяцах, где есть фактические данные."""
    count = 0
    cur = start
    while cur <= end:
        if (
            (cur.year, cur.month) in months_with_data
            and cur.weekday() < 5
            and not is_holiday(cur)
        ):
            count += 1
        cur += timedelta(days=1)
    return count


def _last_day(year: int, month: int) -> date:
    if month == 12:
        return date(year + 1, 1, 1) - timedelta(days=1)
    return date(year, month + 1, 1) - timedelta(days=1)
