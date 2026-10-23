-- Local-only credentials. Production roles must use independent secrets.
CREATE ROLE fiscal_reader LOGIN PASSWORD 'local_reader';
GRANT CONNECT ON DATABASE fiscal TO fiscal_reader;
GRANT USAGE ON SCHEMA public TO fiscal_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE fiscal IN SCHEMA public GRANT SELECT ON TABLES TO fiscal_reader;
