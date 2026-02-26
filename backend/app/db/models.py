import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("admin", "manager", "employee", name="user_role"),
        nullable=False,
        default="employee",
    )
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    attendance_logs: Mapped[list["AttendanceLog"]] = relationship(
        "AttendanceLog", back_populates="employee", lazy="raise"
    )
    import_histories: Mapped[list["ImportHistory"]] = relationship(
        "ImportHistory", back_populates="uploader", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username} role={self.role}>"


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "event_time",
            "event_type",
            "checkpoint",
            name="uq_attendance_dedup",
        ),
        Index("ix_attendance_employee_time", "employee_id", "event_time"),
        Index("ix_attendance_event_type", "event_type"),
        Index("ix_attendance_event_time", "event_time"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    raw_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    event_type: Mapped[str] = mapped_column(
        Enum("entry", "exit", name="event_type_enum"), nullable=False
    )
    checkpoint: Mapped[str] = mapped_column(String(255), nullable=False)

    employee: Mapped["User"] = relationship("User", back_populates="attendance_logs")

    def __repr__(self) -> str:
        return (
            f"<AttendanceLog id={self.id} employee_id={self.employee_id} "
            f"event_time={self.event_time} event_type={self.event_type}>"
        )


class ImportHistory(Base):
    __tablename__ = "import_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status: Mapped[str] = mapped_column(
        Enum("success", "partial", "failed", name="import_status_enum"), nullable=False
    )
    logs: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    uploader: Mapped["User | None"] = relationship(
        "User", back_populates="import_histories"
    )

    def __repr__(self) -> str:
        return f"<ImportHistory id={self.id} filename={self.filename} status={self.status}>"
