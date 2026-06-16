from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    section: Mapped[str]
    content: Mapped[str] = mapped_column(Text)
    source_refs: Mapped[dict] = mapped_column(JSON)
    embedding: Mapped[list[float]] = mapped_column(Vector(768))
    confidence: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
