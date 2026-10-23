# Web implementation handoff

The Next.js review workspace reads published Postgres datasets. It does not call a model, trigger ingestion, or embed company financial fixtures. Wise and Adyen are collection metadata; no reviewed financial snapshot is bundled. The source-backed ten-year release requirement remains unmet until ingestion and review establish it.

## Boundaries

- `src/lib/repository.ts` reads published datasets only. The active pointer selects the default version; an explicit version can read an older publication. Approved private candidates remain unavailable.
- `src/lib/contracts.ts` validates JSON financial payloads, exact decimal strings, row-specific units, identities, dates, and coverage relationships. Alembic owns database schema changes; generated Kysely types are in `src/lib/db.generated.ts`.
- `src/app/api/v1/[...path]/route.ts` implements read-only API routes documented in `openapi.json`. Errors include stable code, message, and request ID. Export and evidence requests require a pinned dataset version.
- `src/components` separates workspace navigation, statement rendering, source inspection, collection views, and abortable version-aware reads. Fiscal range defaults to the latest ten available fiscal years and exports carry its range. Row search preserves statement order and section context.
- Source manifest downloads represent the current filtered filing page. Their payload includes the next cursor and filter metadata so page scope is explicit.

## Evidence and limitations

The original-report layout is not supplied by the initial public dataset contract. The interface discloses that an original-report view is unavailable. Source history shows distinct compatible observations selected in up to 100 published datasets, rather than every raw private extraction. Dataset hash ordering does not establish publication precedence.

All financial amounts used by frontend tests are explicitly synthetic fixtures. Tests cover decimal precision, value states, aliases and context, CSV safety and identity, query validation, error redaction, source dialog markup, mixed-unit rendering, and failure messages. Server-rendering tests do not prove browser focus behavior. Independent browser review is separate; no external usability participant has been claimed.

Verified locally: TypeScript and ESLint pass; 22 Vitest tests pass following the UI message cleanup. The production webpack build passed, including the standalone Docker entry point. Database type generation and drift checking passed against migrated native Postgres 16. Browser inspection confirmed the honest unpublished Wise state, filings and quality navigation, and switching to Adyen. A separate source reviewer found two misleading failure messages; both were corrected and regression-tested. Populated statement interactions and native dialog focus behavior remain unverified in a browser. Docker build/run remains unverified because the Docker daemon could not be used.

The review UI keeps setup instructions, request IDs, raw validation payloads and internal hashes out of visible content. APIs and exports retain their identifiers for traceability, while the source inspector continues to show report links, original labels and value text, PDF and printed pages, and prior reported amounts. The local application database was checked with Alembic `upgrade head`, `current` and `check`: revision `0002` was already current and no schema drift was detected. No financial data was inserted by running migrations.

On this restricted Windows host, use the repository-local Node 22.23.4 runtime and set `NODE_OPTIONS=--preserve-symlinks --preserve-symlinks-main`. Vitest uses a native-loaded `.mjs` config to avoid restricted ancestor-directory resolution. Normal environments can run the root npm scripts. `db:types` and `db:types:check` require an explicitly configured migrated development database; normal development startup and production builds do not require a live database at compile time.

The Dockerfile builds from the monorepo root and serves the standalone application as a non-root user. Keep source archives, credentials, local caches, and environment files excluded from its build context. Actual container startup still requires verification.
