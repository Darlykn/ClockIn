from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class AttendanceRecord(BaseModel):
    raw_name: str
    event_time: datetime
    event_type: Literal["entry", "exit"]
    checkpoint: str

    @field_validator("raw_name", "checkpoint")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip()


class ImportResultResponse(BaseModel):
    filename: str
    total: int
    inserted_count: int
    skipped: int
    error_count: int
    errors: list[str]
    skipped_events: list[str]  # системные события СКУД: "нет входа - идентификатора нет в бд" и т.п.
    status: Literal["success", "partial", "failed"]
