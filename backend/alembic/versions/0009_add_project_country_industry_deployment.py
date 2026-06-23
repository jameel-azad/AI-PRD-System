"""add country, industry, deployment_type to projects

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("country", sa.String(), nullable=True))
    op.add_column("projects", sa.Column("industry", sa.String(), nullable=True))
    op.add_column("projects", sa.Column("deployment_type", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "deployment_type")
    op.drop_column("projects", "industry")
    op.drop_column("projects", "country")
