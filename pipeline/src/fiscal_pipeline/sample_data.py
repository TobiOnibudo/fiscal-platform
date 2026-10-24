"""Deterministic local-only sample data for a review-interface walkthrough.

These values are illustrative and intentionally have no source evidence. They
are never eligible for the verified publication workflow.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fiscal_pipeline.domain import logical_hash


def _decimal(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.1")), "f")


def _periods(company: str, statement: str) -> list[dict[str, str | None]]:
    month_day = "03-31" if company == "wise" else "12-31"
    return [
        {
            "id": str(year),
            "label": f"FY{year}",
            "start": None if statement == "balance" else f"{year - 1}-{month_day}",
            "end": f"{year}-{month_day}",
        }
        for year in range(2016, 2026)
    ]


def _rows(
    company: str,
    statement: str,
    currency: str,
    unit: str,
    definitions: list[tuple[str, str, Decimal, Decimal, str]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row_id, label, initial, annual_change, kind in definitions:
        cells: dict[str, dict[str, str | int]] = {}
        for offset, year in enumerate(range(2016, 2026)):
            value = _decimal(initial + annual_change * offset)
            cells[str(year)] = {
                "observationId": f"sample-{company}-{statement}-{row_id}-{year}",
                "value": value,
                "state": "reported",
                "filingId": f"sample-{company}-walkthrough",
                "rawLabel": label,
                "rawText": value,
                "pdfPage": 1,
                "printedPage": "Sample",
                "comparative": (
                    "restated"
                    if year == 2022 and row_id in {"revenue", "total-assets"}
                    else "original"
                ),
            }
        rows.append(
            {
                "id": row_id,
                "label": label,
                "aliases": [],
                "depth": 0,
                "kind": kind,
                "historical": False,
                "currency": currency,
                "unit": unit,
                "cells": cells,
            }
        )
    return rows


def sample_dataset(company: str) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """Return a fully shaped, explicitly non-verified ten-year UI sample."""
    configuration = {
        "wise": ("GBP", "GBP millions", Decimal("120"), Decimal("24")),
        "adyen": ("EUR", "EUR millions", Decimal("180"), Decimal("31")),
    }
    if company not in configuration:
        raise ValueError("sample data is available only for Wise and Adyen")
    currency, unit, revenue_start, revenue_change = configuration[company]
    scale = Decimal("1") if company == "wise" else Decimal("1.25")
    income = [
        ("revenue", "Revenue", revenue_start, revenue_change, "item"),
        (
            "cost-of-sales",
            "Cost of sales",
            -revenue_start * Decimal("0.34"),
            -revenue_change * Decimal("0.31"),
            "item",
        ),
        (
            "gross-profit",
            "Gross profit",
            revenue_start * Decimal("0.66"),
            revenue_change * Decimal("0.69"),
            "subtotal",
        ),
        (
            "operating-expenses",
            "Operating expenses",
            -revenue_start * Decimal("0.47"),
            -revenue_change * Decimal("0.42"),
            "item",
        ),
        (
            "operating-profit",
            "Operating profit",
            revenue_start * Decimal("0.19"),
            revenue_change * Decimal("0.27"),
            "subtotal",
        ),
        (
            "finance-income",
            "Finance income",
            Decimal("1.5") * scale,
            Decimal("0.5") * scale,
            "item",
        ),
        (
            "finance-costs",
            "Finance costs",
            Decimal("-2.0") * scale,
            Decimal("-0.3") * scale,
            "item",
        ),
        (
            "profit-before-tax",
            "Profit before tax",
            revenue_start * Decimal("0.18"),
            revenue_change * Decimal("0.27"),
            "subtotal",
        ),
        (
            "income-tax",
            "Income tax expense",
            -revenue_start * Decimal("0.04"),
            -revenue_change * Decimal("0.06"),
            "item",
        ),
        (
            "profit-for-year",
            "Profit for the year",
            revenue_start * Decimal("0.14"),
            revenue_change * Decimal("0.21"),
            "subtotal",
        ),
    ]
    balance = [
        (
            "cash",
            "Cash and cash equivalents",
            revenue_start * Decimal("0.48"),
            revenue_change * Decimal("0.82"),
            "item",
        ),
        (
            "receivables",
            "Trade and other receivables",
            revenue_start * Decimal("0.20"),
            revenue_change * Decimal("0.28"),
            "item",
        ),
        (
            "total-assets",
            "Total assets",
            revenue_start * Decimal("0.92"),
            revenue_change * Decimal("1.28"),
            "subtotal",
        ),
        (
            "payables",
            "Trade and other payables",
            -revenue_start * Decimal("0.22"),
            -revenue_change * Decimal("0.30"),
            "item",
        ),
        (
            "total-liabilities",
            "Total liabilities",
            -revenue_start * Decimal("0.45"),
            -revenue_change * Decimal("0.58"),
            "subtotal",
        ),
        (
            "total-equity",
            "Total equity",
            revenue_start * Decimal("0.47"),
            revenue_change * Decimal("0.70"),
            "subtotal",
        ),
    ]
    cashflow = [
        (
            "profit-before-tax",
            "Profit before tax",
            revenue_start * Decimal("0.18"),
            revenue_change * Decimal("0.27"),
            "item",
        ),
        (
            "depreciation",
            "Depreciation and amortisation",
            revenue_start * Decimal("0.03"),
            revenue_change * Decimal("0.05"),
            "item",
        ),
        (
            "cash-from-operations",
            "Cash generated from operations",
            revenue_start * Decimal("0.24"),
            revenue_change * Decimal("0.36"),
            "subtotal",
        ),
        (
            "net-operating",
            "Net cash from operating activities",
            revenue_start * Decimal("0.22"),
            revenue_change * Decimal("0.34"),
            "subtotal",
        ),
        (
            "net-investing",
            "Net cash used in investing activities",
            -revenue_start * Decimal("0.08"),
            -revenue_change * Decimal("0.10"),
            "item",
        ),
        (
            "net-financing",
            "Net cash from financing activities",
            -revenue_start * Decimal("0.02"),
            revenue_change * Decimal("0.02"),
            "item",
        ),
        (
            "net-increase",
            "Net increase in cash and cash equivalents",
            revenue_start * Decimal("0.12"),
            revenue_change * Decimal("0.22"),
            "subtotal",
        ),
        (
            "closing-cash",
            "Cash and cash equivalents at year end",
            revenue_start * Decimal("0.48"),
            revenue_change * Decimal("0.82"),
            "subtotal",
        ),
    ]
    definitions = [
        ("income", "Income statement", income),
        ("balance", "Balance sheet", balance),
        ("cashflow", "Cash flow statement", cashflow),
    ]
    payload = {
        "schemaVersion": "1",
        "companyId": company,
        "kind": "sample",
        "statements": [
            {
                "id": statement_id,
                "title": f"Illustrative {title}",
                "scope": "consolidated",
                "basis": "Illustrative",
                "currency": currency,
                "unit": unit,
                "periods": _periods(company, statement_id),
                "rows": _rows(company, statement_id, currency, unit, rows),
            }
            for statement_id, title, rows in definitions
        ],
        "coverage": {
            "expectedPeriods": 10,
            "verifiedPeriods": 0,
            "gaps": ["Illustrative local sample; no source review has been performed."],
        },
    }
    return logical_hash(payload), payload, {"mode": "sample", "reviewed": False, "issues": []}
