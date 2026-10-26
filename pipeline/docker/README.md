# Local database initialization

This directory contains Docker assets used only by the local PostgreSQL service in [`../../compose.yaml`](../../compose.yaml).

`init-reader.sql` runs when Docker creates a new `fiscal_db` volume. It creates the local `fiscal_reader` role used by the web application and grants it read access to tables created by the local database owner.

These credentials are development-only. Production database roles and secrets must be managed separately.

To run the initialization again, remove and recreate the local Compose database volume. This deletes local database data, so do so only when a reset is intended.
