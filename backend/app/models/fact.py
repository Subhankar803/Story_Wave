"""Fact table with quote, day and pgvector embedding."""
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Fact(Base):
    __tablename__ = "facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entities.id", ondelete="SET NULL"), nullable=True, index=True)
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=True, index=True)
    chapter_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    entity_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    attribute: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    day: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-serialized vector
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    story = relationship("Story", back_populates="facts")
    entity = relationship("Entity", back_populates="facts")
    chapter = relationship("Chapter", back_populates="facts")
