"""Short transactions only. External requests happen before entering these functions."""

import json
from datetime import date
from decimal import Decimal
from hashlib import sha256
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from fiscal_pipeline.domain import (
    RULE_VERSION,
    Cell,
    SourceInventory,
    display_label,
    logical_hash,
    parse_amount,
    select_latest,
    validate,
)
from fiscal_pipeline.models import (
    Company,
    CompanyPublication,
    Dataset,
    ExtractionAttempt,
    Filing,
    Observation,
)
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
        ["investors.adyen.com", "adyen.com", "brand.adyen.com", "www.euronext.com"],
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
        else:
            company = session.get(Company, company_id)
            if company is not None:
                company.config = {"entryPoints": [entry], "approvedDomains": domains}


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
    report_year: int | None = None,
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
        if report_year is not None:
            metadata["reportYear"] = report_year
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
        metadata_json={
            "storage": storage_metadata,
            **({"reportYear": report_year} if report_year is not None else {}),
        },
    )
    session.add(filing)
    return filing


def record_extraction(
    session: Session,
    *,
    company_id: str,
    filing_id: str,
    source_hash: str,
    model: str,
    cells: list[Cell],
    expected_statement: str | None = None,
) -> ExtractionAttempt:
    """Persist an immutable transcription after deterministic data validation."""
    filing = session.get(Filing, filing_id)
    if filing is None or filing.company_id != company_id:
        raise ValueError("filing does not belong to the selected company")
    if not cells:
        raise ValueError("extraction returned no cells")
    if any(cell.company_id != company_id for cell in cells):
        raise ValueError("model output contains a different company")
    if any(cell.filing_id != filing_id for cell in cells):
        raise ValueError("model output contains a different filing")
    if any(cell.evidence.source_hash != source_hash for cell in cells):
        raise ValueError("model output evidence does not match the supplied PDF")
    statements = {cell.statement for cell in cells}
    if len(statements) != 1 or (expected_statement and statements != {expected_statement}):
        raise ValueError("model output does not match the expected statement")
    if len(cells) < 8 or sum(cell.value_state == "reported" for cell in cells) < 6:
        raise ValueError("statement extraction is too sparse to be usable")
    if any(cell.scope != "consolidated" for cell in cells):
        raise ValueError("only consolidated statement cells may be published")
    if any(not cell.basis.strip() for cell in cells):
        raise ValueError("statement basis is required for every cell")
    if any(not cell.raw_label.strip() or not cell.concept_id.strip() for cell in cells):
        raise ValueError("statement rows require non-empty labels and concept identities")
    coordinates = [(cell.evidence.row, cell.evidence.column) for cell in cells]
    if len(coordinates) != len(set(coordinates)):
        raise ValueError("statement contains duplicate row and column coordinates")
    rows = {cell.evidence.row for cell in cells}
    columns = {cell.evidence.column for cell in cells}
    if not rows or not columns:
        raise ValueError("statement extraction must contain rows and annual columns")
    if len(columns) < 2:
        raise ValueError("annual report extraction must include its comparative column")
    minimum_rows = {"income": 8, "balance": 10, "cashflow": 15}
    statement = next(iter(statements))
    if len(rows) < minimum_rows[statement]:
        raise ValueError("statement extraction omitted too many source rows")
    for cell in cells:
        if cell.evidence.column != cell.period_end.isoformat():
            raise ValueError("source column must equal the reported period end")
        if cell.value_state == "reported":
            if cell.amount is None or parse_amount(cell.raw_text) != Decimal(cell.amount):
                raise ValueError("canonical amount does not round-trip to the source text")
        if cell.statement == "balance" and cell.period_start is not None:
            raise ValueError("balance sheet cells must use instant periods")
        if cell.statement != "balance" and (
            cell.period_start is None
            or not 350 <= (cell.period_end - cell.period_start).days <= 380
        ):
            raise ValueError("income and cash-flow cells must use annual periods")
    response_hash = logical_hash([cell.model_dump(mode="json") for cell in cells])
    attempt_id = sha256(f"{filing_id}:{source_hash}:{model}:{response_hash}".encode()).hexdigest()
    existing = session.get(ExtractionAttempt, attempt_id)
    if existing is not None:
        return existing
    attempt = ExtractionAttempt(
        id=attempt_id,
        filing_id=filing_id,
        response_hash=response_hash,
        status="needs_review",
        payload={
            "schemaVersion": 1,
            "sourceHash": source_hash,
            "model": model,
            "cellCount": len(cells),
        },
    )
    session.add(attempt)
    session.flush()
    for source_order, cell in enumerate(cells):
        if session.get(Observation, cell.id) is not None:
            raise ValueError("observation identity already exists")
        session.add(
            Observation(
                id=cell.id,
                attempt_id=attempt.id,
                company_id=cell.company_id,
                concept_id=cell.concept_id,
                period_start=cell.period_start,
                period_end=cell.period_end,
                statement=cell.statement,
                raw_label=cell.raw_label,
                raw_text=cell.raw_text,
                amount=cell.amount,
                value_state=cell.value_state,
                unit=cell.unit,
                currency=cell.currency,
                scope=cell.scope,
                basis=cell.basis,
                evidence={
                    **cell.evidence.model_dump(mode="json"),
                    "mappingReviewed": cell.mapping_reviewed,
                    "sourceOrder": source_order,
                },
            )
        )
    return attempt


def validate_automated_attempts(session: Session, company_id: str) -> dict[str, int]:
    """Approve usable stored grids and quarantine incomplete model output."""
    attempts = session.scalars(
        select(ExtractionAttempt)
        .join(Filing, ExtractionAttempt.filing_id == Filing.id)
        .where(Filing.company_id == company_id)
        .where(ExtractionAttempt.status.in_(["approved", "needs_review"]))
    ).all()
    for attempt in attempts:
        observations = session.scalars(
            select(Observation).where(Observation.attempt_id == attempt.id)
        ).all()
        issues: list[str] = []
        if len(observations) < 8:
            issues.append("too_few_cells")
        if sum(item.value_state == "reported" for item in observations) < 6:
            issues.append("too_few_reported_values")
        if len({item.statement for item in observations}) != 1:
            issues.append("mixed_statements")
        if any(item.scope != "consolidated" for item in observations):
            issues.append("non_consolidated_scope")
        if any(not item.basis.strip() for item in observations):
            issues.append("missing_basis")
        if any(not item.raw_label.strip() or not item.concept_id.strip() for item in observations):
            issues.append("missing_row_identity")
        coordinates = [
            (str(item.evidence.get("row", "")), str(item.evidence.get("column", "")))
            for item in observations
        ]
        if len(coordinates) != len(set(coordinates)):
            issues.append("duplicate_coordinates")
        stored_rows = {row for row, _ in coordinates}
        stored_columns = {column for _, column in coordinates}
        if not stored_rows or not stored_columns:
            issues.append("incomplete_grid")
        if len(stored_columns) < 2:
            issues.append("too_few_annual_columns")
        stored_statements = {item.statement for item in observations}
        if len(stored_statements) == 1:
            minimum_rows = {"income": 8, "balance": 10, "cashflow": 15}
            stored_statement = next(iter(stored_statements))
            if len(stored_rows) < minimum_rows[stored_statement]:
                issues.append("too_few_statement_rows")
        if any(
            str(item.evidence.get("column", "")) != item.period_end.isoformat()
            for item in observations
        ):
            issues.append("period_mismatch")
        attempt.payload = {**attempt.payload, "automatedValidationIssues": sorted(set(issues))}
        attempt.status = "validation_failed" if issues else "approved"
    session.flush()
    return {
        "approved": sum(attempt.status == "approved" for attempt in attempts),
        "validationFailed": sum(attempt.status == "validation_failed" for attempt in attempts),
    }


def materialize_automated_dataset(session: Session, company_id: str) -> Dataset:
    """Build the current read model from typed observations without a manual gate."""
    validate_automated_attempts(session, company_id)
    company = session.get(Company, company_id)
    if company is None:
        raise ValueError("company not found")
    rows = session.execute(
        select(Observation, Filing)
        .join(ExtractionAttempt, Observation.attempt_id == ExtractionAttempt.id)
        .join(Filing, ExtractionAttempt.filing_id == Filing.id)
        .where(Observation.company_id == company_id)
        .where(ExtractionAttempt.status == "approved")
    ).all()
    if not rows:
        raise ValueError("company has no extracted observations")
    selected: dict[tuple[str, str, date | None, date], tuple[Observation, Filing]] = {}
    for observation, filing in rows:
        if (
            observation.statement == "balance"
            and observation.period_end.month != company.fiscal_year_end_month
        ):
            continue
        key = (
            observation.statement,
            observation.concept_id,
            observation.period_start,
            observation.period_end,
        )
        current = selected.get(key)
        current_precedence = (
            (
                int(current[1].metadata_json.get("reportYear", 0)),
                current[1].published_on or date.min,
            )
            if current
            else (0, date.min)
        )
        precedence = (
            int(filing.metadata_json.get("reportYear", 0)),
            filing.published_on or date.min,
        )
        if current is None or precedence > current_precedence:
            selected[key] = (observation, filing)
    titles = {"income": "Income statement", "balance": "Balance sheet", "cashflow": "Cash flow"}
    statements: list[dict[str, Any]] = []
    for statement_id in ["income", "balance", "cashflow"]:
        statement_rows = [pair for key, pair in selected.items() if key[0] == statement_id]
        if not statement_rows:
            continue
        periods_by_id: dict[str, dict[str, Any]] = {}
        concepts: dict[str, list[tuple[Observation, Filing]]] = {}
        for observation, filing in statement_rows:
            period_id = observation.period_end.isoformat()
            periods_by_id[period_id] = {
                "id": period_id,
                "label": f"FY{observation.period_end.year}",
                "start": observation.period_start,
                "end": observation.period_end,
            }
            concepts.setdefault(observation.concept_id, []).append((observation, filing))

        def filing_precedence(pair: tuple[Observation, Filing]) -> tuple[int, date]:
            return (
                int(pair[1].metadata_json.get("reportYear", 0)),
                pair[1].published_on or date.min,
            )

        ordered = sorted(
            concepts.items(),
            key=lambda item: int(
                max(item[1], key=filing_precedence)[0].evidence.get("sourceOrder", 999999)
            ),
        )
        public_rows = []
        for concept_id, observations in ordered:
            latest_observation = max(observations, key=filing_precedence)[0]
            label = display_label(latest_observation.raw_label)
            cells = {}
            for observation, filing in observations:
                evidence = observation.evidence
                cells[observation.period_end.isoformat()] = {
                    "value": str(observation.amount) if observation.amount is not None else None,
                    "state": observation.value_state,
                    "observationId": observation.id,
                    "filingId": filing.id,
                    "rawLabel": observation.raw_label,
                    "rawText": observation.raw_text,
                    "pdfPage": int(evidence["page"]),
                    "printedPage": str(evidence.get("printed_page", "")),
                    "comparative": str(evidence.get("comparative", "original")),
                }
            public_rows.append(
                {
                    "id": concept_id,
                    "label": label,
                    "currency": latest_observation.currency,
                    "unit": latest_observation.unit,
                    "aliases": sorted(
                        {
                            item_label
                            for item, _ in observations
                            if (item_label := display_label(item.raw_label)) != label
                        }
                    ),
                    "depth": 0,
                    "kind": "item",
                    "historical": False,
                    "cells": cells,
                }
            )
        first = statement_rows[0][0]
        statements.append(
            {
                "id": statement_id,
                "title": titles[statement_id],
                "scope": "consolidated",
                "basis": first.basis,
                "currency": first.currency,
                "unit": first.unit,
                "periods": [periods_by_id[key] for key in sorted(periods_by_id)],
                "rows": public_rows,
            }
        )
    years_by_statement = {
        statement["id"]: {period["end"].year for period in statement["periods"]}
        for statement in statements
    }
    counts = [len(years_by_statement.get(statement_id, set())) for statement_id in titles]
    gaps = [
        f"{titles[statement_id]} covers "
        f"{len(years_by_statement.get(statement_id, set()))} of 10 periods"
        for statement_id in titles
        if len(years_by_statement.get(statement_id, set())) < 10
    ]
    payload = {
        "schemaVersion": "1",
        "companyId": company_id,
        "kind": "verified",
        "statements": statements,
        "coverage": {"expectedPeriods": 10, "verifiedPeriods": min(min(counts), 10), "gaps": gaps},
    }
    public = PublicDataset.model_validate(payload)
    payload = public.model_dump(mode="json")
    dataset_id = logical_hash(payload)
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        dataset = Dataset(
            id=dataset_id,
            company_id=company_id,
            status="published",
            payload=payload,
            validation={"mode": "automated", "reviewed": False, "issues": []},
        )
        session.add(dataset)
    pointer = session.get(CompanyPublication, company_id)
    if pointer is None:
        pointer = CompanyPublication(company_id=company_id, dataset_id=dataset_id, generation=1)
        session.add(pointer)
    elif pointer.dataset_id != dataset_id:
        pointer.dataset_id = dataset_id
        pointer.generation += 1
    return dataset


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
