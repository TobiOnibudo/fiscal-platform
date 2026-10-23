"""Protect published snapshots and source observations from ordinary rewrites."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE FUNCTION prevent_evidence_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'immutable source evidence cannot be updated or deleted';
        END $$;
        CREATE TRIGGER observations_immutable BEFORE UPDATE OR DELETE ON observations
        FOR EACH ROW EXECUTE FUNCTION prevent_evidence_rewrite();
        CREATE FUNCTION protect_published_dataset() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.status = 'published' THEN
            RAISE EXCEPTION 'published dataset is immutable; create a new candidate';
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER datasets_published_immutable BEFORE UPDATE OR DELETE ON datasets
        FOR EACH ROW EXECUTE FUNCTION protect_published_dataset();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER datasets_published_immutable ON datasets")
    op.execute("DROP FUNCTION protect_published_dataset()")
    op.execute("DROP TRIGGER observations_immutable ON observations")
    op.execute("DROP FUNCTION prevent_evidence_rewrite()")
