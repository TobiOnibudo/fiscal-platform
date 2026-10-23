# Financial review workspace checklist

Scope: one new statement review workspace, with secondary filings/quality views and a source drawer. There was no existing frontend reference, component family or theme. The explicit user brief settles the direction. Controls and theme are shared through apps/web/src/app/globals.css. This is a review artifact, not product content.

- Navigation: semantic aside/nav/main, company select with label, statement/filings/quality controls usable by keyboard, skip link to main.
- Hierarchy: company title, statement tabs, statement title and visible scope/basis/currency/units, then search/export controls and financial table. No large charts or summary cards above statements.
- Table: semantic table/column and row headers; fixed line-item column and year headers, contained horizontal scrolling; source order preserved. Search current labels and aliases, retaining section ancestors. No numeric sort.
- Fiscal range: progressive controls use published period end years, default to latest ten available years; export carries the same from/to range. No invented period columns.
- Filings manifest: download current filtered page with source hashes and cursor metadata; the label identifies its page scope.
- Row units: mixed currency/unit rows show their own units beside the label and in source inspection/export; values never converted to Number.
- States: loading, unpublished selection, database failure, search no matches, no filings, no quality result. No invented Wise/Adyen financial amounts; synthetic data only in test files.
- Coverage: a complete ten-year claim requires evidence. Unpublished state clearly describes unmet coverage; quality defines verified and records gaps.
- Source: amounts are buttons with row/period/unit labels; native dialog traps focus and closes with Escape and visible close button; essential amount, raw label/text, period, units, document title and PDF/printed pages first; metadata expanded later. Safe publisher links, fallback full document link.
- Versioning: displayed dataset version travels to history/export; CSV identifies dataset, units, periods, sources, query and historical inclusion. Spreadsheet-active text escaped; exact decimal string preserved.
- Accessibility: semantic labels, visible focus, keyboard tabs with arrow/Home/End, touch controls, contrast using muted #a4afad on #101315/#171b1e, reduced-motion rule.
- Responsive: sidebar becomes compact top navigation at 700px; table scroll preserved; source drawer is full width on phone, fixed side drawer on desktop. No page-wide overflow.
- Visual: restrained dark palette, subtle green accent, readable body text, tabular numeric data; spacing and typography defined centrally in globals.css; no decorative effects.
- Read integrity: runtime validation rejects malformed values, missing reported values, duplicates, invalid periods, row currency errors and impossible coverage. Public reads require published verified payload, not approved candidates.

Known initial contract limitations to report: original-report view not provided. Source inspector alternatives are limited to compatible observations selected in at most 100 published datasets, not every private extraction. No independent usability participant.

Cost estimate: 20 project files opened/created, approximately 10 searches; skills read: React, Impeccable and new-work/craft-floor, UI consistency finding-patterns/decisions/implementing. No incumbent reference pages existed to count.
