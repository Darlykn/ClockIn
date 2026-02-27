"""add invite_jti to users

Revision ID: 0003_add_invite_jti
Revises: 0002_add_email_to_users
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_add_invite_jti"
down_revision: Union[str, None] = "0002_add_email_to_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("invite_jti", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "invite_jti")
