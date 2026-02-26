from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class AttendanceSummary(BaseModel):
    attendance_pct: float
    avg_arrival_time: time | None
    avg_departure_time: time | None
    late_count: int
    overtime_count: int
    avg_duration_hours: float | None


class DailyStatus(BaseModel):
    date: date
    status: Literal["normal", "late", "absent", "weekend"]


class HeatmapCell(BaseModel):
    day_of_week: int
    hour: int
    intensity: int


class TopLateEmployee(BaseModel):
    employee_id: UUID
    full_name: str | None
    late_count: int


class CheckpointLoad(BaseModel):
    checkpoint: str
    count: int


class TrendPoint(BaseModel):
    month: str
    attendance_pct: float


class AttendanceLogEntry(BaseModel):
    event_time: datetime
    event_type: Literal["entry", "exit"]
    checkpoint: str
