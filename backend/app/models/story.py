"""Story table."""
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", back_populates="stories")
    chapters = relationship("Chapter", back_populates="story", cascade="all, delete-orphan", order_by="Chapter.number")
    entities = relationship("Entity", back_populates="story", cascade="all, delete-orphan")
    facts = relationship("Fact", back_populates="story", cascade="all, delete-orphan")
    rules = relationship("Rule", back_populates="story", cascade="all, delete-orphan")
    flags = relationship("Flag", back_populates="story", cascade="all, delete-orphan")
