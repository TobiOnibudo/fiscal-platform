# Local Development and Reproducible Execution Plan

## Status

This document specifies the local developer experience to implement. The parent workspace contains planning originals and an example image. Create the application repository in its `fiscal-platform/` subfolder and initialize Git there only. The commands below are the required future interface and have not yet been implemented or executed successfully.

The application, database, archive, and processing orchestration must run locally. Fresh OpenAI-assisted extraction requires internet access and an API key. Reviewing a restored published dataset and reusing cached extraction outputs must not require cloud accounts or fresh model requests.

## 1 Execution modes

| Mode | Runs locally | External access needed |
| --- | --- | --- |
| Demonstration review | Next.js, Postgres, approved dataset | None after dependencies and dataset are available; publisher links need internet |
| Cached processing | Pipeline, archived PDFs, prior extraction outputs | None for reused outputs; unresolved model stages pause rather than fabricate results |
| Fresh ingestion | Discovery, downloads, PDF preparation, model extraction, validation | Publisher websites and OpenAI API |
| Hosted publication | Local validated pipeline targeting hosted Postgres | Explicit production database credentials and network access |

An offline review is only as complete as the retained source archive. A publisher URL is not a local PDF mirror.

## 2 Prerequisites and packaging

The primary setup uses Docker Engine with Compose and does not require a host Python installation. Provide Linux containers for web, db, pipeline, and migrate. Pin compatible images and dependency lockfiles during implementation.

The native developer path also needs a supported Node runtime, npm, Python, and project dependencies. Validate the chosen Next.js release's runtime requirements when pinning the project. See [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [Docker Compose](https://docs.docker.com/compose/gettingstarted/).

The Python application uses Typer for commands, Pydantic for strict extraction contracts, SQLAlchemy with psycopg for persistence, and Alembic for migrations. Next.js uses Kysely with pg; kysely-codegen generates database types from migrated local Postgres. pytest and Hypothesis cover source fixtures and financial transformation properties. Pin dependencies and generation configuration in lockfiles.

The current environment exposes Node, npm, Docker, and Git commands. Docker daemon readiness has not been checked. The Python command resolves to the Windows app launcher, which does not establish that a working Python interpreter is installed. uv was not discovered. These are environment observations, not setup validation.

## 3 Compose services and persistence

| Service | Responsibility | Lifetime |
| --- | --- | --- |
| db | Local Postgres with readiness checks | Persistent service and named data volume |
| web | Next.js application at localhost:3000 | Development or production application service |
| migrate | Apply reviewed Alembic revisions using `alembic upgrade head` | Explicit one-off command; sole schema migration authority |
| pipeline | Python CLI and PDF/OCR dependencies | Tools profile, one-off processing commands |

Persist source PDFs, extraction responses, manifests, and published snapshots under a configurable archive directory. Do not make source files available through the public web directory by default. Use container-managed dependency volumes where necessary to avoid host and container package conflicts.

Normal startup and shutdown must preserve the database and archive. Destructive reset is a separate documented operation, never part of a quickstart.

## 4 Configuration contract

Provide `.env.example` with safe local defaults and document how Compose passes the variables to each service.

| Setting | Responsibility |
| --- | --- |
| DATABASE_URL | Application read connection; local Postgres or hosted pooled endpoint |
| INGEST_DATABASE_URL | Explicit ingestion write target |
| MIGRATION_DATABASE_URL | Explicit migration target with appropriate privileges |
| ARCHIVE_DIR | Persistent PDF, evidence, response, and manifest storage |
| APP_BASE_URL | Local or deployed application URL |
| OPENAI_API_KEY | Optional for restored review; required for fresh model extraction |
| OPENAI_MODEL | Evaluated and pinned compatible model configuration |
| INGEST_ENV | Explicit local or production target designation |
| LOG_LEVEL | Bounded diagnostic logging without secrets |
| CRAWLER_CONCURRENCY | Bounded publisher request concurrency |
| CRAWLER_TIMEOUT_SECONDS | Per-request network timeout |
| OPENAI_MAX_CONCURRENCY | Bounded model request concurrency |
| OPENAI_RUN_BUDGET_USD | Optional explicit processing budget; absent does not enable unbounded execution |

The pipeline must distinguish host database URLs from container DNS names such as db. Local read and write roles may share a server but should have different privileges. Production uses separately configured roles and verified TLS; never globally disable certificate checking to make a connection work.

Never prefix the API key or database secrets with a public Next.js environment prefix. Keep real values out of Git, logs, browser responses, screenshots, and examples.

No cloud database credentials or API key are required simply to start the local review application. Missing extraction credentials should disable only the stages that need them.

## 5 Primary local setup commands

Implement the following PowerShell workflow:

```powershell
Set-Location fiscal-platform
Copy-Item .env.example .env
docker compose up -d db
docker compose run --rm migrate
docker compose --profile tools run --rm pipeline seed-companies
docker compose --profile tools run --rm pipeline restore-demo
docker compose up --build web
```

Open `http://localhost:3000`. The seed command creates company configuration; restore-demo imports an approved versioned dataset with provenance. Neither should trigger API extraction or silently overwrite an unrelated dataset. Make them idempotent and explain any required explicit replacement flag.

The shell-equivalent first step is `cp .env.example .env`; the Docker commands are otherwise the same. Ensure the project commands use cross-platform tooling rather than requiring Bash or Make on Windows.

## 6 Ingestion command contract

Provide independent stages for inspection, troubleshooting, and resumability:

```powershell
docker compose --profile tools run --rm pipeline discover --company wise
docker compose --profile tools run --rm pipeline download --company wise
docker compose --profile tools run --rm pipeline extract --company wise --pilot
docker compose --profile tools run --rm pipeline estimate --company wise
docker compose --profile tools run --rm pipeline run --company wise --full
docker compose --profile tools run --rm pipeline reconcile --company wise
docker compose --profile tools run --rm pipeline validate --company wise
docker compose --profile tools run --rm pipeline publish --company wise
```

The same commands accept adyen and later configured company IDs. Define run to orchestrate discovery through validation; publication remains explicit. No setup command or default run should initiate a full unbounded model backfill.

The pilot uses representative recent and historical statement page groups and produces extraction errors, actual usage, and an estimate for the remaining work. Full execution is explicit and uses bounded retries. When a configured budget would be exceeded, stop before scheduling further work and retain progress. An absent budget requires the pilot/full distinction and conservative bounded execution, not an assumption of unlimited funds.

Stage outputs include a run ID, completed and pending counts, validation status, API usage, and paths to stored artifacts. Return nonzero exit codes for failures and retain machine-readable failure details. Cached results must include the model, prompt, schema, document, and page-selection versions used.

Support `--offline` for processing cached artifacts. If a required artifact or response is missing, report it and stop that unit. Do not silently invoke OpenAI in offline mode.

Add company configuration through an explicit CLI operation during the first release. Persist it independently of code. Document adapter selection and unsupported-source failures.

## 7 Native development workflow

Provide tested npm scripts and a Python package entry point. The intended interface is:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r pipeline/requirements.lock
docker compose up -d db
npm run db:migrate
npm run dev
```

The Python lockfile must be generated and installed using a supported reproducible locking workflow. Include the native OCR dependencies when needed, or direct developers to the pipeline container for OCR. Do not imply that creating a virtual environment installs system OCR binaries.

Native Python invocations use the environment interpreter and the installed pipeline package. Document the actual module name when the package is scaffolded and keep it consistent with the container entry point. Load environment files explicitly in the application and CLI rather than assuming a shell automatically imports `.env`.

For macOS and Linux, use the virtual environment's bin/python path. Keep Windows-specific activation optional by documenting direct interpreter invocations.

## 8 Tests and production build

Use pre-commit as the single hook manager with explicitly installed pre-commit and commit-msg hooks. The staged hooks run Ruff lint/format, frontend ESLint and Prettier, configuration checks, conflict-marker detection, private-key detection, and large-file checks. Commit messages follow Conventional Commits. Full mypy and TypeScript checks, tests, database integration, and production builds run in GitHub Actions. Pin compatible tool versions and hooks. Document actual native and container helper commands once implemented.

Run commands from the fiscal-platform repository root. A clone does not automatically activate hooks. If a formatter changes files, review and stage those changes before retrying the commit. CI uses check mode and must not edit or commit generated fixes.

Implement and document:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run start
docker compose --profile tools run --rm pipeline test
```

The application production server must use the same local Postgres dataset. Start it separately from the development server to avoid port conflicts.

Implement `npm run db:types` to generate committed Kysely database types from local Postgres and `npm run db:types:check` to detect drift without editing tracked files. Run them against a fresh database after applying Alembic migrations; never generate or migrate against production as a side effect of a web build. The native `npm run db:migrate` script invokes the same Alembic migration command through the configured tooling.

Add a `pipeline replay --manifest <path> --offline` command that reuses frozen evidence, approved model responses, mappings, and corrections. It recomputes the logical published dataset and checks its expected hash without contacting a publisher or OpenAI. Ignore incidental run timestamps when comparing logical results. Missing artifacts must fail explicitly.

CI checks schema drift, decimal round trips, clean-database replay, and guarded publication against real Postgres. Tests must reject a second stale concurrent publisher and verify that exports retain the dataset version selected by the reviewer.

Implement `pipeline validate --company <id>` to emit machine-readable validation results and a readable issue summary. Validation runs source-grounding, completeness, period, unit, sign, financial-relationship, mapping, and comparative-selection checks, not only Pydantic schema parsing. `pipeline publish` must independently verify the candidate's current approval and rule versions; a manually changed CLI exit code cannot bypass publication checks.

Include corrupted-but-valid-schema AI fixtures in the default offline test suite: missing rows, swapped years, invented values, wrong source cells, incorrect signs or scales, parent-versus-group confusion, and false label merges. Confirm that failures produce specific issue IDs and block candidate approval or require the specified evidence review. Store the expected results so changes to prompts, validators, and mappings expose regressions.

Tests must not spend API credits by default. Use stored, versioned extraction fixtures and mocked responses for refusal, truncation, schema errors, and retries. Provide a separate explicit live evaluation command with usage reporting.

CI should run the relevant checks against an isolated Postgres service, with no production credentials. Use private-repository runner allowances conservatively and retain a complete local test path.

## 9 Snapshot and archive rules

A demonstration snapshot contains approved observations, selected source IDs, row mappings, review status, and dataset metadata. It is not a replacement for original PDF evidence.

Retain a manifest of source URLs and hashes. Keep downloaded reports outside committed application assets. If distributing the original archive is inappropriate or too large, document how to retrieve it and verify hashes, and clearly distinguish publisher access from retained local evidence.

Back up the local Postgres database and source archive separately. A restore command must verify the dataset and archive manifest versions before declaring source review available. Do not label restored data as newly scraped.

## 10 Hosted publication and deployment

Use GitHub Actions for CI-gated Vercel deployment of the tested commit. Keep one always-reporting aggregate check across component and shared integration jobs. Use job-level change detection rather than skipping an entire required workflow. Store scoped deployment secrets in the repository's configured environments; do not expose them to fork pull requests. Avoid duplicate automatic production deployment outside the Actions gate.

Run production migrations through an explicit serialized workflow; financial ingestion and dataset publication remain separate operations. Document required Vercel identifiers and token, production database credentials, branch rules, environment setup, and rollback to an earlier compatible application and dataset. A missing deployment credential must not prevent local development or offline tests.

Deploy the application using Vercel environment variables and a read-only hosted database role. Keep the OpenAI key out of the public review deployment when model calls run solely in the local pipeline.

Hosted migrations and publication require explicit target selection such as `--target production`; local is the default. Show the target environment and database identity without printing credentials before a mutation. Do not mix local and hosted URLs in one ambiguous environment file.

Validate the candidate dataset before publication. A failed run must leave the hosted active dataset unchanged. Keep a documented way to reactivate an earlier approved dataset version without deleting later observations.

Recheck free-plan limits and hosting eligibility before deployment. Serving the review app is distinct from paying for extraction requests.

## 11 Troubleshooting and operational behavior

| Situation | Required behavior |
| --- | --- |
| Docker engine unavailable | Report readiness failure with a clear engine-start instruction |
| Postgres not ready | Wait on bounded readiness checks and expose a useful error |
| Port already occupied | Explain the conflicting service or configurable port |
| Missing OpenAI key | Keep review working; stop fresh model extraction with a precise message |
| Publisher download failure | Retry transient failures within bounds and retain source status |
| Model or schema incompatibility | Stop the affected extraction and preserve the diagnostic artifact |
| Refusal or incomplete model response | Keep unit unresolved; never publish a partial table as complete |
| OCR tool unavailable | Use the pipeline container or report the missing dependency |
| Coverage gap | Keep the gap explicit in the application and source register |
| Failed reprocessing | Leave the published dataset active |

Document service logs, run IDs, and artifact locations. Logs may include source identifiers and usage but must redact secrets.

## 12 Acceptance checklist

- A fresh clone can start the local application using the documented prerequisites.
- Schema migrations run explicitly against an empty local database.
- Approved demonstration data can be restored without cloud credentials.
- All application API paths use `/api/v1`.
- Cached local review and model-response reuse incur no API calls.
- Frozen-input replay produces the expected logical dataset hash regardless of ingestion order.
- AI validation failures remain private candidates and cannot replace an approved published dataset.
- Alembic is the sole migration authority and generated Kysely types match the migrated schema.
- Fresh extraction uses only explicitly configured credentials and bounded execution.
- Sources, units, fiscal periods, and comparative history remain inspectable.
- Local linting, type checking, tests, and production build complete successfully.
- Ordinary shutdown preserves data; destructive reset is separate and documented.
- Documentation records commands actually exercised and any platform limitations discovered.
