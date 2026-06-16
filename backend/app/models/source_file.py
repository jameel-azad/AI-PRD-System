from datetime import datetime

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourceFile(Base):
    __tablename__ = "source_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    storage_key: Mapped[str]
    filename: Mapped[str]
    file_type: Mapped[str]
    transcript: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(default="pending")
