"""initial: users, attendance_logs, import_history

Revision ID: 0001_initial
Revises:
Create Date: 2025-02-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLAlchemy will auto-create ENUM types via before_create hook
    # when op.create_table is called — no explicit CREATE TYPE needed here.

    # --- users ---
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "manager", "employee", name="user_role"),
            nullable=False,
            server_default="employee",
        ),
        sa.Column("totp_secret", sa.String(64), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )

    # --- attendance_logs ---
    op.create_table(
        "attendance_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("raw_name", sa.String(255), nullable=True),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum("entry", "exit", name="event_type_enum"),
            nullable=False,
        ),
        sa.Column("checkpoint", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "employee_id",
            "event_time",
            "event_type",
            "checkpoint",
            name="uq_attendance_dedup",
        ),
    )
    op.create_index(
        "ix_attendance_employee_time",
        "attendance_logs",
        ["employee_id", "event_time"],
    )
    op.create_index("ix_attendance_event_type", "attendance_logs", ["event_type"])
    op.create_index("ix_attendance_event_time", "attendance_logs", ["event_time"])

    # --- import_history ---
    op.create_table(
        "import_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("success", "partial", "failed", name="import_status_enum"),
            nullable=False,
        ),
        sa.Column("logs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("import_history")
    op.drop_index("ix_attendance_event_time", table_name="attendance_logs")
    op.drop_index("ix_attendance_event_type", table_name="attendance_logs")
    op.drop_index("ix_attendance_employee_time", table_name="attendance_logs")
    op.drop_table("attendance_logs")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS import_status_enum")
    op.execute("DROP TYPE IF EXISTS event_type_enum")
    op.execute("DROP TYPE IF EXISTS user_role")
