# Financial Statement Extraction Engineering and Deployment Proposal

## Recommended approach

Build a reusable financial reporting platform with a Next.js application on Vercel, a free Neon Postgres database, and a Python ingestion pipeline that initially runs locally. The deployed application serves dynamic queries and review tools; expensive PDF processing happens separately from web requests.

Demonstrate the platform with Wise and Adyen, as selected by the user, and add a third only after proving extraction quality. Confirm ten years of accessible consolidated financial statements for each company before claiming complete coverage. Company configuration must be stored as data so these examples do not become the boundaries of the product.

The main engineering challenge is maintaining financial meaning and traceability across reports. A working table is insufficient if it combines different accounting scopes, loses source labels, or silently substitutes incorrect values.

This is a proposed design, not an implemented or deployed application.

## Selected demonstration companies

| Company | European listing | Starting source | Coverage consideration |
| --- | --- | --- | --- |
| Wise | London Stock Exchange, WISE | [Annual reports](https://owners.wise.com/financials/annual-reports) | The annual report index currently lists FY2021 through FY2026. Earlier comparative columns and historical filings need investigation to establish ten years. |
| Adyen | Euronext Amsterdam, ADYEN | [Investor relations](https://www.adyen.com/investor-relations) | Its listing began in 2018; investigate pre-listing reports and comparative columns rather than assuming ten listed reporting years. |

Both meet the requirement of having a European stock exchange listing. Wise also began trading on Nasdaq in May 2026 and retained a secondary London listing. If the requirement is instead a European primary listing, Wise needs reconsideration. [Wise listing announcement](https://newsroom.wise.com/en-NAM/265506-wise-debuts-us-listing-on-nasdaq/), [Adyen listing announcement](https://www.euronext.com/sites/default/files/pr_euronext_welcomes_adyen_20180613.pdf).

This pair tests relevant differences: Wise's fiscal year ends on March 31, and the platform must distinguish financial year labels from calendar years. Wise's 2026 listing materials also introduce US GAAP reporting, so preserve accounting basis, reporting currency, and issuer continuity explicitly rather than assuming each new report is directly comparable. [Wise reporting calendar FAQ](https://owners.wise.com/owner-resources/faqs-and-important-documents), [Wise listing announcement](https://newsroom.wise.com/en-NAM/265506-wise-debuts-us-listing-on-nasdaq/).

The Wise report index alone does not demonstrate ten year coverage. Discovery must establish which earlier full statements are available through the permitted investor relations sources. If registry filings or listing prospectuses are needed, treat them as an explicit source extension with separate provenance. Never substitute subsidiary accounts for consolidated group accounts. Keep the selected companies, report any remaining coverage gap, and resolve that gap before claiming that the original ten year deliverable is complete.

## Architecture

```text
User adds company name and investor relations URL
                         |
                Company configuration
                         |
     Python discovery and extraction pipeline
     initially local, optionally GitHub Actions
                         |
       Original PDFs and extraction evidence
          retained in a local source archive
                         |
        Validated observations and mappings
                         |
                   Neon Postgres
                         |
             Next.js server on Vercel
                         |
       Company onboarding, statement tables,
       filing search, source and version review
```

The web application can accept a new company and persist a pending ingestion request. In the initial free implementation, an operator runs the pipeline to process pending requests. The interface must show this distinction. Adding a company does not imply immediate automatic extraction.

## Free deployment and technology choices

| Component | Proposed choice | Responsibility |
| --- | --- | --- |
| Web application | Next.js with TypeScript | Pages, server queries, interactive tables, onboarding |
| Hosting | Vercel Hobby where eligible | Live application and short server operations |
| Database | Neon Free Postgres | Companies, filing metadata, observations, mappings, published datasets |
| Processing | Local Python command line | Discovery, PDF extraction, OCR, validation, publication |
| Automation later | GitHub Actions within free allowances | Explicit or scheduled ingestion runs |
| Source archive | Local filesystem initially | Original PDFs, hashes, page evidence, reproducible extraction |
| Public source access | Original publisher PDF links | Reviewer access to the report and page references |

Vercel Hobby supports a dynamic application, but restricts usage to personal, non-commercial projects. Determine whether this take-home demonstration qualifies before deployment. Cloudflare is an alternative if the intended usage does not fit Hobby; switching hosting is not required merely because Next.js needs dynamic data. [Vercel Hobby documentation](https://vercel.com/docs/plans/hobby).

Neon offers a free plan with resource allowances and suspends idle compute. Expect possible latency on the first database request after inactivity. Select the Free plan explicitly, keep PDFs out of the database, and monitor compute and storage consumption. [Neon plan documentation](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md), [Neon scale to zero documentation](https://github.com/neondatabase/website/blob/main/content/docs/introduction/scale-to-zero.md).

Vercel Functions have execution and resource limits. Keep their responsibilities to queries, small mutations, and exports. Do not run a ten year PDF backfill inside a request, deployment build, or an untracked process started after responding. [Vercel Function limits](https://vercel.com/docs/functions/limitations).

If automated ingestion becomes necessary, standard GitHub Actions runners can be used subject to repository visibility and plan allowances. Public repository standard runner usage is free; private repositories have included quotas. Keep a local execution path so automation is optional. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

No paid language model API, always-on worker, paid database, custom domain, or paid PDF extraction service is required for the initial version. Free hosting does not guarantee unlimited processing or completely unattended extraction.

## Extensibility and company onboarding

The target is any company the user selects, subject to source availability and report support. Avoid promising universal extraction without review: companies differ in website structure, language, accounting basis, document quality, and historical coverage.

Store a company record containing a stable internal ID, legal name, optional ticker and exchange, investor relations URL, approved source domains, preferred report language, and optional adapter configuration. Ticker alone is not a unique identifier.

Onboarding should proceed through explicit states: pending discovery, discovering, needs source review, extracting, needs extraction review, ready, or failed. Show available years and missing statements before claiming completion. Companies with fewer than ten reported years should expose the gap rather than receive invented history.

Use shared interfaces with narrowly scoped implementations:

| Extension point | Shared behavior | Optional specialized behavior |
| --- | --- | --- |
| Discovery adapter | Follow links, inspect sitemaps, identify PDF candidates | JavaScript archives, pagination, site-specific APIs |
| Document classifier | Inspect titles, opening pages, dates, content | Language vocabulary and issuer-specific names |
| Statement locator | Score headings, table of contents, financial structure | Unusual titles or layouts |
| Table extractor | Read text positions and reconstruct columns | Borderless, rotated, scanned, or multi-page tables |
| Line item mapper | Match labels using context and hierarchy | Reviewed issuer-specific aliases |
| Validator | Check periods, units, totals, and provenance | Accounting basis and statement-specific rules |

A registry chooses an adapter by explicit company configuration or supported source domain. The generic adapter remains the first attempt. Website-specific selectors belong inside adapters, not in the API or interface. Unsupported layouts should produce reviewable failures.

Version adapters, parser configurations, mappings, and published datasets. Reprocessing a company should produce a new candidate dataset while preserving the currently published result until validation succeeds.

## Discovering and classifying filings

Start with the supplied investor relations URL. Traverse relevant archive and financial reporting links, within approved domains and bounded depth. Allow publisher CDN domains through reviewed configuration. Use HTTP fetching first; add browser rendering only when a site requires it.

Record every discovered candidate with its discovery page, original URL, resolved URL, title, retrieval time, content type, download result, content hash, inferred reporting period, classification, and confidence. Detect PDFs through both response metadata and file signatures rather than relying on the URL suffix.

Classify annual reports, interim reports, presentations, results releases, sustainability reports, and other documents. Use link context plus document contents, and retain uncertain classifications for review. A financial presentation mentioning an annual result is not necessarily an annual report.

Deduplicate identical content using a cryptographic hash while retaining alternate URLs. If content changes at the same URL, retain a new document version. Honor site access rules, limit concurrency, retry transient failures, and record inaccessible archives. Do not claim to have discovered all historical filings when access or coverage is incomplete.

For user-supplied URLs, restrict fetching to public HTTP or HTTPS destinations, block private and local network addresses, and revalidate redirects. Apply download size and page count limits to unfamiliar documents.

## Extracting the statements accurately

Begin with consolidated annual financial statements. Distinguish them from parent-company accounts, adjusted metrics, management summaries, and note tables. Support another scope explicitly when needed, preserving it as a separate dataset.

Locate candidate pages through headings, table of contents entries, and financial context. Extract complete statements, including continuation pages. For text PDFs, use coordinate-aware extraction such as pdfplumber; its documentation describes text and table extraction and notes that it works best with machine-generated PDFs. [pdfplumber documentation](https://github.com/jsvine/pdfplumber).

When text extraction fails, use local OCR and a layout-specific parser or review. OCR and model outputs are proposals to validate. A future model-assisted extractor should implement the same observation contract and must preserve evidence; it should not become a mandatory paid dependency.

For every cell, retain the raw label, hierarchy, row order, raw numeric text, decimal value, currency, scale, unit type, fiscal period dates, consolidated or parent scope, statement type, note reference, source report, page, and bounding box where available. Record extraction method and version.

Use exact decimal representations, not floating point, for reported amounts. Preserve parentheses, negative signs, dashes, blanks, zeros, percentages, per-share data, and footnote markers. A dash is not automatically zero. Model missing, not reported, not applicable, and reported zero separately when the report supports that distinction.

Extract every annual comparative column. An Income Statement or Cash Flow Statement covers a duration; a Balance Sheet describes an instant. Fiscal year labels alone cannot establish that two observations refer to the same period. Keep opening balances and nonannual periods separate.

Store source units alongside values and convert only in a clearly identified presentation layer. Statements may mix millions of currency with per-share amounts; a table-wide scale must not be applied indiscriminately.

## Data model

The following entities describe logical records, not final database migrations:

| Entity | Purpose |
| --- | --- |
| Company | User-selected issuer and discovery configuration |
| Filing | Versioned source PDF, publication metadata, classification, hash |
| Ingestion run | Status, errors, adapter and parser versions, timestamps |
| Statement instance | One extracted statement with scope, currency, pages, reporting basis |
| Source row | Original label, position, hierarchy, note reference |
| Observation | One reported value for one source row and fiscal period |
| Canonical item | Company-specific financial concept used in a clean view |
| Mapping decision | Source row association, confidence, rationale, review and version |
| Published dataset | Immutable approved selection of observations and presentation order |

Raw observations are immutable. Corrections create replacement observations or decisions with explicit lineage. A published dataset identifies exactly which source observation supplies each visible cell.

Use separate read and ingestion database credentials. The web application's public read operations should not hold broad write privileges. Any onboarding write operation must be validated and rate limited; administrative review and publication require authentication.

## Combining years and handling restatements

Keep two independent decisions: whether source rows represent the same concept, and which reported observation is the latest applicable version for a concept and period.

For reconciliation, compare company, statement, accounting scope, period dates, duration or instant, concept, currency, unit, and reporting basis. Rank compatible observations by actual publication date and document revision, with a deterministic tie-breaker. Report year and download time are not reliable substitutes for publication order.

Illustrative example only: a 2023 report states revenue for 2023 as 100; a subsequently published 2024 report presents the same 2023 period as 98. If scope, units, and basis match and the comparative is validated, the latest view shows 98 and links to that report. The earlier value remains available in source history. A changed comparative should be described as updated unless the source establishes that it is restated.

Select versions at a compatible statement and period level where possible. Do not assemble an apparently coherent column by freely mixing rows from incompatible presentations. If a newer statement omits a historical item, either preserve an explicitly identified older-source value or show a missing value; never infer a new value. Flag mixed-source columns and reconcile them before publication.

Use the most recent statement layout as the default ordering. Match historical rows with labels, hierarchy, statement role, units, and accounting meaning. Similar text is evidence, not proof. Never combine current and non-current assets, gross and net revenue, or different cash flow classifications solely because their labels resemble one another.

Older concepts that no longer appear should remain in a historical items section. Splits, merges, accounting changes, and discontinued operations need explicit mappings or comparability warnings. Do not invent allocations to force a uniform ten year table.

## Review interface

The company directory supports adding a company by investor relations URL and shows discovery status, available years, and coverage. Initial company records can be seeded, while subsequent records are user supplied.

The company workspace has three statement tabs with ten fiscal years, readable row hierarchy, sticky labels and headers, currency and unit indicators, and optional row search. The latest reconciled view is the default. A source view preserves original labels and reported columns.

Selecting a cell reveals the reported value and label, source filing and page, reporting period, units, extraction status, and older observations. Link directly to the publisher PDF with a page fragment where supported. Retaining local originals supports reproducibility, but does not provide a hosted mirror; publisher links may change. Hosted archival downloads can be a later storage extension.

The filings view filters documents by type and year, exposes classification uncertainty, and links to the originals. It should also provide a downloadable metadata manifest. Statement exports should include source references and dataset version.

Clearly distinguish no reported value, unavailable history, pending extraction, and failed extraction. The interface should remain usable when one company or statement is incomplete.

## Validation and publication

Check each statement for aligned year columns, units, sign interpretation, duplicate observations, and missing provenance. Check Assets against Liabilities plus Equity, cash flow opening and closing cash where the statement permits, and reported subtotals using explicit statement relationships. Apply rounding tolerances based on disclosed units. A passed accounting equation is supporting evidence, not proof that every cell is correct.

Before the demonstration, manually reconcile every displayed cell in the selected companies' ten year tables against its source. Record exceptions and resolve them before presenting a statement as verified. Preserve review decisions so a rerun does not silently undo a correction.

Add regression fixtures for representative layouts, comparative years, units, and mapping decisions. Verify that a failed rerun leaves the published dataset intact and that a newer compatible comparative supersedes an older observation without deleting it.

The release gate is three traceable ten year statements per demonstration company, a classified filing inventory, and a live link accessible without a developer account. Missing history must be visible and should trigger selecting another demonstration company if it prevents satisfying the assignment.

## Deployment sequence

1. Create the Next.js application, Python ingestion package, and shared extraction contract. Keep source archives and secrets outside committed application assets.
2. Provision a Neon Free database and apply reviewed schema migrations. Put runtime credentials in Vercel environment variables and ingestion credentials in the local environment.
3. Discover and parse one company's latest and an older report. Resolve layout, unit, and comparative issues before backfilling ten years.
4. Complete and review two companies, then exercise onboarding for an additional company to test generality. Introduce a specialized adapter only where the generic path demonstrably fails.
5. Publish a validated dataset transactionally. Activate its dataset version only when all publication checks succeed.
6. Deploy the Next.js app to Vercel with a provider subdomain. Confirm the free plan and intended usage fit. Keep extraction out of deployment builds.
7. Test statement queries, filing filters, cell provenance, exports, onboarding states, narrow screens, and a database wake-up after inactivity. Open the production URL from a signed-out browser to verify reviewer access.

On subsequent updates, rerun discovery incrementally, download only new or changed PDFs, extract affected documents, regenerate candidate views, and publish only after validation. Keep the last approved dataset available through failures.

## Growth path

Start with manual ingestion orchestration and a shared generic pipeline. Next add an authenticated review queue and optional Actions execution. Later introduce a durable job system, hosted document archive, richer OCR or model extraction, and additional accounting bases as usage justifies them.

Preserve the ingestion contract, observation history, mapping decisions, and published dataset interface as infrastructure changes. These boundaries let the system move from local processing to hosted workers without changing how the Next.js application requests statements.

The platform should support onboarding any selected company; verified ten year coverage remains an outcome established by discovery, extraction, and review for that company.
