from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    role: Literal["admin", "manager", "employee"] = "employee"
    full_name: str | None = None
    email: str | None = None


class UserUpdate(BaseModel):
    role: Literal["admin", "manager", "employee"] | None = None
    is_active: bool | None = None
    full_name: str | None = None
    email: str | None = None
    reset_2fa: bool | None = None


class UserResponse(BaseModel):
    id: UUID
    username: str
    role: str
    full_name: str | None
    is_active: bool
    has_2fa: bool
    email: str | None

    model_config = {"from_attributes": True}
