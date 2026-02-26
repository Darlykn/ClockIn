"""add email to users

Revision ID: 0002_add_email_to_users
Revises: 0001_initial
Create Date: 2026-02-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_email_to_users"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "email")
