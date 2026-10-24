from datetime import date
from decimal import Decimal, localcontext

import pytest
from hypothesis import given
from hypothesis import strategies as st

from fiscal_pipeline.domain import (
    Cell,
    Evidence,
    SourceInventory,
    display_label,
    logical_hash,
    parse_amount,
    select_latest,
    validate,
)


@pytest.fixture
def candidate() -> tuple[list[Cell], SourceInventory]:
    """Synthetic independently transcribed layout; never company financial data."""
    evidence = [
        Evidence(
            source_hash="a" * 64,
            page=1,
            row=label,
            label=label,
            column="2025-03-31",
            raw_text=raw,
            unit=unit,
            reviewed=True,
        )
        for label, raw, unit in [
            ("Revenue", "1,234.50", "thousands"),
            ("Costs", "(234.50)", "thousands"),
            ("EPS", "0.012", "per_share"),
        ]
    ]
    cells = [
        Cell(
            id=str(i),
            company_id="synthetic",
            filing_id="test",
            concept_id=e.row,
            statement="income",
            period_start=date(2024, 4, 1),
            period_end=date(2025, 3, 31),
            published_on=date(2025, 6, 1),
            raw_label=e.row,
            raw_text=e.raw_text,
            value_state="reported",
            amount=str(parse_amount(e.raw_text)),
            unit=e.unit,
            currency="GBP",
            scope="consolidated",
            basis="IFRS",
            mapping_reviewed=True,
            evidence=e,
        )
        for i, e in enumerate(evidence)
    ]
    source = SourceInventory(
        company_id="synthetic",
        source_hash="a" * 64,
        statement="income",
        scope="consolidated",
        basis="IFRS",
        rows=[e.row for e in evidence],
        columns=["2025-03-31"],
        period_starts={"2025-03-31": date(2024, 4, 1)},
        currency="GBP",
        pages=[1],
        cells=evidence,
        boundaries_reviewed=True,
    )
    return cells, source


@given(
    st.decimals(
        min_value="-1000000000000",
        max_value="1000000000000",
        allow_nan=False,
        allow_infinity=False,
        places=8,
    )
)
def test_exact_decimal_roundtrip(value: Decimal) -> None:
    assert parse_amount(format(value, "f")) == value


def test_numeric_grammar() -> None:
    assert parse_amount("(1,234.50)") == Decimal("-1234.50")
    assert parse_amount("1.234,50", decimal_separator=",") == Decimal("1234.50")
    assert parse_amount("—") is None
    assert parse_amount("0") == Decimal(0)
    for invalid in ["1,23", "NaN", "1e4", "123*", "(-12)", "12%"]:
        with pytest.raises(ValueError):
            parse_amount(invalid)


@pytest.mark.parametrize(
    ("raw_label", "expected"),
    [
        ("– Trade and other payables", "Trade and other payables"),
        ("Treasury stock . . . . . . . . . . . . . . .", "Treasury stock"),
        (
            "Class A Common shares \u2013 $0.01 par value; 1,025,672,252 shares authorized; "
            "1,025,672,252 shares issued and outstanding as of March 31, 2026",
            "Class A Common shares \u2013 $0.01 par value",
        ),
        ("Property, plant and equipment, net", "Property, plant and equipment, net"),
    ],
)
def test_display_label_removes_pdf_artifacts(raw_label: str, expected: str) -> None:
    assert display_label(raw_label) == expected


def test_reported_amount_contract_rejects_formatted_number(
    candidate: tuple[list[Cell], SourceInventory],
) -> None:
    cells, _ = candidate
    data = cells[0].model_dump()
    data["amount"] = "1,234.50"
    with pytest.raises(ValueError, match="String should match pattern"):
        Cell.model_validate(data)


@pytest.mark.parametrize(
    ("mutation", "check"),
    [
        ("omitted", "completeness"),
        ("swapped_year", "period_alignment"),
        ("borrowed", "source_semantics"),
        ("sign", "numeric_value"),
        ("scale", "source_semantics"),
        ("eps_scale", "source_semantics"),
        ("parent", "identity"),
        ("false_merge", "mapping_review"),
        ("currency", "currency"),
        ("duration", "duration"),
    ],
)
def test_plausible_ai_errors(
    candidate: tuple[list[Cell], SourceInventory], mutation: str, check: str
) -> None:
    cells, source = candidate
    assert validate(cells, source) == []
    if mutation == "omitted":
        cells.pop()
    else:
        index = 2 if mutation == "eps_scale" else 0
        updates: dict[str, object] = {
            "swapped_year": {"period_end": date(2024, 3, 31), "period_start": date(2023, 4, 1)},
            "borrowed": {"raw_text": "(234.50)", "amount": "-234.50"},
            "sign": {"amount": "-1234.50"},
            "scale": {"unit": "millions"},
            "eps_scale": {"unit": "thousands"},
            "parent": {"scope": "parent"},
            "false_merge": {"concept_id": "gross_revenue", "mapping_reviewed": False},
            "currency": {"currency": "EUR"},
            "duration": {"period_start": date(2025, 1, 1)},
        }[mutation]
        data = cells[index].model_dump()
        data.update(updates)
        cells[index] = Cell.model_validate(data)
    assert check in {issue.check_id for issue in validate(cells, source)}


def test_selection_and_replay(candidate: tuple[list[Cell], SourceInventory]) -> None:
    cells, _ = candidate
    newer = cells[0].model_copy(
        update={"id": "new", "published_on": date(2026, 6, 1), "amount": "1300"}
    )
    chosen = select_latest([*cells, newer])
    assert next(c for c in chosen if c.concept_id == "Revenue").amount == "1300"
    assert chosen == select_latest([newer, *reversed(cells)])
    assert logical_hash([c.model_dump(mode="json") for c in chosen]) == logical_hash(
        [c.model_dump(mode="json") for c in select_latest([newer, *reversed(cells)])]
    )
    conflict = cells[0].model_copy(update={"id": "conflict", "amount": "1"})
    with pytest.raises(ValueError, match="conflicting"):
        select_latest([*cells, conflict])
    with pytest.raises(ValueError, match="precedence"):
        select_latest([cells[0].model_copy(update={"published_on": None})])


def test_parentheses_ignore_decimal_context() -> None:
    raw = "1234567890123456789012345678901234567890.123456789"
    for precision in [6, 28, 80]:
        with localcontext() as context:
            context.prec = precision
            assert parse_amount(f"({raw})") == Decimal(f"-{raw}")


def test_repeated_source_labels_remain_distinct(
    candidate: tuple[list[Cell], SourceInventory],
) -> None:
    cells, source = candidate
    for index, row_id in enumerate(["operating-costs", "financing-costs"]):
        evidence = cells[index].evidence.model_copy(update={"row": row_id, "label": "Costs"})
        cells[index] = cells[index].model_copy(update={"raw_label": "Costs", "evidence": evidence})
        source.cells[index] = evidence
        source.rows[index] = row_id
    assert validate(cells, source) == []
    assert len(select_latest(cells)) == 3
