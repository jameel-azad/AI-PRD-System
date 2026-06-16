import enum
from datetime import datetime

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, enum.Enum):
    ba_pm = "ba_pm"
    admin = "admin"
    client = "client"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str]
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="userrole"))
    hashed_pw: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
