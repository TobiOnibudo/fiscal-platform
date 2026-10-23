# Financial Statement Review Platform Implementation Plan

## Document purpose and status

This is the implementation plan for the Fiscal.ai take-home assessment. It explains the intended product, data pipeline, interfaces, local execution, validation, delivery sequence, and the reasons for the architecture. It is a plan, not evidence that the application or proposed commands have been implemented.

The demonstration companies are Wise and Adyen. They exercise the reusable system; they must not become hardcoded boundaries in the extraction or application logic.

This document is separate from the original [problem statement](problem-statement.md) and the earlier [engineering proposal](engineering-design.md). Neither existing document is modified. The researched source register is in [data sources](data-sources.md), and the proposed local workflow is in [local development](local-development.md).

## 1 Product goal and definition of success

Deliver a live application in which a non-technical reviewer can explore ten years of consolidated Income Statement, Balance Sheet, and Cash Flow data, understand the selected reporting versions, and verify values against original documents.

The primary review questions are:

- What did the company report for this period?
- What units, reporting scope, and accounting basis apply?
- Is this the latest compatible value reported for that period?
- Where is the source evidence?
- Why have historical labels been combined or kept separate?

Accuracy, comprehensibility, and traceability are joint release requirements. Visual polish does not establish extraction quality, and a technically complete extraction is not sufficient if people cannot review it easily.

### Required capabilities

1. Discover and classify investor relations PDFs, retaining a searchable filing inventory.
2. Extract all rows and all annual comparative columns in the three consolidated statements.
3. Assemble a clean ten-year view using company-specific concepts and the latest compatible observations.
4. Preserve original observations, row labels, structure, units, and source references.
5. Deploy a review application and run the same application and pipeline locally.
6. Support adding companies through configuration and adapters.

The deduplication and latest-comparative requirements are core functionality of the default view, even though the assignment describes them as bonuses.

### Coverage gate

Before a full backfill, complete the source coverage matrix for both companies. Target the latest ten completed fiscal years with verified statements, not ten arbitrary report titles. Wise's fiscal years must remain distinct from Adyen's calendar-year reporting.

Ten-year completeness has not yet been established. If required periods remain unavailable, retain the selected companies, document the exact gap, and request a scope decision before substituting a company or presenting supplemental sources as satisfying the annual-report requirement. A partially complete demo can be shown honestly, but it does not pass the original ten-year release gate.

## 2 Architecture and responsibility boundaries

### Repository boundary

Create one monorepo in `fiscal-platform/`, a new subfolder of the current planning workspace. Initialize Git inside that folder only. The Next.js application, Python package, shared contracts, and CI configuration share a history so schema and interface changes can be reviewed together.

```text
fiscal_ai_take_home/
  docs/                         Existing planning originals, preserved
  fiscal-platform/              Git repository boundary
    .github/workflows/
    apps/web/
    pipeline/                   Python package and Alembic revisions
    contracts/                  Exported schemas and shared fixtures
    docs/                       Tracked baseline and implementation records
    compose.yaml
    .env.example
    README.md
```

Copy the planning documents into the new repository as its initial baseline, excluding editor swap files. After that baseline, implementation updates belong in the repository's tracked docs. Preserve the original workspace documents, including the problem statement and earlier engineering proposal. Use npm workspaces and a Python package; Nx or Turborepo is unnecessary initially.

```text
Company configuration and approved source entry points
                         |
             Discovery and classification
                         |
          Immutable PDFs and source manifest
                         |
       Local page location and evidence extraction
                         |
       OpenAI structured statement transcription
                         |
        Deterministic checks and exception review
                         |
      Concept mapping and comparative selection
                         |
       Candidate dataset and publication checks
                         |
        Versioned published Postgres dataset
                         |
           Next.js financial review workspace
```

### Technology choices

| Responsibility | Choice | Reason |
| --- | --- | --- |
| Application | Next.js App Router, TypeScript, Node runtime | Fits the preferred hosting and supports dynamic server queries |
| Styling and controls | Tailwind, shadcn/ui, Lucide | A consistent, customizable set of accessible interface primitives |
| Statement tables | TanStack Table with semantic HTML tables | Supports structured tables without a paid grid dependency |
| Animation | Motion, used sparingly | Useful interaction feedback with reduced-motion support |
| Database | Postgres locally; Neon Free when deployed | One schema and query model across development and hosting |
| Python database access | SQLAlchemy ORM and Core with psycopg | Typed models, explicit transactions, parameterized operations, and reusable repositories |
| Schema migrations | Alembic, as the only migration authority | One reviewed schema history shared by Python and Next.js |
| Web database access | Kysely with pg and generated database types | Typed server-side reads against standard local or hosted Postgres |
| Ingestion application | Typer CLI with separate stage services | Structured commands and validation rather than one monolithic Python script |
| Extraction contracts | Pydantic with strict fields and explicit financial validators | Rejects malformed records and controls boundary conversions |
| Financial verification tests | pytest and Hypothesis | Source fixtures plus generated edge cases for numeric and reconciliation rules |
| Model integration | Official OpenAI Python SDK and Responses API | Supports PDF inputs and structured extraction |
| Original sources | Filesystem archive keyed by content hash | Preserves exact source bytes without cloud storage requirements |
| Hosting | Vercel, where free-plan use is eligible | Preferred Next.js deployment with a reviewer-accessible URL |

Magic UI, Aceternity UI, React Bits, and 21st.dev are optional sources for specific components. Do not install every library or mix visual systems. The statement workspace should earn its quality through information hierarchy and interaction design.

### Local and production parity

Use the same schema, data contracts, adapters, reconciliation rules, and publication checks in both environments. Local execution uses Postgres and a local archive. Hosted review uses Neon and links to publisher originals until hosted document storage is introduced.

Heavy ingestion remains outside Next.js requests and deployment builds. The initial operator runs ingestion locally and publishes approved results to the target database. Public visitors cannot trigger model extraction in the first release.

Free infrastructure remains the baseline. The user's OpenAI key enables metered extraction, so API usage is a separate cost consideration rather than a free hosting feature. Do not assume that possession of a key implies an unlimited budget.

### Framework responsibilities and schema ownership

The Python pipeline is an application package with separate discovery, extraction, validation, reconciliation, persistence, and command modules. Typer exposes its commands; domain functions remain callable in tests without invoking a shell. SQLAlchemy repositories handle database access, Pydantic handles input contracts, and financial rules remain explicit domain code. Frameworks reduce plumbing errors; they cannot establish that a financial interpretation is correct.

SQLAlchemy model metadata describes the intended schema. Reviewed Alembic revisions are the authoritative deployment history. The migrate container runs `alembic upgrade head`; application startup never runs ORM table creation or attempts automatic schema repair. Alembic-generated revisions must be reviewed, especially for renames, constraints, backfills, and changes that could round existing values. See [SQLAlchemy transactions](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html) and [Alembic migration review](https://alembic.sqlalchemy.org/en/latest/autogenerate.html).

Next.js uses Kysely and pg for read queries. Generate its database types using kysely-codegen against an isolated Postgres instance containing the applied Alembic migrations, then commit the generated types. Kysely is not a second schema or migration owner. Do not introduce a parallel Prisma, Drizzle, or Kysely migration history. Type generation is a development and CI operation, not a production startup operation. See [Kysely](https://www.kysely.dev/docs/intro) and [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen).

Pydantic models define the extraction contract and export its versioned JSON Schema. Use strict field validation, reject unexpected fields, and explicitly parse financial strings into Decimal only after preserving their original text. TypeScript must validate relevant stored payloads at runtime against the exported contract; generated database types alone cannot validate JSON evidence or establish financial meaning. Keep the OpenAI-compatible schema projection versioned and test it, because the provider supports a subset of JSON Schema. See [Pydantic strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/) and [schema generation](https://docs.pydantic.dev/latest/concepts/json_schema/).

Persist stage checkpoints and artifacts so the Typer application can resume after interruption. A hosted orchestration framework is not required for the first release. Revisit Prefect or another durable orchestrator when hosted scheduling and multiple workers become actual requirements; it must call the same domain stages rather than replace their correctness rules. See [Typer](https://typer.tiangolo.com/).

### Determinism contract

Determinism applies to replay of recorded inputs. It does not mean that a publisher never changes a PDF or that a fresh model generation will return identical output. Cache and retain model attempts as evidence; approved replay never makes a new model request. Do not describe a sampling setting, fixed prompt, or model snapshot as a guarantee of identical generations.

| Stage | Deterministic behavior required | Uncertainty boundary |
| --- | --- | --- |
| Discovery replay | Process a frozen source manifest in stable URL order | A live website and its documents can change |
| Evidence preparation | Use pinned tooling, page mapping, extraction settings, and recorded text/image artifacts | PDF rendering or OCR can differ across tools and environments |
| Model transcription | Reuse the exact recorded approved response identified by hash | Fresh generations remain probabilistic and require validation |
| Numeric parsing | Explicit decimal grammar, signs, scale, and missing-value rules; no ambient locale | Ambiguous conventions produce a review issue |
| Mapping | Apply versioned approved concept associations | New model or fuzzy matching suggestions are unapproved proposals |
| Comparative selection | Use recorded compatibility and precedence decisions | Conflicting observations without established precedence block approval |
| Presentation and export | Stable hierarchy, ordering, decimal serialization, and dataset identity | UI filters must explicitly identify the selected view |
| Publication replay | Reproduce the same selected observations and logical dataset hash | Run timestamps and audit IDs may legitimately differ |

Create a frozen replay manifest containing source hashes, relevant evidence and response hashes, configuration versions, approved mappings, corrections, publication metadata, and rule versions. Financial transformations must not depend on the current clock, machine locale, incidental filesystem order, or whichever asynchronous task finished first.

Use canonical serialization with explicit ordering for the financial dataset hash. Exclude incidental run IDs and timestamps, but include source identities, selected values, units, period dates, original labels, reviewed mappings, and presentation structure. Replaying the same frozen inputs must produce the same logical hash. Preserve raw numeric text separately from any canonical decimal representation.

Unknown publication dates and conflicting observations must not be resolved by arbitrary ID order, retrieval time, or a guessed date. A stable tie-break may order identical duplicates; a substantive conflict needs an explicit recorded decision. Deterministically returning a review issue is preferable to consistently selecting the wrong value.

## 3 Source discovery and evidence preservation

### Company configuration

Store a stable company ID, legal name, listing identifiers, investor relations entry points, approved document domains, report language preferences, fiscal-year conventions, and optional adapter configuration. Ticker alone is not a unique issuer identifier.

Document predecessor entities and corporate reorganizations. Do not combine predecessor and successor histories until reporting continuity is reviewed. Never substitute subsidiary accounts for group consolidated accounts.

### Discovery

Use ordinary HTTP traversal first. Follow relevant reporting archives, pagination, document links, and official announcements within bounded traversal and concurrency limits. Add browser discovery only for sites that require rendered interaction.

Validate user-supplied URLs and redirects against public HTTP or HTTPS destinations, blocking private and local network targets. Validate PDF signatures, bound file size and page count, honor access restrictions, and record inaccessible sources rather than claiming exhaustive discovery.

For each document retain discovery and resolved URLs, publisher identity, retrieval time, content type, content hash, classification, publication metadata, inferred periods, and retrieval status. Preserve alternate URLs for duplicate content. Changed bytes at the same URL produce a new document version.

### Classification

Classify annual reports, interim reports, presentations, results releases, sustainability reports, prospectuses, regulatory disclosures, and other documents. Use document contents alongside link titles. Uncertain cases require review. A presentation or annual review is not automatically a full annual financial report.

Store classification method, version, supporting evidence, and review status. Keep unrelated filings in the inventory even though only appropriate financial statements enter extraction.

### Source register

Maintain a machine-readable manifest and a human-readable source document. Record actual periods found inside each PDF rather than relying on referring-page labels. Keep printed page numbers and one-based PDF page numbers separately, with a clear conversion from any zero-based parser indices.

The source register must explicitly distinguish discovered links, successful downloads, inspected documents, extracted statements, and verified data. A search result is a lead, not proof of full statement coverage.

## 4 OpenAI assisted extraction and verification

### Chosen approach

Use OpenAI for interpreting statement layout and proposing structured transcriptions. Use deterministic code and direct source review to establish whether those transcriptions are publishable. Model confidence or agreement between model calls does not prove correctness.

The Responses API can process PDF text and page images using compatible models. Structured Outputs constrains response shape, not financial truth. These capabilities support this architecture but do not replace its verification steps. See [PDF inputs](https://developers.openai.com/api/docs/guides/file-inputs) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

### Stage A Locate and package complete statements

1. Extract local text, words, and coordinates from the archived PDF.
2. Locate candidate consolidated statements using contents pages, headings, and financial context.
3. Include continuation pages, year headers, currency and scale disclosures, note references, and relevant presentation-change explanations.
4. Create bounded statement PDF inputs and preserve the mapping back to the original document.
5. Check that all three statements were located; a locator failure must not silently become an empty extraction.

The model can assist with uncertain page location. Do not reduce context so aggressively that units, annual column headings, or continuation rows are lost. A report's complete statement page group is the unit of extraction, rather than arbitrary text chunks.

### Stage B Transcribe into a strict contract

Request every row and annual column in original order. Keep extraction separate from deduplication, normalization, and financial calculations.

The extraction contract includes statement identity, scope, accounting basis, period headers, currency and units, rows, hierarchy, raw labels, note references, raw cell text, and evidence references. Permit explicit unreadable and ambiguous states rather than forcing a number into every cell.

Prompt instructions must prohibit estimating missing values, replacing labels with generic ones, silently fixing arithmetic, or obeying instructions embedded in report content. The extraction request has no execution or browsing tools.

Treat model-supplied page references and bounding boxes as proposals. Validate them against the source; do not treat a generated citation as proof that a value was found.

Handle refusals, truncation, incomplete responses, schema failures, and transport errors explicitly. Partial tables never become complete extractions by default.

### Stage C Check the transcription

Parse financial text deterministically with decimal arithmetic. Preserve parentheses, sign characters, decimal conventions, blanks, dashes, percentages, per-share units, and footnote markers. Missing and zero remain distinct.

Validate each value in its row-and-column context. Finding the same number elsewhere on a page is insufficient. Check period alignment, row completeness, continuation coverage, scale, scope, duplicate cells, and source evidence.

Check applicable financial relationships using explicit statement structure and disclosed rounding precision. Balance-sheet equality and cash-flow reconciliation are supporting checks; compensating errors can still produce balanced totals.

For scanned documents, OCR matching alone cannot establish correctness. Visual comparison and review remain required where reliable text evidence is unavailable.

### AI validation subsystem and publication gate

Implement validation as a dedicated domain service invoked after every model attempt, after reviewed corrections, after concept mapping, and before publication. Pydantic validates the response contract; financial validators evaluate source grounding, completeness, and usability. No successful API response or parsed JSON goes directly into the public dataset.

Preserve each raw response with its input artifact hashes, prompt and schema versions, model configuration and returned identity, request identifier where available, usage, and attempt status. Derive candidate observations from this immutable record. Keep validation results separate so improved validators can reassess earlier attempts without overwriting their evidence.

| Gate | Required checks | Failure behavior |
| --- | --- | --- |
| Response integrity | Complete response, supported schema version, no refusal or truncation, bounded collection sizes | Reject attempt; bounded retry or review |
| Strict contract | Expected fields and types, allowed enums, unique row and period identities, finite decimal syntax | Reject malformed candidate; no silent coercion or extra fields |
| Document identity | Correct issuer, consolidated scope, actual statement, annual duration or instant, original page mapping | Block statement approval |
| Source-cell grounding | Label, raw value, period column, sign, and unit anchored to the correct source location | Quarantine unmatched or ambiguous cells; numeric occurrence alone is insufficient |
| Completeness | All source rows, annual columns, headers, continuation pages, and relevant unit disclosures accounted for | Block completeness approval; partial statements remain explicitly partial |
| Numeric semantics | Explicit decimal convention, parentheses and sign handling, scale, per-share exceptions, zero versus missing | Block affected cells or statement; preserve raw source text |
| Financial relationships | Applicable subtotals, balance-sheet identity, and cash reconciliation with documented tolerances | Record discrepancy for review; never change a number just to balance |
| Mapping and comparability | No unsupported label merges, lost history, duplicated concepts, scope or basis mixing | Block clean-view approval for affected mappings |
| Comparative selection | Latest compatible observation selected with established publication precedence | Block conflicting or unexplained selection |
| Public usability | Every visible amount has period, unit, source lineage, stable row position, and dataset identity | Reject candidate publication |

Completeness needs evidence outside the model's own assertion that it extracted everything. Compare candidate rows and headers with independently collected page text and layout signals and account for continuation boundaries. These signals can also fail; when a reliable automated completeness check is unavailable, require direct page review rather than inferring a pass from row counts. Scans and complex layouts require visual review for unsupported cells and boundaries.

Produce structured issues containing check ID and version, severity, company, filing, statement, row and period where applicable, expected condition, observed evidence, and resolution status. Distinguish a genuine not-reported source value from an extraction failure. A disclosed historical gap may be displayed honestly, but it still fails the ten-year completeness requirement.

Attempt and candidate states are explicit: draft, validation_failed, needs_review, and approved. A review decision must identify evidence and a reason. Correcting an observation creates a new reviewed candidate and reruns affected checks; it does not edit a pass flag. Non-applicable checks require a reason. Human review cannot waive source identity, provenance, schema integrity, or the prohibition on invented amounts.

If the source itself contains an arithmetic discrepancy, preserve its reported figures. A reviewer may resolve the discrepancy as source-confirmed with evidence and a visible exception; the system must not silently repair it or present an unexplained failed equation as fully reconciled. Unresolved material issues block approved publication. The initial demonstration additionally requires source review of every displayed cell and its selected comparative, even if all automated checks pass.

Evaluate extraction against manually transcribed source fixtures, including intentionally plausible wrong outputs: a valid-schema response with an omitted row, a swapped year, a value borrowed from another row, a wrong sign, a million-versus-thousand error, an EPS value given the table-wide scale, a parent statement substituted for the group statement, and a false concept merge. Require each injected error to trigger its intended check or mandatory review route. A stronger model rechecking the same transcription is an optional detector, not a substitute for these gates.

Model and prompt changes run the same frozen evaluation suite. Reject a configuration that introduces any unexplained transcription, completeness, unit, identity, or selection regression in that suite. Passing the suite supports the chosen configuration; it is not a guarantee of correctness on unseen companies. New layouts retain the review requirement.

### Stage D Resolve exceptions

Retry only the affected statement or page group with corrected context or clearer visual evidence. Preserve all attempts and reasons. Repeated model agreement is supporting evidence, not independent source verification.

Route unresolved rows, periods, units, and mappings to review. Corrections become versioned records with a reason, reviewer status, and source reference. Never overwrite the archived PDF or original observation.

### Stage E Evaluate and publish

Build a manually checked evaluation set covering recent and older reports, period headers, negative numbers, continuation pages, and comparative updates. Evaluate cell accuracy, row and period completeness, evidence correctness, and units separately.

Select the least costly compatible model configuration that meets the evaluation requirements. Pin the model identifier or snapshot where supported, prompt version, schema version, and SDK version. Record the actual returned model metadata. Reevaluate before changing the extraction configuration.

For the initial companies, manually reconcile every displayed cell and review the concept mappings and selected reporting versions before marking the published dataset verified. Record exceptions. Avoid percentage confidence labels that imply statistical certainty without calibration.

### Cost and credential strategy

- Keep the API key only in the ingestion environment, never in frontend assets or public API responses.
- Run a bounded pilot before a full backfill and report actual usage, error patterns, and estimated remaining cost.
- Require an explicit full-ingestion invocation after the pilot estimate; do not start an unbounded backfill as part of setup.
- Cache successful attempts by document hash, selected pages, model configuration, prompt, and schema version.
- Retain local outputs and evidence so routine application use makes no OpenAI calls.
- Bound retries and concurrency, track usage per attempt, and support configured run budgets. Token estimates are conservative planning aids, not guaranteed billing amounts.
- Use a maximum of two additional model attempts per failed extraction unit; unresolved cases enter review. Transient network retries also have a bounded policy.
- Set response storage explicitly where supported and clean up uploaded files when no longer needed. Do not describe `store=false` as zero retention; provider retention rules are separate. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

Local operation means the application and processing run on the user's machine. Fresh OpenAI extraction still requires internet access and API access. Cached processing and published-data review must work without additional model calls.

## 5 Deduplication and latest comparative selection

### Preserve reporting before interpreting it

Use separate records for immutable source observations, company-specific concepts, mapping decisions, and published cell selections. Extraction answers what the report states. Mapping answers which rows are equivalent. Selection answers which observation belongs in the clean view.

### Deduplicate with financial context

Match concepts using labels, hierarchy, statement role, units, accounting context, and supporting source material. The model may propose mappings, but deterministic safeguards and review establish their status.

A reviewed rename such as Administrative expenses to Administrative costs can use one current row. Current and non-current assets, gross and net revenue, and different cash-flow classifications must not be merged because their labels resemble one another.

Use the latest approved statement's labels, order, sections, indentation, and subtotals. Preserve historical aliases for search and source inspection. Place discontinued historical concepts in a visibly labeled, expandable Historical items section. It must show an item count, and export options must state whether historical items are included.

Splits, merges, acquisitions, discontinued operations, and changes in accounting basis may prevent direct comparability. Retain separate concepts or warnings; do not invent allocations.

### Extract every annual comparative

Retain all annual columns in every source, including columns outside the default ten-year window. Balance Sheet periods are instants; Income Statement and Cash Flow periods are durations. Fiscal year text alone is insufficient for matching.

For a company, concept, and period, select the latest published compatible observation. Compatibility includes reporting scope, accounting basis, currency, units, and period boundaries. Track document amendments and revision metadata. Unknown publication precedence or tied conflicting observations require review; retrieval time is not a substitute.

For example, a 2024 report can update 2023 and 2022; a later report may update those periods again. The selected value follows the latest applicable source, not the report whose title matches the period.

Prefer compatible statement-period presentations. If a newer statement omits a historical concept, retain an explicitly identified older-source value or a missing value. Flag mixed-source columns and review their coherence.

Preserve original values and source lineage. Use Restated only when the source establishes a restatement. Otherwise describe a changed historical observation as an Updated comparative.

## 6 Human centered financial workstation

### Primary experience

Open into a populated company statement. The primary flow is company selection, statement selection, table review, optional source inspection, and export. A non-technical reviewer must not need a command language or an account to inspect the demonstration.

Use a dark financial workstation with readable labels, tabular numerals, restrained accents, clear section boundaries, and comfortable spacing. The terminal aesthetic provides character; it must not introduce tiny text, cryptic abbreviations, decorative logs, or constant animation.

### Layout and progressive disclosure

| Region | Content | Default behavior |
| --- | --- | --- |
| Navigation | Company selector, Statements, Filings, Data Quality | Compact and clearly labeled |
| Statement toolbar | Statement tabs, fiscal range, units, search, export | Only controls relevant to review |
| Main table | Complete latest statement structure across ten periods | Primary focus of the page |
| Source inspector | Selected value, source, period, units, prior versions | Opens only when requested |
| Secondary detail | Mapping rationale, extraction evidence, processing metadata | Expandable or on secondary screens |

Do not place an ingestion dashboard, large charts, or a large set of summary cards above the statements. Processing diagnostics belong to operator tools and secondary views.

### Statement behavior

- Pin the line-item column and year headers. Keep horizontal scrolling within the table.
- Show units, currency, fiscal dates, scope, and accounting basis where they can be found without opening settings.
- Preserve statement ordering. Do not enable arbitrary numeric sorting that breaks subtotal relationships.
- Search current labels and historical aliases, retaining section context and a clear search-reset action.
- Preserve the full latest statement structure by default; do not replace it with a short highlights table.
- Explain that the clean view uses the latest compatible reported values for each period.
- Mark updated comparatives subtly, with a text explanation available on selection. Do not rely on color alone.
- Distinguish missing history, not reported, unreadable extraction, and genuine zero without cluttering every cell with badges.
- Separate the clean view from an original-report view that preserves the selected report's actual labels and columns.

### Source inspector

Show the essential evidence first: reported amount, period, units, original label, report title, and source page. Provide previous observations and selection rationale next. Put mapping and extraction implementation details in expandable sections.

Publisher PDF page fragments are convenience links, not a guarantee of consistent viewer behavior. Always show the report title and both relevant page references. Retain a fallback link to the full publisher PDF.

### Filing and quality views

Provide filing metadata search, year and classification filters, pagination, and a downloadable source manifest. Full-text search inside all PDFs is extended scope.

The quality view shows verified coverage, remaining gaps, failed checks, and reviewed exceptions. Define Verified as a completed source and selection review, not merely successful JSON parsing or balanced accounting totals.

### Accessibility and responsive behavior

Every essential action works by clicking and keyboard. Use semantic tables, visible focus, accessible controls, sufficient contrast, and reduced-motion support. A command palette offers shortcuts but is never the only route to a task.

On narrow screens retain horizontal statement scrolling and open source details in a drawer. Load the inspector on demand and avoid rerendering the entire table for every pointer interaction. Do not add virtualization until measured table size warrants its accessibility and implementation cost.

### Usability acceptance

A first-time reviewer should independently find a row, identify its period and units, verify a value, understand an updated comparative, and export the statement. If these tasks are confusing, simplify navigation and labeling before adding features. Record whether the usability review involved an independent person or an internal walkthrough.

## 7 Data model and versioned interfaces

### Logical records

| Record | Responsibility |
| --- | --- |
| Company | Identity, listings, fiscal conventions, discovery configuration |
| Filing | Source identity, hash, URLs, classification, publication metadata |
| Ingestion run | Stage state, versions, errors, timing, and usage |
| Extraction attempt | Input pages, prompt and schema versions, raw response, validation results |
| Statement instance | One source statement with scope, basis, units, and page references |
| Source row and observation | Original hierarchy and reported cells for actual periods |
| Canonical item and mapping | Company concept and reviewed source-row associations |
| Review decision | Correction, rationale, evidence, and status |
| Published dataset | Immutable selected observations, row structure, and active version |

Persist exact decimals, explicit missing states, and immutable source lineage. Use separate runtime read and ingestion write credentials. Migrations are versioned and run explicitly rather than implicitly on application requests.

### Database correctness and consistent reads

Store parsed amounts as exact Postgres NUMERIC and Python Decimal, with original text retained. Do not silently round observations to a convenient fixed scale. If a chosen schema precision cannot represent an input, reject it for review rather than truncate it. Preserve units separately, reject non-finite financial values, use DATE for fiscal boundaries and timezone-aware timestamps for audit events, and keep decimal values as strings through pg, JSON, and exports. Never parse money into JavaScript Number for storage, selection, or financial checks.

Enforce source relationships with foreign keys and critical state rules with named check and uniqueness constraints. A reported value state must have a finite amount; missing states must not conceal a numeric amount. Uniqueness for idempotent ingestion must include the immutable extraction artifact and source row/period identity, so an alternate transcription or report revision is preserved rather than accidentally overwritten. Do not make company/concept/year globally unique across source observations.

Keep transactions short. Publisher requests, model calls, OCR, and expensive processing happen outside transactions; stage checked results first, then persist bounded units with SQLAlchemy transaction contexts. Do not hold a database lock while waiting for OpenAI. Use conflict handling only for established identity collisions and compare payload hashes; different content under the same identity is an error, not a last-write-wins update.

Store the active dataset reference in a lockable per-company record. Publication checks the candidate's recorded validation status and expected prior dataset version, then changes that reference in a short transaction. A concurrent publication based on an obsolete version fails with a retriable conflict instead of silently replacing a newer release. Published content and source observations are append-only under ordinary ingestion permissions; stage status records can remain mutable.

Every statement request resolves one dataset version and uses that version for all of its queries. Return the version to the client. History and export requests accept that version so an intervening publication cannot change the evidence behind the displayed table. Candidate data is not visible through public reads.

Grant the application role read access only to published review data, with separate roles for ingestion and migrations. Index actual company, dataset, period, filing, and provenance lookup paths and check query plans using representative data. Use Postgres in integration tests rather than assuming SQLite reproduces numeric, constraint, and concurrency behavior.

### Public API v1

| Endpoint | Purpose |
| --- | --- |
| GET /api/v1/companies | Company listing and metadata search |
| GET /api/v1/companies/{id}/statements | Statement type and fiscal-year range selection |
| GET /api/v1/companies/{id}/filings | Paginated filing metadata search and filters |
| GET /api/v1/observations/{id}/history | Evidence, source versions, and selection context |
| GET /api/v1/companies/{id}/quality | Coverage, review status, and validation results |
| GET /api/v1/companies/{id}/export | CSV representation of the selected view |
| GET /api/v1/health | Application and database readiness without secrets |

Document the contract in OpenAPI. Validate query input, bound result sizes, use parameterized SQL, and return decimal strings. Errors contain a stable code, readable message, and request ID; unexpected failures do not expose credentials or raw database details.

Use bounded cursor pagination for filing lists. Preserve financial row order in statement responses. Return dataset version, source observation IDs, units, period metadata, hierarchy, and explicit value states.

API version describes the contract; dataset version describes the financial publication. Breaking contract changes require a new major API version. New financial publications do not.

CSV exports must match the selected dataset and view, identify their units and periods, and include source references. Clearly indicate whether search filters and historical items are included. Escape spreadsheet-active text safely without changing numeric values in the application.

Keep the first release public and read-only. Company addition, extraction, review overrides, and publication operate through local tools. Web-based writes and authentication are extended scope.

## 8 Local execution and free deployment

### GitHub Actions CI and CD

Run component checks for web and pipeline changes and shared integration checks for contracts, migrations, fixtures, and infrastructure changes. Every pull request and main-branch push starts a workflow with one always-reporting aggregate required status. Job-level change detection may skip unrelated work, but a path filter must not skip the entire required workflow and leave its status pending.

Web checks include ESLint, Prettier check mode, TypeScript, tests, and the production build. Python checks include Ruff lint and format checks, mypy, pytest, and Hypothesis. Integration checks apply Alembic migrations to isolated Postgres, verify generated Kysely types and exported contracts, replay frozen financial inputs, and test guarded publication. Routine CI uses stored AI fixtures and has no OpenAI key.

GitHub Actions is the deployment authority. Deploy the tested commit to Vercel through the official CLI after successful CI; do not enable a second production deployment path that bypasses those checks. Trusted-branch production deployment uses scoped secrets. Fork pull requests receive no deployment or production credentials. Production migration is an explicit, serialized workflow against an identified environment, using reviewed backward-compatible revisions before dependent application deployment. Destructive schema changes require a staged compatibility plan rather than automatic rollback.

Separate ingestion, financial publication, schema migration, and application deployment. Live extraction and model evaluation are explicit operations with their own cost and validation gates. Use minimal workflow token permissions, pinned action revisions, dependency caching keyed by lockfiles, bounded timeouts, and cancellation of obsolete CI runs; never cancel a production migration mid-run merely because a new commit arrived.

Provide Docker Compose services for db, web, migrate, and a pipeline tools profile. Use persistent database volumes and a configurable local source archive. Also document native Node and Python development against local Postgres.

Local setup must not require cloud credentials. Restore an approved dataset snapshot for immediate review, or run fresh ingestion with the user's OpenAI key. The same migrations and application queries run against local Postgres and Neon.

See [local development](local-development.md) for the proposed command contract. Commands in that document must be implemented and exercised before being described as working setup instructions.

Deploy Next.js on Vercel and use Neon Free for hosted data. Confirm current plan limits and eligibility before publication. Vercel Hobby has personal, non-commercial usage restrictions; do not assume that any business-facing use is eligible. See [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Function limits](https://vercel.com/docs/functions/limitations), and [Neon plans](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md).

Select a database region near the web application where available, use bounded connection pooling, and test the first request after database inactivity. Preserve source links and useful error states when publishers are unavailable. A last approved dataset must remain active through failed ingestion; an actual database outage should produce an honest retry state, not an invented success.

Cloudflare is a fallback if hosting eligibility or requirements demand it, not a reason to abandon Next.js preemptively. A hosting change requires a documented implementation check rather than an assumption of identical runtime support.

## 9 Verification and release gates

### Financial regression cases

Test referring-page and PDF period mismatches; annual versus interim columns; parent versus consolidated scope; row and continuation omissions; parentheses and sign handling; decimals and units; dashes and zero; updated comparatives; ambiguous publication precedence; false label merges; historical splits and discontinued items; and incompatible accounting bases.

Include a real source-supported comparative update in the evaluation fixtures. The source register identifies an initial Wise example, but its earlier and later observations must be checked before building a numerical before-and-after demonstration.

### Pipeline regression cases

Test duplicate downloads, changed content at an existing URL, idempotent repeated processing, cache invalidation, bounded retries, model refusal, truncated output, failed schemas, unsupported scans, preserved corrections, and failed publication leaving the active dataset unchanged.

Use Hypothesis with pytest to exercise decimal round trips, sign and separator rules, explicit missing states, deterministic mapping application, and comparative-selection invariance under shuffled input order. Generated cases complement manually checked source fixtures. Persist regression examples and use a fixed CI profile for repeatable failures. See [Hypothesis](https://hypothesis.readthedocs.io/en/latest/).

Replay frozen inputs in a clean database and after changing insertion order, task completion order, locale settings, and current wall-clock time. Assert the same logical dataset hash and selected source IDs; conflicting precedence must consistently yield an unresolved issue. Verify exact decimals survive Python-to-Postgres-to-Next.js-to-CSV boundaries.

Test constraint rejection, duplicate ingestion, migration application from an empty database and the previous supported schema, rollback, concurrent publications, and requests spanning a publication. CI applies Alembic migrations to isolated Postgres, regenerates Kysely types, and fails if committed types are stale. Review schema diffs and generated migrations; never auto-apply production changes from generation output.

Tests should use stored fixtures and mocked model responses by default. Live evaluation is an explicit command, not a side effect of every test or development startup.

### Application checks

Test API validation, decimal serialization, pagination, dataset version consistency, row search and aliases, source inspection, export consistency, keyboard interaction, reduced motion, narrow viewports, empty states, and source or database failures.

### Local and hosted acceptance

From a clean environment, start local services, apply migrations, restore a demonstration snapshot, review statements, process cached source documents, run validation, and build and run the production application. No cloud account is required for cached local review.

Open the hosted application from a signed-out browser and verify the main tasks without access to a repository, developer account, or ingestion key.

### Release criteria

- Two selected companies with three verified ten-year statements each.
- No unresolved displayed transcription or selection errors presented as verified.
- Latest reporting structure and compatible comparative selection demonstrated.
- Original observations and source references accessible.
- Searchable classified filing inventory and source manifest.
- Live reviewer link and tested local execution instructions.
- Documented coverage, review methodology, limitations, and processing cost evidence.

## 10 Delivery sequence and scope control

### One week target

| Day | Work and evidence |
| --- | --- |
| 1 | Coverage research, source register, local scaffold, bounded extraction pilot, and cost estimate |
| 2 | Discovery, downloads, classification, archive manifest, and extraction contract |
| 3 | Statement extraction, historical processing, and extraction fixtures |
| 4 | Concept mapping, comparative selection, review overrides, validation, and publication |
| 5 | Versioned APIs, statement workspace, and source inspector |
| 6 | Search, quality view, exports, local documentation, and deployment |
| 7 | Source reconciliation, regression and usability review, walkthrough, and limitations |

This is a target, not a promise that an unknown historical archive will yield ten years within seven days. Protect source coverage, extraction, provenance, reconciliation, and deployment first. Defer decorative effects, charts, scheduling, and web onboarding before compromising data quality.

### Two weeks and beyond

In week two add persistent web onboarding requests, optional automated job execution, authenticated exception review, incremental updates, hosted report archives and page highlighting, a third company with different layouts, and processing metrics.

Beyond two weeks evaluate multilingual extraction, full-text PDF search, scheduled refreshes, more reporting bases, and external API access. Keep the observation contract, source lineage, mapping decisions, and dataset publication interface stable as processing moves to hosted workers.

### Reviewer handoff

Provide the live link, a short task-oriented walkthrough, architecture, source register, quality results, local instructions, known gaps, and concrete next priorities. Demonstrate a source lookup, a reviewed deduplication, and a source-supported comparative update. Do not fabricate a restatement example merely to showcase a feature.

## 11 Architecture decision records

| Decision | Rationale | Tradeoff and revisit condition |
| --- | --- | --- |
| ADR 001 Hybrid model extraction and deterministic validation | Models help interpret varied layouts; code and review establish publication evidence | More stages than a one-call parser; simplify only when evaluation supports equal correctness |
| ADR 002 Complete statement page groups | Retains layout, headers, units, and continuations while reducing irrelevant model input | Page location is another failure mode; review coverage and widen context when necessary |
| ADR 003 Immutable source observations | Makes corrections, restatements, and selected values auditable | Additional storage and lineage joins; retain compact evidence rather than dropping history |
| ADR 004 Extraction separated from concept mapping | Prevents deduplication from erasing what the company actually reported | Requires mapping records and review; extend with stronger evaluated automation as company count grows |
| ADR 005 Explicit comparative precedence | Keeps latest-value selection reproducible and explainable | Some basis changes and omissions need human decisions; never resolve by fuzzy label alone |
| ADR 006 Background CLI ingestion | Avoids web request limits and keeps heavy processing runnable locally | Initial updates are operator-driven; add durable jobs when unattended ingestion becomes a requirement |
| ADR 007 Postgres in both environments | Preserves schema and query behavior across local and hosted use | Requires a local database service; Compose provides the default setup |
| ADR 008 Review-first workstation | Prioritizes the human tasks on which the assessment depends | Less landing-page spectacle; add visuals only when usability evidence supports them |
| ADR 009 Separate API and dataset versions | Allows financial updates without pretending the API contract changed | Requires version metadata and cache discipline; enforce it in contract tests |
| ADR 010 Versioned caches and evaluation | Limits API waste while exposing model and prompt regressions | Cached generations do not guarantee fresh-run determinism; preserve original outputs and reevaluate changes |
| ADR 011 SQLAlchemy and one Alembic migration history | Uses established persistence and transaction tools while retaining one schema authority | TypeScript reads require generated types checked against migrated Postgres |
| ADR 012 Kysely for Next.js reads | Typed query construction without a competing schema owner | Compile-time types do not validate runtime JSON; retain boundary checks and database privileges |
| ADR 013 Frozen inputs and logical dataset hashes | Makes approved financial transformations replayable and testable | A new source or model response produces a new candidate, not an equivalent replay |
| ADR 014 Database invariants and guarded publication | Prevents invalid relationships, duplicate identity, and stale concurrent publication | Constraints and conflicts need explicit handling; external calls stay outside transactions |
| ADR 015 Separate AI validation and approval service | Valid output shape, plausible totals, and model confidence are individually insufficient for usable financial data | Requires source fixtures, evidence review, and explicit exceptions; evaluate detector coverage with injected errors |
| ADR 016 One subfolder monorepo | Shared contracts, migrations, and application consumers can change in one reviewed commit | Components retain separate jobs and deployment lifecycles; initialize Git only inside fiscal-platform |
| ADR 017 Hooks plus mandatory CI | Fast staged feedback and full independent verification protect both developer flow and merge quality | Hooks need explicit installation and can be bypassed; CI remains authoritative |
| ADR 018 Actions-controlled deployment | The tested commit is the deployed commit and production operations have clear credentials and ordering | Hosting secrets are prerequisites; keep data publication and schema migration separately controlled |

Each substantial later change should update its decision record with context, alternatives, decision, consequences, evidence, and conditions for revisiting it. Record measured results separately from architectural expectations.

## 12 Git and documentation discipline

Use meaningful, independently reviewable atomic commits. Keep tests and documentation with their related behavior. Use short Conventional Commit messages such as `docs: document source coverage`, `feat: extract statement observations`, `feat: reconcile comparative values`, and `test: cover publication failures`.

Inspect staged changes and run proportional checks before each commit. Exclude keys, original report archives, local databases, caches, editor swap files, and unneeded generated artifacts. Preserve the user's existing edits and never stage unrelated files.

Initialize the new repository at `fiscal-platform/`; do not initialize Git at the planning workspace root or create nested component repositories. Commit the documentation baseline, quality tooling and CI foundations, then independently reviewable implementation slices.

Use one hook manager, pre-commit, for both languages. Pin hook revisions and tool versions. Staged checks cover Ruff lint/format, ESLint, Prettier, configuration syntax, conflict markers, private keys, and oversized accidental files. A commit-msg hook validates short Conventional Commit messages. Ruff owns Python formatting and Prettier owns frontend and documentation formatting. Avoid overlapping style rules. Invoke ESLint directly rather than relying on next lint.

Hook setup is an explicit documented command because Git clones do not install hooks automatically. Keep heavy type checks, database integration tests, replay, and builds in CI rather than every commit. Formatting hooks that modify files stop the commit so changes can be reviewed and staged again. Run full check-mode linting and formatting in CI even when local hooks were bypassed. Use Windows-compatible command entry points and avoid shell-specific filename expansion.

## Implementation status — October 23, 2026

The first implementation milestone now exists in this repository. The original problem statement and engineering proposal remain unchanged. This plan describes the full intended product; the implemented interface and operational commands are documented in [README](../README.md).

Implemented foundations include a Next.js read-only statement workspace and versioned API, strict public dataset and extraction contracts, SQLAlchemy models with reviewed Alembic migrations, exact decimal parsing, independently grounded cell validation, completeness inventory comparison, reviewed mapping gates, deterministic compatible comparative selection, and guarded immutable publication. Wise and Adyen configuration is seeded without financial values; an operator can register another issuer and its approved source hosts.

The operator CLI supports bounded official-index discovery, content-addressed PDF downloads, local page text inspection, offline replay, explicit validation and publication. Its optional official OpenAI SDK adapter permits one bounded pilot call only with explicit configuration and authorization. It strips model-controlled review flags and preserves the raw response; no model call or API credit expenditure occurred during implementation. Full ingestion orchestration and source-reviewed backfill remain unimplemented.

Native Python 3.12 and isolated PostgreSQL 16 checks have exercised clean migration application, schema drift detection, exact NUMERIC round trips, independent validation error fixtures, sparse-history selection, immutable published snapshots, and concurrent publication generation conflicts. The fixture suite uses explicitly synthetic data. Compose and Actions configurations are authored; successful native checks do not establish a successful container startup, remote Actions run, hosted deployment, or reviewed production data.

No company has three verified ten-year statements yet. The historical coverage, issuer continuity and actual statement transcription work in the source register remains open. `restore-demo` fails explicitly because no approved real-company snapshot exists. These gaps prevent a claim that the assignment's financial release criteria have been met.
