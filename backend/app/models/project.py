import enum
from datetime import datetime

from sqlalchemy import Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ProjectStage(str, enum.Enum):
    intake        = "intake"
    processing    = "processing"
    drafted       = "drafted"
    gap_review    = "gap_review"
    feasibility   = "feasibility"
    client_review = "client_review"
    approved      = "approved"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    client_org: Mapped[str]
    stage: Mapped[ProjectStage] = mapped_column(
        SAEnum(ProjectStage, name="projectstage"), default=ProjectStage.intake
    )
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
