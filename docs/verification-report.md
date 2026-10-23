# Implementation verification

## Completion verdict

The engineering foundation is implemented and runnable locally. The take-home assessment is **not complete**. Neither Wise nor Adyen has a source-reviewed, published ten-year dataset covering all three statements. There is no public deployment. The current UI correctly shows that no reviewed financial values have been published.

This report is for both the assessment owner and non-technical reviewers. It explains what can be inspected now, what the checks establish, and what work still separates the application from the requested financial deliverable. The original problem statement and original engineering proposal are not rewritten by this report.

## Open the deliverables

- Application: <http://127.0.0.1:3100/>
- HTML verification report: <http://127.0.0.1:3101/verification/>
- This document: <http://127.0.0.1:3101/verification-report.md>
- Machine-readable results: [results.json](verification/evidence/results.json)
- Python test details: [pytest.xml](verification/evidence/pytest.xml)
- HTTP smoke checks: [smoke.json](verification/evidence/smoke.json)

These addresses are local to this computer, not publicly hosted review links. The HTML file can also be opened directly from `docs/verification/index.html` after generation. It contains its own styles, uses no external assets, and can be printed from a browser. The Markdown document is editable in any text editor; it is not a Word document.

## Requirement and implementation matrix

| Requirement                             | What exists                                                                                                       | What remains                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Two or three European companies         | Wise and Adyen configuration and company switching                                                                | Establish reporting continuity and actual ten-year source coverage                                                                   |
| Scrape and classify IR PDFs             | Bounded official-index link discovery, approved-host PDF downloading, content hashes and an unreviewed manifest   | Exhaustive historical discovery, reviewed document classification and persisted filing inventory                                     |
| Extract three consolidated statements   | Typed extraction contract, local PDF text inspection, optional bounded model pilot and recorded-response decoding | Run the model pilot on actual reports, evaluate it, review all statement page groups and transcribe the historical reports           |
| Preserve reported values                | Exact decimal parsing, raw labels and raw value text, row-specific units and source evidence fields               | Validate actual issuer conventions and reconcile every extracted statement to its source                                             |
| Ten-year clean tables                   | Public dataset contract, annual coverage publication gate, statement table and fiscal range controls              | Build and approve the ten-year company datasets; currently none are available                                                        |
| Deduplicate and follow latest reporting | Reviewed concept identifiers, label aliases, preserved source order and historical-row controls                   | Construct and review issuer-specific equivalence decisions and latest-report layouts; there is no end-to-end automatic layout mapper |
| Latest compatible comparative           | Deterministic selection tests, compatibility checks and unresolved-conflict rejection                             | Verify actual comparative changes and restatements against report evidence                                                           |
| Source inspection and exports           | Cell inspector, PDF page links, version-pinned CSV and current-page filing manifest                               | Exercise populated real-data flows in a browser and supply all referenced filing records                                             |
| Extend to another company               | Persisted issuer registration and approved source-host configuration                                              | New issuers still need discovery, coverage research, mappings and source review; arbitrary-company ingestion is not automatic        |
| Local execution                         | Native Node, Python and PostgreSQL path; authored Docker Compose alternative                                      | Verify a fresh-clone container startup; the Docker daemon was not usable in the implementation session                               |
| Versioned APIs and release tooling      | Read-only `/api/v1` routes, OpenAPI, migrations, generated query types, hooks and Actions definitions             | Run remote CI, configure protected deployment environments and deploy Vercel with a hosted read-only database                        |

The download CLI archives bytes and a manifest. It does not by itself populate every database filing record or publish an extracted dataset. There is not yet a complete command that crawls a company, classifies every report, extracts all statements, assembles a reviewed candidate and publishes it without additional operator work.

## What the automated checks establish

The current execution evidence is in `verification/evidence/results.json`, with a timestamp, the base Git commit, runtime versions, commands, durations, exit codes and links to individual logs. Working-tree status is recorded separately. The commit alone does not identify uncommitted or untracked files and is not a complete input-content manifest. Treat the evidence as the result of a specific run, not an evergreen guarantee. The HTML report reads those recorded results when it is generated; green states are not hand-authored.

The verification runner executes Python linting and formatting, strict Python types, the Python suite against an explicitly configured disposable database, generated contract drift checks, Alembic schema drift checks, frontend linting and types, frontend API and renderer tests, generated database type checks and a production Next.js build. It compares SHA-256 hashes for the protected problem statement and proposal. It also probes the running application over HTTP.

The financial tests exercise exact decimals beyond JavaScript's safe integer range; reported, missing and unreadable states; independent row and period inventories; metadata mismatches; rejection of AI-controlled approval flags; compatible comparative selection; conflicting observations; sparse historical concepts; known-cell omissions; ten annual periods; immutable evidence and published snapshots; and concurrent publication generation conflicts. Frontend tests exercise aliases, row order, mixed units, source action markup, error messages, query validation, export pinning, and spreadsheet-active text escaping.

Tests use deliberately synthetic fixtures. A passing test means the code behaved as asserted on those inputs. It does not prove complete PDF coverage, correct transcription of real reports, or the quality of a model that has not yet been evaluated on this task.

### Expected empty-state HTTP behavior

| Request                         | Expected result               | What it establishes                                                                  |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/v1/health`            | `200`, ready                  | The web reader can query the migrated app database                                   |
| `GET /api/v1/companies`         | `200`                         | Collection metadata can be read                                                      |
| Wise and Adyen statements       | `404`, `NO_PUBLISHED_DATASET` | Unpublished data is not presented as a valid statement                               |
| Wise filings                    | `200`                         | The filing inventory endpoint is reachable; an empty list is not successful scraping |
| Wise quality                    | `404`, `NO_PUBLISHED_DATASET` | No coverage claim is fabricated                                                      |
| Export without a pinned version | `400`, `VERSION_REQUIRED`     | Exports require an explicit publication identity                                     |
| Unknown query parameter         | `400`, `INVALID_REQUEST`      | API input validation is active                                                       |

The expected `404` responses above are successful verification of the current empty state, not proof that a company dataset exists.

## Five minute human walkthrough

1. Open the application. Select Wise, then Adyen. Check that the company heading and fiscal year-end description follow the selection.
2. Switch among Income statement, Balance sheet and Cash flow. Each should explain that reviewed data has not been published. Disabled search, range and export controls must not imply working real-data results.
3. Open Filings. Inspect the search and classification controls and the empty inventory message. An empty inventory means the secondary filing output remains unfinished.
4. Open Data quality. Read the definition of verified and the missing coverage state. A database/request failure must instead say coverage could not load, not assert that coverage is absent.
5. Open the HTML report, then a test log and the machine-readable results. Confirm the timestamp, base Git commit and working-tree status, pass/fail/skipped states and original-document hashes.

The source inspector, populated table scrolling, fiscal range filtering, CSV downloads and restatement examples cannot yet be demonstrated with reviewed company data. Renderer and unit tests cover portions of that behavior, but are not a substitute for a populated browser review. Synthetic company amounts have not been inserted into the production-style review interface to fill this gap.

## Validation and architecture boundaries

The model proposes transcription; it does not approve it. Recorded output must match a strict Pydantic contract, and self-asserted mapping or evidence review flags are removed. Independent source inventories and deterministic checks establish whether rows, periods, raw numeric text, units, currency, reporting basis, scope and selected observations agree. Unresolved checks block publication. There is no claim that every accounting identity or issuer-specific reconciliation has already been automated.

The optional model pilot requires a local API key, an explicit model and `--allow-paid`. It bounds page count, input bytes and output tokens, disables automatic retries and supports cached offline responses. No request to OpenAI is needed for setup or the verification suite, and no paid request has been made for the current implementation. These limits constrain usage but are not a calculated dollar budget or evidence of model accuracy.

Alembic is the migration authority. SQLAlchemy owns ingestion transactions, while the web app uses Kysely types generated from the database and validates financial JSON at runtime. Publication requires an approved, source-grounded dataset and locks a company generation so stale concurrent publishers cannot replace it. Published snapshots and observations are protected from ordinary update/delete operations. The app reads through a separate read-only connection; it has no endpoint that performs ingestion or approval.

## Reproduce the verification

Run from the `fiscal-platform` repository. Install the prerequisites in [README](../README.md). The current machine uses the repository-local Node 22.23.4 and Python environment. Start the application and configure separate database connections before running:

```powershell
# Never point TEST_DATABASE_URL at a database containing data you need.
# Integration fixtures truncate tables in this explicitly disposable database.
$env:TEST_DATABASE_URL = 'postgresql+psycopg://USER:PASSWORD@HOST:PORT/DISPOSABLE_TEST_DB'
$env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@HOST:PORT/DISPOSABLE_TEST_DB'
$env:FISCAL_APP_URL = 'http://127.0.0.1:3100'
uv run --project pipeline alembic -c pipeline/alembic.ini upgrade head
node scripts/verify-local.mjs
node scripts/render-verification.mjs
```

`DATABASE_URL` in the verification shell is used for type introspection; it does not change an already-running app process. The existing app remains connected to its own database. The runner does not create or choose a test database automatically and never derives its test connection from the app connection. Database-dependent checks are explicitly skipped when their configuration is absent. Logs may include local file paths; inspect them before sharing outside the team.

Run `npm run format:check` and `pre-commit run --all-files` separately after generating the report. A build passing locally does not establish that Docker, GitHub Actions or Vercel has executed successfully.

## Local services and restart

The review app uses port 3100. A separate documentation server serves only `docs/` on loopback port 3101. The app can run without the documentation server; the generated HTML can also be opened from disk. The database is the isolated native PostgreSQL instance on loopback port 55432 for this workstation, not a cloud service.

For a normal configured clone, `npm run dev -- --port 3100` loads the root `.env` and starts the app. To serve this report with an activated Python environment:

```powershell
python -m http.server 3101 --bind 127.0.0.1 --directory docs
```

Do not delete database volumes or archives to stop the app. Use Ctrl+C in the corresponding terminal when running interactively. Starting a server and seeing an empty state is useful for UI review, but is not completion of the financial assignment.

## Remaining release gates

1. Discover and classify official historical PDFs, resolve coverage and predecessor questions, and populate the filing inventory.
2. Run a bounded, evaluated extraction pilot; review statement boundaries, all comparative columns and numeric conventions against the originals.
3. Implement candidate assembly/import and reviewed mappings, including latest layout and historical concept handling. Complete all three statements for the required ten years for both issuers.
4. Reconcile statements and source evidence, then publish approved immutable snapshots. Test populated keyboard, source inspection, mobile table and export workflows with real data.
5. Verify container startup and remote CI, resolve compatible development dependency security updates, configure Vercel/hosted Postgres credentials and deploy a public reviewer link.

The previous production dependency audit was clean, but development-only transitive findings remain. A formal accessibility audit, load test, independently observed fresh-clone run and external usability participant review have not been completed. Those are separate from the current unit, integration, build and local HTTP evidence.
