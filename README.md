# Fiscal Platform

Fiscal Platform is a source-grounded financial-statement review workspace. It pairs a Next.js application with a Python pipeline for ingesting, validating, and reviewing reported financial data.

## Prerequisites

- Node.js 22.14+ (22.23.4 tested) and npm
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Docker Desktop (for the local PostgreSQL database)

## Quick start

From the repository root:

```powershell
Copy-Item .env.example .env
npm ci
uv sync --project pipeline --frozen --extra dev --extra extraction
docker compose up -d db
docker compose run --rm migrate
docker compose --profile tools run --rm pipeline seed-companies
npm run dev
```

Open the URL printed by Next.js (normally <http://localhost:3000>). The development server supports hot reload.

`npm` may be blocked by your PowerShell execution policy; use `npm.cmd` in that case (for example, `npm.cmd run dev`).

### Optional sample data

For a local UI walkthrough, seed the sample dataset and enable it in `.env`:

```powershell
docker compose --profile tools run --rm pipeline seed-sample
```

Set `FISCAL_ALLOW_SAMPLE_DATA=true` before starting the web app.

## Common commands

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build

uv run --project pipeline --extra dev ruff check pipeline
uv run --project pipeline --extra dev pytest pipeline/tests
```

Run `uv run --project pipeline pipeline --help` to explore pipeline commands. Extraction and publication are deliberate, operator-driven workflows; setup and tests do not make model requests or spend API credits.

## Contributing

1. Create a branch from `main`.
2. Make a focused change and add or update tests where behavior changes.
3. Run the relevant checks above.
4. Install commit hooks once with:

   ```powershell
   uv run --project pipeline --extra dev pre-commit install --hook-type pre-commit --hook-type commit-msg
   ```

5. Use [Conventional Commits](https://www.conventionalcommits.org/) (for example, `fix(web): handle empty statements`) and open a pull request with a clear summary and validation notes.

Keep credentials in the ignored `.env` file. Never commit API keys, database credentials, source PDFs, or verified-looking financial data without the required review process.

## More documentation

- [Local development details](docs/local-development.md)
- [Architecture and implementation notes](docs/engineering-design.md)
- [Data sources and coverage](docs/data-sources.md)
- [Verification report](docs/verification-report.md)
