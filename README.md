# Fiscal Platform

Fiscal Platform turns company financial reports into structured, reviewable data. It combines a web application for exploring published statements with a pipeline that discovers source documents, prepares them for extraction, validates results, and publishes approved datasets.

The project is designed around traceability: reported figures remain connected to their source material, and extraction and publication are explicit operator actions.

## What's in the repository

| Area           | Purpose                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `apps/web`     | Next.js application for browsing company and statement data.                      |
| `pipeline`     | Python CLI for source discovery, report preparation, validation, and publication. |
| `contracts`    | Shared schemas, fixtures, and data contracts.                                     |
| `docs`         | Architecture, local-development, source-coverage, and verification notes.         |
| `compose.yaml` | Local PostgreSQL database and supporting development services.                    |

## Prerequisites

- Node.js and npm
- Python and [uv](https://docs.astral.sh/uv/)
- Docker Desktop

## Get started

From the repository root, create your local configuration, install dependencies, start the database, and seed the company catalogue.

```sh
cp .env.example .env
npm ci
uv sync --project pipeline --frozen --extra dev --extra extraction
docker compose up -d db
docker compose run --rm migrate
docker compose --profile tools run --rm pipeline seed-companies
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` for the first command. If PowerShell prevents `npm` from running, use `npm.cmd` in its place.

Once the server starts, open the local address printed by Next.js (typically <http://localhost:3000>).

### Optional sample data

To explore the interface with local example data, run:

```sh
docker compose --profile tools run --rm pipeline seed-sample
```

Then set `FISCAL_ALLOW_SAMPLE_DATA=true` in `.env` before starting the web app.

## Everyday development

Run the checks that apply to your change before opening a pull request:

```sh
# Web application
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build

# Pipeline
uv run --project pipeline --extra dev ruff check pipeline
uv run --project pipeline --extra dev pytest pipeline/tests
```

The pipeline CLI includes contextual help for each operation:

```sh
uv run --project pipeline pipeline --help
```

Its extraction and publication commands are intentionally operator-driven. Routine setup and test commands do not make model requests or incur API costs.

## Contributing

1. Branch from `main` and keep each change focused.
2. Add or update tests when behaviour changes.
3. Run the relevant checks above.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) and include a concise summary and validation notes in your pull request.

To install the repository's commit hooks once:

```sh
uv run --project pipeline --extra dev pre-commit install --hook-type pre-commit --hook-type commit-msg
```

Keep credentials in the ignored `.env` file. Do not commit API keys, database credentials, source PDFs, or financial data that has not completed the required review process.

## Further reading

- [Local development](docs/local-development.md)
- [Pipeline guide](pipeline/README.md)
- [Architecture and implementation notes](docs/engineering-design.md)
- [Data sources and coverage](docs/data-sources.md)
- [Verification report](docs/verification-report.md)
