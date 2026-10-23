# Financial Statement Data Sources and Research Register

## Purpose and evidence standard

This register documents the sources considered for Wise and Adyen and why they may be used. It records research already performed, retrieval limitations, known document quirks, and the work needed to establish ten-year coverage. It does not claim that a production extraction or a complete source archive exists.

Research was performed during the planning session dated October 22, 2026. Recheck publisher URLs and document versions when downloading. Page counts and observations below describe the documents exposed to the research tool, not guaranteed future publisher versions.

The original assignment prioritizes annual reports on investor relations websites. Official company-hosted historical reports are suitable candidates. Prospectuses and registry filings are supplemental sources and must remain separately classified. Search aggregators and third-party financial tables are discovery leads, not substitutes for original statements.

## Verification vocabulary

| Status | Meaning |
| --- | --- |
| Discovered | A link or index entry exists; contents may not have been retrieved |
| Inspected | The research tool exposed document contents sufficient for the stated observation |
| Partial inspection | Only a subset, contents page, or search excerpt was checked |
| Retrieval failed | The tool did not retrieve the document successfully; this is not proof the publisher file is unavailable |
| Extracted | The implementation pipeline produced observations; not yet achieved in this workspace |
| Verified | Source transcription, scope, units, mappings, and selected periods passed recorded review; not yet achieved |

Successful browsing is not the same as downloading and hashing an archive. No local report hashes have yet been established by this research.

## Wise

### Official entry points

- [Owner relations](https://owners.wise.com/): company source hub.
- [Annual reports](https://owners.wise.com/financials/annual-reports): index showing FY2021 through FY2026 during research.
- [Important documents and FAQ](https://owners.wise.com/owner-resources/faqs-and-important-documents): additional document types and reporting-calendar information.

The document list mixes group material with subsidiary disclosures. Select the appropriate consolidated reporting entity before extraction. The FAQ identifies a March 31 fiscal year end. Some FAQ listing wording appeared stale relative to a dated company announcement; use the announcement for that specific listing event rather than assuming every evergreen page is current.

### Research findings

| ID | Source | Status and finding | Intended use |
| --- | --- | --- | --- |
| WISE INDEX | [Annual report index](https://owners.wise.com/financials/annual-reports) | Inspected as an index; entries FY2021-FY2026 | Discovery starting point, not proof of statement completeness |
| WISE 2020 | [Company-hosted PDF](https://wise.com/imaginary/202fc0ec8b6991c74cb298a6c7b9276c.pdf) | Inspected portions of a 69-page PDF identifying TransferWise Ltd, year ended March 31, 2020 | Earlier consolidated source and comparative-update fixture, subject to issuer-continuity review |
| WISE 2023 | [Annual Report and Accounts PDF](https://owners.wise.com/static-files/b18fcce9-e441-4a2b-9ee1-21a7c149190e) | Cover and contents inspected; 200-page PDF | Consolidated extraction candidate; contents lists printed statement pages 142, 143, and 145 |
| WISE 2024 | [Candidate official PDF](https://owners.wise.com/static-files/3839881a-60fb-4671-86a6-e9ec2bcd7ebd) | Discovered; direct research fetch exceeded tool size handling | Download and inspect through the actual pipeline before use |
| WISE 2025 | [Candidate official PDF](https://owners.wise.com/static-files/fc630a9e-c907-4946-aa5e-16f4246a4ba6) | Discovered; direct research fetch exceeded tool size handling | Download and inspect through the actual pipeline before use |
| WISE 2026 | [Important documents](https://owners.wise.com/owner-resources/faqs-and-important-documents) | Index lists a June 30, 2026 annual report and a September 22, 2026 group financial statement document | Resolve both documents and review entity and reporting basis before selection |
| WISE LISTING | [May 11, 2026 company announcement](https://newsroom.wise.com/en-NAM/265506-wise-debuts-us-listing-on-nasdaq/) | Dated announcement states Nasdaq listing and continuing secondary LSE listing | Company metadata and evidence that listing and reporting-basis assumptions require versioning |

### Verified research issue with the FY2019 announcement

The official [2019 annual report announcement](https://wise.com/gb/blog/annualreport2019) links to [this PDF](https://wise.com/imaginary-v2/202fc0ec8b6991c74cb298a6c7b9276c.pdf). The document exposed during research identifies the year ended March 31, 2020. The alternate company PDF path in the table exposes the same apparent report content, but local byte equality has not been established.

This is a concrete reason to classify periods from inside each PDF. Store both the referring-page title and actual document period, flag the mismatch, and deduplicate only after hashing downloads. Do not assign FY2019 simply because the link came from a 2019 article.

### FY2020 statement locations and comparative evidence

The inspected FY2020 PDF contains the following statement tables:

| Statement | One-based PDF page | Printed page | Period columns observed |
| --- | --- | --- | --- |
| Consolidated comprehensive income | 33 | 33 | 2020 and 2019 |
| Consolidated financial position | 35 | 35 | 2020 and 2019 |
| Consolidated cash flows | 43 | 43 | 2020 and 2019 |

The income statement page explicitly explains that the presentation of investment and other income changed and that FY2019 comparatives were restated. This is source evidence for a real comparative-update test. The earlier original FY2019 statement must still be located and checked before showing a numerical before-and-after claim. Identical PDF and printed page numbers in this document must not become a global assumption.

### Coverage assessment

The current target is FY2017-FY2026 if the latest report is applicable to the selected continuous consolidated history. The modern index alone supplies six report entries. The FY2020 source adds earlier material and 2019 comparatives. FY2017 and FY2018 still require official full-statement evidence, and FY2019 must be assessed across original and later presentations.

TransferWise predecessor reporting, Wise plc reorganization, and later group reporting require an explicit continuity decision. Do not stitch entities or accounting bases together just to obtain ten columns. Initial research has not settled those decisions.

## Adyen

### Official entry points

- [Investor relations](https://investors.adyen.com/): current hub; the older company investor-relations URL redirected here during research.
- [Financial publications](https://investors.adyen.com/financials): annual report entries for 2018-2025 and interim and other financial documents.
- [FY2018 report page](https://investors.adyen.com/financials/2018): official historical report page with PDF download.
- [FY2025 report page](https://investors.adyen.com/financials/2025): official latest completed-year report candidate.

The archive also exposes Pillar 3 disclosures, iXBRL packages, financial comparisons, and half-year materials. These are useful classification cases. An iXBRL document may become corroborating evidence later; it does not replace PDF extraction in this assignment.

### Research findings

| ID | Source | Status and finding | Intended use |
| --- | --- | --- | --- |
| ADYEN INDEX | [Financial publications](https://investors.adyen.com/financials) | Index inspected; annual report entries 2018-2025 | Discover all annual and other filing candidates |
| ADYEN 2018 | [Official report page](https://investors.adyen.com/financials/2018) | Download link followed successfully; research tool exposed a 73-page PDF | Earlier-report extraction candidate; archive the resolved publisher asset URL and hash |
| ADYEN 2025 | [Official report page](https://investors.adyen.com/financials/2025) | Page inspected; PDF retrieval failed in the research tool | Resolve and inspect through the pipeline; do not claim PDF validation yet |
| ADYEN 2025 ANNOUNCEMENT | [Publication announcement](https://www.adyen.com/press-and-media/adyen-publishes-2025-annual-report) | Dated March 5, 2026, with official report link | Publication metadata and provenance trail |
| ADYEN PROSPECTUS | [Euronext-hosted prospectus](https://www.euronext.com/sites/www.euronext.com/files/3.3.22.32.5.2_nash_-_afm_final_approval_version_prospectus.pdf) | Financial contents inspected in a 364-page PDF; includes 2017, 2016, and 2015 consolidated statement sections | Supplemental pre-listing source; distinguish from annual report discovery |
| ADYEN LISTING | [Euronext listing announcement](https://www.euronext.com/sites/default/files/pr_euronext_welcomes_adyen_20180613.pdf) | Exchange announcement of June 2018 listing | Listing metadata; not a statement source |

### Prospectus statement locations

The prospectus contents lists the following printed references. Confirm PDF page mapping against the downloaded artifact before extraction.

| Statement year | Income statement reference | Balance sheet reference | Cash flow reference |
| --- | --- | --- | --- |
| 2017 | F-18 | F-19 | F-21 |
| 2016 | F-68 | F-69 | F-71 |
| 2015 | F-113 | F-114 | F-116 |

The same prospectus also contains interim statements. The parser must select annual consolidated sections and must not mistake Q1 comparative columns for annual periods.

### Coverage assessment

Target calendar years 2016-2025. The annual report index contains eight report entries, with earlier comparatives to be inspected. The prospectus offers a plausible supplemental path to older periods, including 2016, but compatibility and actual extracted coverage remain to be verified.

Before using the prospectus to close the assignment's ten-year gap, check whether its statements are also accessible as annual financial reports through the company's investor relations sources. Keep the document type visible regardless of source.

## Initial coverage work queue

| Company | Periods | Current evidence level | Next action |
| --- | --- | --- | --- |
| Wise | FY2017-FY2018 | Full official statements not established | Search historical company material and supplemental official sources; confirm issuer identity |
| Wise | FY2019-FY2020 | FY2020 statements and FY2019 comparatives inspected in part | Find original FY2019 report and verify all cells and comparative changes |
| Wise | FY2021-FY2022 | Modern index entries | Resolve original PDFs and inspect statements |
| Wise | FY2023 | Cover and contents inspected | Extract and verify statement pages |
| Wise | FY2024-FY2025 | Official PDF candidates; tool retrieval limits | Download, hash, and inspect outside the research fetch limitation |
| Wise | FY2026 | Annual and later group document entries | Inspect basis, entity continuity, periods, and publication precedence |
| Adyen | 2016-2017 | Supplemental prospectus statement sections identified | Locate annual-report equivalents and validate source suitability |
| Adyen | 2018 | Official PDF retrieved through research | Download and hash locally, then extract and verify |
| Adyen | 2019-2024 | Official index entries | Resolve and inspect each report and comparative columns |
| Adyen | 2025 | Official landing page and publication metadata | Retrieve PDF successfully and inspect |

## Machine readable manifest requirements

Implement a manifest with stable source ID, company ID, legal entity, document classification, discovery URL, resolved URL, publication metadata and certainty, fiscal periods, basis, currency, reporting scope, hash, local archive path, retrieval status, statement page locations, and review notes.

Generate the detailed company/year/statement coverage matrix from inspected and extracted records. The table above is a research work queue, not the final generated matrix.

## Sources that must not supply the final values

Third-party stock tables, search snippets, press-release revenue highlights, and similarly named issuers may help discovery but do not satisfy source-level statement extraction. In particular, WiseTech Global, Wise Energy, and other companies containing Wise in their names are different issuers.

Do not use model prior knowledge or an external standardized financial API to fill missing cells. Values must originate in identified documents, with original labels and evidence retained.

## Completion criteria

The register is complete for a demonstration only when each required period and statement has an identified source, its original archive hash, actual statement pages, extracted observations, selected reporting version, and recorded verification status. If a period cannot be sourced, retain the gap and its investigation history.
