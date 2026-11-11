"""Flag table (open, dismissed, resolved)."""
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Flag(Base):
    __tablename__ = "flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id", ondelete="CASCADE"), nullable=False, index=True)
    fact_id: Mapped[int | None] = mapped_column(ForeignKey("facts.id", ondelete="SET NULL"), nullable=True, index=True)
    conflicting_fact_id: Mapped[int | None] = mapped_column(ForeignKey("facts.id", ondelete="SET NULL"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    old_quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    new_quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    chapter_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    severity: Mapped[str] = mapped_column(String(50), nullable=False, default="warning")  # info, warning, error
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open")  # open, dismissed, resolved
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    story = relationship("Story", back_populates="flags")
    fact = relationship("Fact", foreign_keys=[fact_id])
    conflicting_fact = relationship("Fact", foreign_keys=[conflicting_fact_id])
