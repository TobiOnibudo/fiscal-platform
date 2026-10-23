"""Reviewed initial financial records and atomic publication pointer.

Unbounded NUMERIC retains source precision; foreign-key indexes support read joins.
No table is created by application startup. Downgrade drops data: operator-only.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("fiscal_year_end_month", sa.Integer(), nullable=False),
        sa.Column("config", pg.JSONB(), nullable=False),
        sa.CheckConstraint("fiscal_year_end_month BETWEEN 1 AND 12", name="company_month"),
    )
    op.create_table(
        "filings",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("company_id", sa.Text(), sa.ForeignKey("companies.id"), nullable=False),
        *[
            sa.Column(n, sa.Text(), nullable=False)
            for n in ["title", "source_url", "sha256", "classification"]
        ],
        sa.Column("published_on", sa.Date()),
        sa.Column("metadata", pg.JSONB(), nullable=False),
    )
    op.create_table(
        "extraction_attempts",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("filing_id", sa.Text(), sa.ForeignKey("filings.id"), nullable=False),
        sa.Column("response_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft','validation_failed','needs_review','approved')",
            name="attempt_status",
        ),
    )
    op.create_table(
        "observations",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("attempt_id", sa.Text(), sa.ForeignKey("extraction_attempts.id"), nullable=False),
        sa.Column("company_id", sa.Text(), sa.ForeignKey("companies.id"), nullable=False),
        *[
            sa.Column(n, sa.Text(), nullable=False)
            for n in [
                "concept_id",
                "statement",
                "raw_label",
                "raw_text",
                "value_state",
                "unit",
                "currency",
                "scope",
                "basis",
            ]
        ],
        sa.Column("period_start", sa.Date()),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric()),
        sa.Column("evidence", pg.JSONB(), nullable=False),
        sa.CheckConstraint(
            "value_state IN ('reported','not_reported','unreadable')", name="value_state"
        ),
        sa.CheckConstraint(
            "(value_state = 'reported' AND amount IS NOT NULL AND "
            "amount::text NOT IN ('NaN','Infinity','-Infinity')) OR "
            "(value_state <> 'reported' AND amount IS NULL)",
            name="finite_amount_state",
        ),
        sa.CheckConstraint(
            "period_start IS NULL OR period_start <= period_end", name="period_bounds"
        ),
    )
    op.create_table(
        "datasets",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("company_id", sa.Text(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        sa.Column("validation", pg.JSONB(), nullable=False),
        sa.CheckConstraint("status IN ('draft','approved','published')", name="dataset_status"),
    )
    op.create_table(
        "company_publications",
        sa.Column("company_id", sa.Text(), sa.ForeignKey("companies.id"), primary_key=True),
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.id")),
        sa.Column("generation", sa.BigInteger(), nullable=False),
    )
    for table, column in [
        ("filings", "company_id"),
        ("extraction_attempts", "filing_id"),
        ("observations", "attempt_id"),
        ("observations", "company_id"),
        ("datasets", "company_id"),
        ("company_publications", "dataset_id"),
    ]:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table in [
        "company_publications",
        "datasets",
        "observations",
        "extraction_attempts",
        "filings",
        "companies",
    ]:
        op.drop_table(table)
