# Pipeline

The pipeline brings company financial reports into Fiscal Platform: it discovers approved sources, archives PDFs, prepares statement pages, validates data, and publishes datasets.

Run these commands from the repository root. For the full application setup, start with the [root README](../README.md).

## 1. Start locally

Create `.env`, start Postgres, and apply migrations:

```sh
cp .env.example .env
docker compose up -d db
docker compose run --rm migrate
docker compose --profile tools run --rm pipeline seed-companies
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

## 2. Choose how to run commands

Use Docker when you only need the pipeline tools:

```sh
docker compose --profile tools run --rm pipeline --help
```

For native development, install dependencies once and prefix commands with `uv run`:

```sh
uv sync --project pipeline --frozen --extra dev --extra extraction
uv run --project pipeline pipeline --help
```

The examples below use the native form. Replace `uv run --project pipeline pipeline` with `docker compose --profile tools run --rm pipeline` to use Docker instead.

## 3. Everyday commands

| Goal | Command |
| --- | --- |
| Seed company configurations | `uv run --project pipeline pipeline seed-companies` |
| Seed data for local UI development | `uv run --project pipeline pipeline seed-sample` |
| Find official reporting links | `uv run --project pipeline pipeline discover wise` |
| Inspect a PDF’s pages | `uv run --project pipeline pipeline locate path/to/report.pdf` |
| Prepare statement page groups | `uv run --project pipeline pipeline prepare-statements path/to/report.pdf prepared-pages` |
| Validate saved data | `uv run --project pipeline pipeline validate candidate.json source-inventory.json` |
| Replay a fixture without network access | `uv run --project pipeline pipeline replay contracts/fixtures/synthetic-replay.v1.json --offline` |

Every command has built-in help:

```sh
uv run --project pipeline pipeline <command> --help
```

## Working with reports

Start by discovering reports for a configured company, then work with a local PDF:

```sh
uv run --project pipeline pipeline discover wise
uv run --project pipeline pipeline locate path/to/report.pdf
uv run --project pipeline pipeline prepare-statements path/to/report.pdf prepared-pages
```

Use `download` for PDFs hosted on an approved publisher domain. Use `archive-local` when you have already retrieved an official PDF in a browser. Check `--help` before recording a filing because those commands require report metadata and, where applicable, storage configuration.

## Extraction and publishing

Extraction requires an `OPENAI_API_KEY`, a model name, a prepared PDF group, and the explicit `--allow-paid` flag:

```sh
uv run --project pipeline pipeline extract prepared-pages/income-pages-001.pdf MODEL_ID --allow-paid
```

Publishing is a separate operation that needs the dataset ID and its current generation:

```sh
uv run --project pipeline pipeline publish DATASET_ID EXPECTED_GENERATION
```

Keep `.env`, credentials, and archived PDFs out of Git. See [data sources](../docs/data-sources.md) for source coverage and selection guidance.

## Validate your changes

```sh
uv run --project pipeline --extra dev ruff check pipeline
uv run --project pipeline --extra dev ruff format --check pipeline
uv run --project pipeline --extra dev pytest pipeline/tests
```
