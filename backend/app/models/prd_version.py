from datetime import datetime

from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PRDVersion(Base):
    __tablename__ = "prd_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    version: Mapped[int] = mapped_column(default=1)
    content: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(32), default="pipeline")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
