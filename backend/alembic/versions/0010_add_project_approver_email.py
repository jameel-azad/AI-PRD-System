"""add approver_email to projects

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("approver_email", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "approver_email")
