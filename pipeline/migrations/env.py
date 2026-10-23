import os

from alembic import context
from sqlalchemy import create_engine

from fiscal_pipeline.models import Base

url = os.environ["MIGRATION_DATABASE_URL"]
engine = create_engine(url)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
