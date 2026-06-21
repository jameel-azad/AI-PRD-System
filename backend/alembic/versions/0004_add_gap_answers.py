"""add gap_answers column to projects

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("gap_answers", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "gap_answers")
