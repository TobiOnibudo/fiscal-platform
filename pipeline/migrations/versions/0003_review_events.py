"""Append-only human review decisions for extraction candidates."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_events",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("attempt_id", sa.Text(), sa.ForeignKey("extraction_attempts.id"), nullable=False),
        sa.Column("observation_id", sa.Text(), sa.ForeignKey("observations.id"), nullable=True),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("reviewer", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("decision IN ('approved','rejected')", name="review_event_decision"),
    )
    op.create_index("review_events_attempt_created", "review_events", ["attempt_id", "created_at"])
    op.create_index(
        "review_events_observation_created", "review_events", ["observation_id", "created_at"]
    )
    op.execute("""
        CREATE FUNCTION prevent_review_event_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'review events are append-only';
        END $$;
        CREATE TRIGGER review_events_immutable BEFORE UPDATE OR DELETE ON review_events
        FOR EACH ROW EXECUTE FUNCTION prevent_review_event_rewrite();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER review_events_immutable ON review_events")
    op.execute("DROP FUNCTION prevent_review_event_rewrite()")
    op.drop_index("review_events_observation_created", table_name="review_events")
    op.drop_index("review_events_attempt_created", table_name="review_events")
    op.drop_table("review_events")
