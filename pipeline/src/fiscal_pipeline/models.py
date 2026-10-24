"""Persistence metadata; Alembic alone changes deployed schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint("fiscal_year_end_month BETWEEN 1 AND 12", name="company_month"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    fiscal_year_end_month: Mapped[int] = mapped_column(Integer)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Filing(Base):
    __tablename__ = "filings"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    title: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(Text)
    classification: Mapped[str] = mapped_column(Text)
    published_on: Mapped[date | None] = mapped_column(Date)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB)


class ExtractionAttempt(Base):
    __tablename__ = "extraction_attempts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','validation_failed','needs_review','approved')",
            name="attempt_status",
        ),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    filing_id: Mapped[str] = mapped_column(ForeignKey("filings.id"), index=True)
    response_hash: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        CheckConstraint(
            "value_state IN ('reported','not_reported','unreadable')", name="value_state"
        ),
        CheckConstraint(
            "(value_state = 'reported' AND amount IS NOT NULL AND "
            "amount::text NOT IN ('NaN','Infinity','-Infinity')) OR "
            "(value_state <> 'reported' AND amount IS NULL)",
            name="finite_amount_state",
        ),
        CheckConstraint("period_start IS NULL OR period_start <= period_end", name="period_bounds"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("extraction_attempts.id"), index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    concept_id: Mapped[str] = mapped_column(Text)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    statement: Mapped[str] = mapped_column(Text)
    raw_label: Mapped[str] = mapped_column(Text)
    raw_text: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal | None] = mapped_column(Numeric())
    value_state: Mapped[str] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(Text)
    scope: Mapped[str] = mapped_column(Text)
    basis: Mapped[str] = mapped_column(Text)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB)


class ReviewEvent(Base):
    __tablename__ = "review_events"
    __table_args__ = (
        CheckConstraint("decision IN ('approved','rejected')", name="review_event_decision"),
        Index("review_events_attempt_created", "attempt_id", "created_at"),
        Index("review_events_observation_created", "observation_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("extraction_attempts.id"))
    observation_id: Mapped[str | None] = mapped_column(ForeignKey("observations.id"))
    decision: Mapped[str] = mapped_column(Text)
    reviewer: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        CheckConstraint("status IN ('draft','approved','published')", name="dataset_status"),
    )
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    status: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    validation: Mapped[dict[str, Any]] = mapped_column(JSONB)


class CompanyPublication(Base):
    __tablename__ = "company_publications"
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), primary_key=True)
    dataset_id: Mapped[str | None] = mapped_column(ForeignKey("datasets.id"), index=True)
    generation: Mapped[int] = mapped_column(BigInteger, default=0)
