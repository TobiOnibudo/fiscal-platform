# Financial Statement Extraction Problem Statement

## Objective

Build a deployed web application that discovers company investor relations PDFs, classifies the filings, extracts annual financial statements exactly as reported, and combines multiple reports into a clean ten year view.

Select two or three European companies, such as Adyen and Heineken.

## Original assignment requirements

### Company selection

Select two or three European companies. Basic company information, including name, ticker, and investor relations website, may be hardcoded.

### Filing discovery and classification

For each company, scrape and classify the PDFs available through its investor relations website. Retain the discovered filings as a secondary output, including documents that are not annual reports.

### Annual report extraction

Extract the three primary financial statements from annual reports:

- Income Statement.
- Balance Sheet.
- Cash Flow Statement.

The aim is to extract all statement data exactly as the company reports it. Preserve reported labels, amounts, periods, units, and statement structure rather than replacing the company's presentation with a generic financial template.

### Ten year statement views

Combine data from multiple annual reports into one clean table for each statement, with ten years of data. The example supplied is Tesla's Income Statement; the selected demonstration companies should be European companies.

### User interface and deployment

Provide a quick interface for exploring the companies, filings, and financial statement data. Deploy the application to a live link that the reviewing team can open. Non-technical decision makers will assess the deployed application rather than reviewing GitHub repositories.

## Required outputs

1. A ten year Income Statement table for each selected company.
2. A ten year Balance Sheet table for each selected company.
3. A ten year Cash Flow Statement table for each selected company.
4. An inventory of scraped and classified filings.
5. A working live application accessible to reviewers.

## Bonus requirements

### Deduplication and ordering

Similarly named items across reports can create a cluttered table. Deduplicate equivalent items and arrange the clean view to align with the company's latest reporting.

### Latest comparative data

An annual report may include comparative columns for earlier years. For example, a 2024 report may include 2023 and 2022 data that updates or restates the values in the earlier reports. Extract every reported period and prefer the latest applicable reported value for each period when building the clean view.

