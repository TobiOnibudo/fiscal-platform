# Fiscal statement review platform

Next.js review workspace and a Python ingestion pipeline for source-grounded consolidated financial statements. Wise and Adyen are configured demonstration issuers; the pipeline can register other issuers.

This milestone implements the application shell, exact decimal transformations, independent source validation, comparative selection, migrations, and guarded publication. **No ten-year company dataset has been extracted or verified.** The interface exposes this gap. Committed financial fixtures are synthetic test inputs, never company results. `restore-demo` deliberately exits unsuccessfully until a source-reviewed snapshot exists.

For a local UI walkthrough only, `pipeline seed-sample` installs an explicitly labelled illustrative ten-year dataset for Wise and Adyen. Start the web app with `FISCAL_ALLOW_SAMPLE_DATA=true`; sample values are never eligible for the verified publication workflow and must not be used as company data.

## Review the current milestone

The local review session uses [the app](http://127.0.0.1:3100/) and a separate [HTML verification report](http://127.0.0.1:3101/verification/). Read the [detailed verification document](docs/verification-report.md) for the requirement matrix, human walkthrough, reproducible commands, and remaining release gates. [Recorded evidence](docs/verification/evidence/results.json) includes logs, test totals, HTTP checks and protected-document hashes. These are local addresses, not a public deployment.

## Local setup

Install Node 22.14 or later (22.23.4 is the tested version), npm, Python 3.12, and uv 0.13.5. Docker Compose is the optional database/container path. No cloud credentials are required for review or tests.

```powershell
Copy-Item .env.example .env
npm ci
uv sync --project pipeline --frozen --extra dev --extra extraction
docker compose up -d db
docker compose run --rm migrate
docker compose --profile tools run --rm pipeline seed-companies
npm run dev
```

Open <http://localhost:3000>. Database service readiness does not apply migrations automatically. Ordinary `docker compose down` preserves the named database volume and `archive/`. The frontend Dockerfile also supports `docker compose up --build web`; container startup was not verified in the implementation environment because Docker Engine returned internal errors.

The root `dev` and `start` scripts load the root `.env` and bind to loopback. Production hosting supplies its own environment variables. Do not commit credentials or add the extraction key to the hosted web application.

### Local OpenAI key

Put your key on the `OPENAI_API_KEY=` line in `fiscal-platform/.env`. This local file is ignored by Git; `.env.example` contains only an empty template. Do not paste keys into chat, commit them, or prefix them with `NEXT_PUBLIC_`. The ingestion CLI loads the file when run from the repository root. Adding a key does not start extraction or spend credits; fresh model requests still require an explicit extraction command. The key alone does not complete the remaining ingestion and publication workflow.

For native Postgres, set `MIGRATION_DATABASE_URL` and `INGEST_DATABASE_URL` to explicit `postgresql+psycopg://...` connections and `DATABASE_URL` to a read-only `postgresql://...` connection. For the local extraction workspace only, set `REVIEW_DATABASE_URL` to the limited reviewer role and `REVIEW_MODE=local`. Do not configure either review variable in Vercel. Run:

```powershell
uv run --project pipeline alembic -c pipeline/alembic.ini upgrade head
uv run --project pipeline pipeline seed-companies
npm run db:types:check
```

Alembic is the only migration authority. Web queries use Kysely-generated database types and strict runtime payload validation. Amounts remain decimal strings in public JSON and CSV. The migration and ingest roles must be separate from the production web read role; `.env.example` contains local development credentials only.

## Operator commands

```powershell
uv run --project pipeline pipeline --help
uv run --project pipeline pipeline add-company example "Example plc" https://example.com/reports example.com --fiscal-month 12
uv run --project pipeline pipeline discover example
uv run --project pipeline pipeline download example https://example.com/annual.pdf
uv sync --project pipeline --extra storage
uv run --project pipeline pipeline download wise https://publisher.example/annual.pdf --store-r2 --record-filing --title "Wise annual report 2024" --classification annual_report --published-on 2025-03-27
uv run --project pipeline pipeline locate archive/pdf/REPORT_HASH.pdf
uv run --project pipeline pipeline validate candidate.json independent-inventory.json
uv run --project pipeline pipeline replay contracts/fixtures/synthetic-replay.v1.json --offline
uv run --project pipeline pipeline publish DATASET_HASH EXPECTED_GENERATION
```

Discovery inspects one configured official index and emits stable sorted leads. It does not claim exhaustive discovery, classify documents as annual reports, or establish statement coverage. Downloads require explicitly approved HTTPS public publisher hosts, validate each redirect, bound bytes, verify PDF signatures, and preserve content-addressed bytes and manifest entries. Newly registered companies use stored configuration, not ticker matching.

Fresh extraction is a separately installed optional adapter using the official OpenAI SDK. `extract PDF_PATH MODEL_ID --allow-paid` allows exactly one request for a reviewed 1–6 page PDF group of at most 5 MB, with bounded output tokens, no automatic retries, and an explicit model identifier. To persist an extraction for review, first register its original report with `download --store-r2 --record-filing`, then run `ingest-extraction COMPANY FILING_ID PDF_PATH MODEL_ID --allow-paid`. This creates immutable `needs_review` observations in Postgres. `--offline` requires a cached response and never constructs a client. Raw provider responses, configuration, usage and model metadata are retained under `archive/attempts/`. `store=false` does not imply zero provider retention. Source page mapping back to the original full report and model evaluation remain operator review requirements; model output always loses any self-asserted review flags.

Source inventory is an independent human-reviewed artifact. Candidate output cannot create its own completeness evidence. Stable source row IDs preserve repeated labels; explicit currency, period boundaries, row units, page locations and numeric conventions prevent plausible but wrong transcriptions from approval. Unsupported numeric text and unresolved mappings/precedence block publication.

The local Review navigation can record append-only per-cell approve/reject decisions after an extraction is persisted. It is deliberately disabled outside a local process: Vercel receives only the read-only `DATABASE_URL` and has neither a review writer nor the extraction key. Publication still requires a complete API payload, ten consecutive annual periods per statement, independently validated source bundles, reviewed cells and mappings, and deterministic latest compatible selection. Sparse historical concepts remain missing history; absent source amounts are never fabricated. Publication locks a per-company generation to reject stale publishers and retains prior immutable published snapshots.

## Checks and hooks

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
uv run --project pipeline --extra dev ruff check pipeline
uv run --project pipeline --extra dev ruff format --check pipeline
uv run --project pipeline --extra dev --extra extraction mypy --config-file pipeline/pyproject.toml pipeline/src/fiscal_pipeline
uv run --project pipeline --extra dev pytest pipeline/tests
uv run --project pipeline python -m fiscal_pipeline.contracts --check
uv run --project pipeline --extra dev pre-commit install --hook-type pre-commit --hook-type commit-msg
```

Run integration tests only against a disposable migrated Postgres database: set `TEST_DATABASE_URL` to its SQLAlchemy URL. Integration fixtures truncate financial tables there. With no test URL these tests explicitly skip; CI supplies isolated Postgres and runs them. Default tests never spend API credits. Synthetic fixture artifacts are generated by `scripts/generate-test-fixtures.py`; JSON schemas by `python -m fiscal_pipeline.contracts`.

pre-commit is the sole hook manager. It runs staged Ruff, ESLint, Prettier, configuration syntax, merge conflict, private key, large-file, and Conventional Commit checks. Hooks need explicit installation after cloning. Formatters may modify files; review and stage their changes. CI independently runs check mode, type checks, tests, build, schema drift and real Postgres publication tests. Require the `required` aggregate job in branch protection.

Current verification: 34 Python tests, 18 frontend tests, strict mypy, TypeScript, Ruff, ESLint, formatting, and the production build pass locally. Hooks were installed and all-file checks passed. The implementation-time npm production audit reported no vulnerabilities; six high-severity development-only transitive findings remain to be resolved with compatible tooling updates. Remote CI and container execution are not established by these local checks.

## Hosting and remaining work

GitHub Actions deploys successful trusted `main` commits when repository variable `DEPLOY_TO_VERCEL=true` and production Vercel credentials are configured (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Disabled deployment jobs are skipped; enabled deployments fail on missing credentials. Configure the Vercel project root as `apps/web`, a read-only hosted `DATABASE_URL`, and disable duplicate automatic Git deployments. Production migration is a separate serialized manual workflow using the protected `production-migrations` environment and its `MIGRATION_DATABASE_URL` secret. The web deployment has no extraction key. No hosted deployment has been performed.

Confirm current Vercel personal-use eligibility and Neon free-plan limits before hosting; account setup and secrets are external prerequisites. Migrations must be backward compatible with the prior app. Roll back an app to an earlier compatible deployment and reactivate a prior approved published dataset using the expected generation; never delete later financial history to roll back.

The next financial milestone is actual official PDF coverage and independently reviewed extraction for all three statements, then provenance-complete mappings and snapshot import. Coverage gaps and predecessor reporting compatibility remain in [the source register](docs/data-sources.md). The [implementation plan](docs/implementation-plan.md) and [local development plan](docs/local-development.md) are preserved planning baselines; their future command list is broader than this implemented milestone. There is no full-backfill orchestrator, unattended review UI, cost-estimated full-ingestion command, or approved real-company snapshot yet.
