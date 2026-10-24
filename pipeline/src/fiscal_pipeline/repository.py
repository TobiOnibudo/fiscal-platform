"""Short transactions only. External requests happen before entering these functions."""

import json
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from fiscal_pipeline.domain import (
    RULE_VERSION,
    Cell,
    SourceInventory,
    logical_hash,
    select_latest,
    validate,
)
from fiscal_pipeline.models import Company, CompanyPublication, Dataset, Filing
from fiscal_pipeline.public_contract import PublicDataset

COMPANIES = [
    (
        "wise",
        "Wise plc",
        3,
        "https://owners.wise.com/financials/annual-reports",
        ["owners.wise.com", "wise.com"],
    ),
    (
        "adyen",
        "Adyen N.V.",
        12,
        "https://investors.adyen.com/financials",
        ["investors.adyen.com", "adyen.com"],
    ),
]


def seed_companies(session: Session) -> None:
    for company_id, name, month, entry, domains in COMPANIES:
        if session.get(Company, company_id) is None:
            session.add(
                Company(
                    id=company_id,
                    name=name,
                    fiscal_year_end_month=month,
                    config={"entryPoints": [entry], "approvedDomains": domains},
                )
            )
            session.flush()
            session.add(CompanyPublication(company_id=company_id, dataset_id=None, generation=0))


def record_filing(
    session: Session,
    *,
    company_id: str,
    title: str,
    source_url: str,
    sha256: str,
    classification: str,
    published_on: date | None,
    storage_metadata: dict[str, Any],
) -> Filing:
    """Create or complete the filing record for one immutable source PDF."""
    filing_id = f"{company_id}-{sha256}"
    filing = session.get(Filing, filing_id)
    if filing is not None:
        if filing.company_id != company_id or filing.sha256 != sha256:
            raise ValueError("filing identity conflicts with immutable source content")
        if filing.source_url != source_url:
            raise ValueError("filing digest is already registered to another publisher URL")
        metadata = dict(filing.metadata_json)
        metadata["storage"] = storage_metadata
        filing.metadata_json = metadata
        filing.title = title
        filing.classification = classification
        filing.published_on = published_on
        return filing
    filing = Filing(
        id=filing_id,
        company_id=company_id,
        title=title,
        source_url=source_url,
        sha256=sha256,
        classification=classification,
        published_on=published_on,
        metadata_json={"storage": storage_metadata},
    )
    session.add(filing)
    return filing


def publish(session: Session, dataset_id: str, expected_generation: int) -> int:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise ValueError("dataset not found")
    public = PublicDataset.model_validate_json(json.dumps(dataset.payload))
    if public.companyId != dataset.company_id:
        raise ValueError("public dataset company differs from database company")
    validation = dataset.validation
    if (
        dataset.status not in {"approved", "published"}
        or validation.get("ruleVersion") != RULE_VERSION
        or validation.get("issues") != []
        or validation.get("reviewed") is not True
        or dataset.payload.get("kind") != "verified"
        or logical_hash(dataset.payload) != dataset.id
    ):
        raise ValueError("candidate is not source-reviewed and approved under current rules")
    coverage: dict[str, Any] = dataset.payload.get("coverage", {})
    if coverage.get("verifiedPeriods", 0) < 10 or coverage.get("gaps") != []:
        raise ValueError("ten-year coverage gate not met")
    bundles = validation.get("sourceBundles")
    if not isinstance(bundles, list) or not bundles:
        raise ValueError("independent source-validation bundles are required")
    checked: dict[str, Cell] = {}
    for bundle in bundles:
        source = SourceInventory.model_validate_json(json.dumps(bundle["inventory"]))
        cells = [Cell.model_validate_json(json.dumps(c)) for c in bundle["cells"]]
        if validate(cells, source):
            raise ValueError("source validation failed at publication")
        for cell in cells:
            if cell.id in checked and checked[cell.id] != cell:
                raise ValueError("duplicate observation identity has different content")
            checked[cell.id] = cell
    latest = select_latest(list(checked.values()))
    latest_ids = {c.id for c in latest}
    if {statement.id for statement in public.statements} != {"income", "balance", "cashflow"}:
        raise ValueError("all three complete statements are required")
    for statement in public.statements:
        periods = statement.periods
        ends = sorted(period.end for period in periods)
        if (
            len(periods) != 10
            or len({period.id for period in periods}) != 10
            or len(set(ends)) != 10
            or any(
                not 350 <= (later - earlier).days <= 380
                for earlier, later in zip(ends, ends[1:], strict=False)
            )
        ):
            raise ValueError("ten unique annual periods required per statement")
        financial_rows = [r for r in statement.rows if r.kind != "section"]
        if not financial_rows:
            raise ValueError("nonempty financial rows required")
        required_concepts = {
            c.concept_id
            for c in latest
            if c.statement == statement.id and c.period_end in {p.end for p in periods}
        }
        if any(
            not any(
                c.statement == statement.id and c.period_end == p.end and c.period_start == p.start
                for c in latest
            )
            for p in periods
        ):
            raise ValueError("verified statement period lacks any reviewed source observations")
        if {r.id for r in financial_rows} != required_concepts:
            raise ValueError("reviewed financial concepts omitted or invented")
        for row in statement.rows:
            if row.kind == "section":
                continue
            for period in periods:
                selected = row.cells.get(period.id)
                if selected is None:
                    if any(
                        c.concept_id == row.id
                        and c.statement == statement.id
                        and c.period_start == period.start
                        and c.period_end == period.end
                        for c in latest
                    ):
                        raise ValueError("published cell omitted despite known source observation")
                    continue
                selected_cell = checked.get(selected.observationId)
                if (
                    selected_cell is None
                    or selected_cell.id not in latest_ids
                    or selected_cell.company_id != dataset.company_id
                    or selected_cell.concept_id != row.id
                    or selected_cell.statement != statement.id
                    or selected_cell.amount != selected.value
                    or selected_cell.value_state != selected.state
                    or selected_cell.unit != row.unit
                    or selected_cell.currency != row.currency
                    or selected_cell.period_end != period.end
                    or selected_cell.period_start != period.start
                    or selected_cell.scope != statement.scope
                    or selected_cell.basis != statement.basis
                    or selected_cell.filing_id != selected.filingId
                    or selected_cell.raw_label != selected.rawLabel
                    or selected_cell.raw_text != selected.rawText
                    or selected_cell.evidence.page != selected.pdfPage
                    or selected_cell.evidence.printed_page != selected.printedPage
                    or selected_cell.evidence.comparative != selected.comparative
                ):
                    raise ValueError("public cell is not grounded in validated source bundle")
    pointer = session.scalar(
        select(CompanyPublication)
        .where(CompanyPublication.company_id == dataset.company_id)
        .with_for_update()
    )
    if pointer is None or pointer.generation != expected_generation:
        raise ValueError("stale publication generation; reload before retrying")
    pointer.dataset_id = dataset.id
    dataset.status = "published"
    pointer.generation += 1
    return pointer.generation
