"""Run with TEST_DATABASE_URL against a disposable migrated PostgreSQL database."""

import os
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fiscal_pipeline.domain import logical_hash
from fiscal_pipeline.models import Dataset
from fiscal_pipeline.repository import _row_alias_key, _unit_scale, publish, seed_companies


def test_unit_scale_recognizes_company_report_notations() -> None:
    assert _unit_scale("GBP'000", "GBP")[1] == Decimal("1000")
    assert _unit_scale("£m", "GBP")[1] == Decimal("1000000")
    assert _unit_scale("EUR_thousands", "EUR")[1] == Decimal("1000")
    assert _unit_scale("EUR per share", "EUR")[0] == "pershare"


def test_source_validated_aliases_are_issuer_and_statement_scoped() -> None:
    assert _row_alias_key(
        "wise", "income", "Operating loss", "old-operating-loss"
    ) == _row_alias_key("wise", "income", "Operating profit/(loss)", "new-operating-profit")
    assert _row_alias_key(
        "wise", "income", "Loss before tax", "old-loss-before-tax"
    ) == _row_alias_key("wise", "income", "Profit before tax", "new-profit-before-tax")
    assert _row_alias_key("wise", "income", "Interest expenses", "plural") == _row_alias_key(
        "wise", "income", "Interest expense", "singular"
    )
    assert _row_alias_key(
        "wise", "income", "Total other comprehensive loss", "old"
    ) == _row_alias_key("wise", "income", "Total other comprehensive income/(loss)", "new")
    assert _row_alias_key(
        "wise", "income", "Total other comprehensive income", "other-comprehensive"
    ) != _row_alias_key(
        "wise", "income", "Total comprehensive income for the year", "comprehensive"
    )
    assert _row_alias_key(
        "wise", "cashflow", "Cash generated from operating activities", "old-id"
    ) == _row_alias_key("wise", "cashflow", "Cash generated from operations", "new-id")
    assert _row_alias_key(
        "adyen", "income", "Income before net finance expense and income taxes", "old-id"
    ) == _row_alias_key(
        "adyen", "income", "Income before net finance income/(expense) and income taxes", "new-id"
    )
    assert (
        _row_alias_key(
            "wise", "income", "Income before net finance expense and income taxes", "old-id"
        )
        == "old-id"
    )
    assert _row_alias_key("wise", "cashflow", "Interest paid", "old-id") == _row_alias_key(
        "wise", "cashflow", "Interest expense paid", "new-id"
    )
    assert _row_alias_key(
        "adyen", "balance", "Payable to merchants and financial institutions", "old-id"
    ) == _row_alias_key(
        "adyen", "balance", "Payables to merchants and financial institutions", "new-id"
    )


def synthetic_release() -> tuple[dict, dict]:  # type: ignore[type-arg]
    """DB gate fixture only; synthetic amounts are never restored as company data."""
    statements, bundles = [], []
    for statement_id in ["income", "balance", "cashflow"]:
        periods, selected = [], {}
        for year in range(2016, 2026):
            end = f"{year}-03-31"
            start = None if statement_id == "balance" else f"{year - 1}-04-01"
            cell_id = f"{statement_id}-{year}"
            evidence = {
                "source_hash": "a" * 64,
                "page": 1,
                "row": "r1",
                "label": "Synthetic",
                "column": end,
                "raw_text": "123.456",
                "unit": "units",
                "reviewed": True,
            }
            cell = {
                "id": cell_id,
                "company_id": "wise",
                "filing_id": "test",
                "concept_id": "synthetic",
                "statement": statement_id,
                "period_start": start,
                "period_end": end,
                "published_on": "2026-06-01",
                "raw_label": "Synthetic",
                "raw_text": "123.456",
                "value_state": "reported",
                "amount": "123.456",
                "unit": "units",
                "currency": "GBP",
                "scope": "consolidated",
                "basis": "IFRS",
                "mapping_reviewed": True,
                "evidence": evidence,
            }
            inventory = {
                "company_id": "wise",
                "source_hash": "a" * 64,
                "statement": statement_id,
                "scope": "consolidated",
                "basis": "IFRS",
                "rows": ["r1"],
                "columns": [end],
                "period_starts": {end: start},
                "currency": "GBP",
                "pages": [1],
                "cells": [evidence],
                "boundaries_reviewed": True,
            }
            bundles.append({"inventory": inventory, "cells": [cell]})
            periods.append({"id": str(year), "label": f"FY{year}", "start": start, "end": end})
            selected[str(year)] = {
                "observationId": cell_id,
                "value": "123.456",
                "state": "reported",
                "filingId": "test",
                "rawLabel": "Synthetic",
                "rawText": "123.456",
                "pdfPage": 1,
                "printedPage": "",
                "comparative": "original",
            }
        statements.append(
            {
                "id": statement_id,
                "title": "Synthetic test statement",
                "scope": "consolidated",
                "basis": "IFRS",
                "currency": "GBP",
                "unit": "units",
                "periods": periods,
                "rows": [
                    {
                        "id": "synthetic",
                        "label": "Synthetic",
                        "aliases": [],
                        "depth": 0,
                        "historical": False,
                        "kind": "item",
                        "unit": "units",
                        "currency": "GBP",
                        "cells": selected,
                    }
                ],
            }
        )
    return (
        {
            "schemaVersion": "1",
            "companyId": "wise",
            "kind": "verified",
            "statements": statements,
            "coverage": {"expectedPeriods": 10, "verifiedPeriods": 10, "gaps": []},
        },
        {"ruleVersion": "1", "issues": [], "reviewed": True, "sourceBundles": bundles},
    )


@pytest.fixture
def engine():  # type: ignore[no-untyped-def]
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not configured; integration runs in CI")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE companies CASCADE"))
    yield engine
    engine.dispose()


@pytest.mark.integration
def test_postgres_publication_and_precision(engine) -> None:  # type: ignore[no-untyped-def]
    amount = Decimal("123456789012345678901234567890.12345678901234567890")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT CAST(:amount AS NUMERIC)"), {"amount": amount}) == amount
        )
    payload, validation = synthetic_release()
    dataset_id = logical_hash(payload)
    with Session(engine) as session, session.begin():
        seed_companies(session)
        seed_companies(session)
        session.add(
            Dataset(
                id=dataset_id,
                company_id="wise",
                status="approved",
                payload=payload,
                validation=validation,
            )
        )
    with Session(engine) as session, session.begin():
        assert publish(session, dataset_id, 0) == 1
    with Session(engine) as session, session.begin():
        with pytest.raises(ValueError, match="stale"):
            publish(session, dataset_id, 0)
    with Session(engine) as session, session.begin():
        invalid_payload = {**payload, "kind": "sample"}
        invalid_id = logical_hash(invalid_payload)
        session.add(
            Dataset(
                id=invalid_id,
                company_id="wise",
                status="draft",
                payload=invalid_payload,
                validation=validation,
            )
        )
    with Session(engine) as session, session.begin():
        with pytest.raises(ValueError, match="not source-reviewed"):
            publish(session, invalid_id, 1)
    with engine.connect() as connection:
        assert (
            connection.scalar(
                text("SELECT generation FROM company_publications WHERE company_id='wise'")
            )
            == 1
        )
    with (
        pytest.raises(Exception, match="published dataset is immutable"),
        engine.begin() as connection,
    ):
        connection.execute(
            text("UPDATE datasets SET status='draft' WHERE id=:id"), {"id": dataset_id}
        )


@pytest.mark.integration
def test_sparse_history_is_not_invented(engine) -> None:  # type: ignore[no-untyped-def]
    import copy

    payload, validation = synthetic_release()
    bundle = copy.deepcopy(validation["sourceBundles"][9])
    cell = bundle["cells"][0]
    cell["id"] = "new-concept-2025"
    cell["concept_id"] = "new-concept"
    bundle["inventory"]["rows"] = ["new-source-row"]
    for evidence in [cell["evidence"], bundle["inventory"]["cells"][0]]:
        evidence["row"] = "new-source-row"
    validation["sourceBundles"].append(bundle)
    row = copy.deepcopy(payload["statements"][0]["rows"][0])
    row["id"] = "new-concept"
    row["cells"] = {"2025": {**row["cells"]["2025"], "observationId": "new-concept-2025"}}
    payload["statements"][0]["rows"].append(row)
    dataset_id = logical_hash(payload)
    with Session(engine) as session, session.begin():
        seed_companies(session)
        session.add(
            Dataset(
                id=dataset_id,
                company_id="wise",
                status="approved",
                payload=payload,
                validation=validation,
            )
        )
    with Session(engine) as session, session.begin():
        assert publish(session, dataset_id, 0) == 1


@pytest.mark.integration
def test_database_constraints(engine) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text("INSERT INTO companies VALUES ('invalid','Invalid',13,'{}')"))


@pytest.mark.integration
def test_concurrent_publishers_reject_stale_generation(engine) -> None:  # type: ignore[no-untyped-def]
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    payload, validation = synthetic_release()
    dataset_id = logical_hash(payload)
    with Session(engine) as session, session.begin():
        seed_companies(session)
        session.add(
            Dataset(
                id=dataset_id,
                company_id="wise",
                status="approved",
                payload=payload,
                validation=validation,
            )
        )
    barrier = Barrier(2)

    def contender() -> str:
        barrier.wait(timeout=10)
        try:
            with Session(engine) as session, session.begin():
                publish(session, dataset_id, 0)
            return "published"
        except ValueError as exc:
            assert "stale" in str(exc)
            return "stale"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = [
            future.result(timeout=20)
            for future in [executor.submit(contender), executor.submit(contender)]
        ]
    assert sorted(results) == ["published", "stale"]


@pytest.mark.integration
@pytest.mark.parametrize(
    "corruption",
    [
        "public_shape",
        "empty_rows",
        "older_selection",
        "duplicate_observation",
        "false_concept",
        "wrong_source",
        "duplicate_period_end",
        "known_cell_omitted",
    ],
)
def test_publication_revalidates_inputs(engine, corruption: str) -> None:  # type: ignore[no-untyped-def]
    import copy

    payload, validation = synthetic_release()
    if corruption == "public_shape":
        del payload["schemaVersion"]
    elif corruption == "empty_rows":
        payload["statements"][0]["rows"] = []
    elif corruption == "false_concept":
        payload["statements"][0]["rows"][0]["id"] = "invented-merge"
    elif corruption == "wrong_source":
        payload["statements"][0]["rows"][0]["cells"]["2016"]["rawText"] = "999"
    elif corruption == "duplicate_period_end":
        payload["statements"][0]["periods"][1]["end"] = "2016-03-31"
    elif corruption == "known_cell_omitted":
        del payload["statements"][0]["rows"][0]["cells"]["2016"]
    else:
        bundle = copy.deepcopy(validation["sourceBundles"][0])
        bundle["cells"][0]["published_on"] = "2026-07-01"
        if corruption == "older_selection":
            bundle["cells"][0]["id"] = "later-compatible-source"
        validation["sourceBundles"].append(bundle)
    dataset_id = logical_hash(payload)
    with Session(engine) as session, session.begin():
        seed_companies(session)
        session.add(
            Dataset(
                id=dataset_id,
                company_id="wise",
                status="approved",
                payload=payload,
                validation=validation,
            )
        )
    with Session(engine) as session, session.begin(), pytest.raises(ValueError):
        publish(session, dataset_id, 0)
    with engine.connect() as connection:
        assert (
            connection.scalar(
                text("SELECT dataset_id FROM company_publications WHERE company_id='wise'")
            )
            is None
        )
