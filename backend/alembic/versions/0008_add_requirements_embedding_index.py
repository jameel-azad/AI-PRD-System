"""add ivfflat cosine index on requirements embedding

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-23

Without this index, the semantic similarity query in chunk_and_extract
(cosine_distance ORDER BY + WHERE < 0.08) does a full sequential scan of
every requirement row for the project. The IVFFlat index makes that query
use approximate nearest-neighbour search instead, which stays fast as the
requirements table grows.

Note: IVFFlat requires the table to have data before the index is useful —
the lists=100 setting is appropriate for up to ~1M rows. Rebuild the index
with a higher lists value if the table exceeds that.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS requirements_embedding_cosine_idx "
        "ON requirements "
        "USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS requirements_embedding_cosine_idx")
