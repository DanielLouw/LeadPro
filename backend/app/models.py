import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class LeadStatus(str, enum.Enum):
    new = "new"
    reviewing = "reviewing"
    contacted = "contacted"
    pass_ = "pass"


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    config_yaml: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=RunStatus.pending.value,
        nullable=False,
    )
    total_leads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    queries_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    queries_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(50),
        default="google_places",
        nullable=False,
        server_default="google_places",
    )
    apify_run_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    apify_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)

    leads: Mapped[list["Lead"]] = relationship("Lead", back_populates="run", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'running', 'completed', 'failed')", name="runs_status_check"),
        CheckConstraint(
            "source IN ('google_places', 'apify_google_maps', 'apify_facebook_pages')",
            name="runs_source_check",
        ),
    )


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("runs.id"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    maps_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    gap_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=LeadStatus.new.value,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    run: Mapped["Run"] = relationship("Run", back_populates="leads")
    gap_signals: Mapped[list["GapSignal"]] = relationship(
        "GapSignal", back_populates="lead", cascade="all, delete-orphan"
    )
    note: Mapped["Note | None"] = relationship("Note", back_populates="lead", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("run_id", "external_id", name="leads_run_external_unique"),
        CheckConstraint(
            "status IN ('new', 'reviewing', 'contacted', 'pass')",
            name="leads_status_check",
        ),
    )


class GapSignal(Base):
    __tablename__ = "gap_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(Integer, ForeignKey("leads.id"), nullable=False)
    signal_type: Mapped[str] = mapped_column(String(100), nullable=False)
    is_hard: Mapped[bool] = mapped_column(Boolean, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="gap_signals")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(Integer, ForeignKey("leads.id"), nullable=False, unique=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    lead: Mapped["Lead"] = relationship("Lead", back_populates="note")


class SearchSlot(Base):
    __tablename__ = "search_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    county: Mapped[str] = mapped_column(String(100), nullable=False)
    industry: Mapped[str] = mapped_column(String(255), nullable=False)
    search_term: Mapped[str] = mapped_column(String(255), nullable=False)
    search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_run_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("runs.id", ondelete="SET NULL"), nullable=True
    )

    last_run: Mapped["Run | None"] = relationship("Run", foreign_keys=[last_run_id])

    __table_args__ = (
        UniqueConstraint("state", "county", "industry", "search_term", name="search_slots_unique"),
    )


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    google_places_monthly_budget_usd: Mapped[float] = mapped_column(
        Float, nullable=False, default=200.0, server_default="200.0"
    )
    apify_monthly_budget_usd: Mapped[float] = mapped_column(
        Float, nullable=False, default=5.0, server_default="5.0"
    )


class SearchSlot(Base):
    __tablename__ = "search_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    county: Mapped[str] = mapped_column(String(100), nullable=False)
    industry: Mapped[str] = mapped_column(String(100), nullable=False)
    search_term: Mapped[str] = mapped_column(String(255), nullable=False)
    search_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_run_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("runs.id", ondelete="SET NULL"), nullable=True
    )

    last_run: Mapped["Run | None"] = relationship("Run", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint(
            "state", "county", "industry", "search_term",
            name="search_slots_state_county_industry_term_unique",
        ),
    )
