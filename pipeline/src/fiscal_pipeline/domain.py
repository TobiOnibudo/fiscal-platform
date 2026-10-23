"""Strict recorded inputs and deterministic financial transformations."""

import hashlib
import json
import re
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

RULE_VERSION = "1"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Evidence(StrictModel):
    source_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    page: int = Field(ge=1)
    row: str
    label: str
    column: str
    raw_text: str
    unit: str
    reviewed: bool = False
    printed_page: str = ""
    comparative: Literal["original", "updated", "restated"] = "original"


class Cell(StrictModel):
    id: str
    company_id: str
    filing_id: str
    concept_id: str
    statement: Literal["income", "balance", "cashflow"]
    period_start: date | None
    period_end: date
    published_on: date | None
    raw_label: str
    raw_text: str
    value_state: Literal["reported", "not_reported", "unreadable"]
    amount: str | None
    unit: str
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    scope: Literal["consolidated", "parent"]
    basis: str
    mapping_reviewed: bool = False
    evidence: Evidence

    @model_validator(mode="after")
    def numeric_state(self) -> "Cell":
        if self.value_state == "reported":
            if self.amount is None or not re.fullmatch(r"-?\d+(?:\.\d+)?", self.amount):
                raise ValueError("reported values require a finite decimal string")
        elif self.amount is not None:
            raise ValueError("missing values cannot contain an amount")
        if self.period_start and self.period_start > self.period_end:
            raise ValueError("period start follows period end")
        return self


class SourceInventory(StrictModel):
    """Independent reviewed layout inventory, never derived from candidate rows."""

    company_id: str
    source_hash: str
    statement: Literal["income", "balance", "cashflow"]
    scope: Literal["consolidated", "parent"]
    basis: str
    rows: list[str]
    columns: list[str]
    period_starts: dict[str, date | None]
    currency: str
    decimal_separator: Literal[".", ","] = "."
    pages: list[int]
    cells: list[Evidence]
    boundaries_reviewed: bool


class Issue(StrictModel):
    check_id: str
    cell_id: str | None = None
    detail: str
    severity: Literal["error", "review"] = "error"


def parse_amount(raw: str, *, decimal_separator: str = ".") -> Decimal | None:
    """Explicit locale; blank/dashes are missing, never zero. Reject footnote ambiguity."""
    value = raw.strip().replace("−", "-")
    if value in {"", "—", "–", "-"}:
        return None
    if decimal_separator not in {".", ","}:
        raise ValueError("unsupported decimal separator")
    thousands = "," if decimal_separator == "." else "."
    negative = value.startswith("(") and value.endswith(")")
    if negative:
        value = value[1:-1]
    grammar = rf"-?(?:\d+|\d{{1,3}}(?:{re.escape(thousands)}\d{{3}})+)"
    grammar += rf"(?:{re.escape(decimal_separator)}\d+)?"
    if not re.fullmatch(grammar, value) or (negative and value.startswith("-")):
        raise ValueError(f"ambiguous financial number: {raw!r}")
    result = Decimal(value.replace(thousands, "").replace(decimal_separator, "."))
    return result.copy_negate() if negative else result


def validate(cells: list[Cell], source: SourceInventory) -> list[Issue]:
    issues: list[Issue] = []

    def add(check: str, detail: str, cell: Cell | None = None) -> None:
        issues.append(Issue(check_id=check, detail=detail, cell_id=cell.id if cell else None))

    expected = {(e.row, e.column): e for e in source.cells}
    actual = [(c.evidence.row, c.evidence.column) for c in cells]
    required = {(row, column) for row in source.rows for column in source.columns}
    if set(expected) != required or len(expected) != len(source.cells):
        add("source_inventory", "Independent inventory lacks unique full row/column coverage")
    if set(actual) != required or len(actual) != len(set(actual)):
        add("completeness", "Candidate must include every source row and annual column once")
    if not source.boundaries_reviewed:
        add("continuation_review", "Statement boundaries require independent review")
    for cell in cells:
        evidence = expected.get((cell.evidence.row, cell.evidence.column))
        if (cell.company_id, cell.statement, cell.scope, cell.basis) != (
            source.company_id,
            source.statement,
            source.scope,
            source.basis,
        ) or cell.scope != "consolidated":
            add("identity", "Issuer, statement, consolidated scope and basis must match", cell)
        if cell.evidence.source_hash != source.source_hash:
            add("source_hash", "Cell references a different source artifact", cell)
        if cell.currency != source.currency:
            add("currency", "Currency differs from independently reviewed source", cell)
        if cell.period_start != source.period_starts.get(cell.evidence.column):
            add("duration", "Period start differs from independently reviewed header", cell)
        if cell.statement == "balance" and cell.period_start is not None:
            add("duration", "Balance sheet must use an instant", cell)
        if cell.statement != "balance" and (
            cell.period_start is None
            or not 350 <= (cell.period_end - cell.period_start).days <= 380
        ):
            add("duration", "Income and cash flow must use annual duration", cell)
        if evidence is None or cell.evidence != evidence:
            add("source_cell", "Evidence must match independently reviewed row/column", cell)
        if (
            cell.raw_label != cell.evidence.label
            or cell.evidence.column != cell.period_end.isoformat()
        ):
            add("period_alignment", "Label and actual annual period must match source", cell)
        if cell.evidence.page not in source.pages:
            add("source_page", "Page lies outside reviewed statement boundaries", cell)
        if cell.raw_text != cell.evidence.raw_text or cell.unit != cell.evidence.unit:
            add("source_semantics", "Reported text and row-specific unit must match source", cell)
        try:
            amount = parse_amount(cell.raw_text, decimal_separator=source.decimal_separator)
            if amount != (Decimal(cell.amount) if cell.amount is not None else None):
                add("numeric_value", "Parsed source amount differs from candidate", cell)
            if (amount is None) != (cell.value_state != "reported"):
                add("value_state", "Missing source value and reported state disagree", cell)
        except ValueError as exc:
            add("numeric_syntax", str(exc), cell)
        if not cell.mapping_reviewed:
            add("mapping_review", "Concept association requires source-context review", cell)
        if not cell.evidence.reviewed:
            add("cell_review", "Every initial displayed cell requires source review", cell)
    return sorted(issues, key=lambda i: (i.check_id, i.cell_id or "", i.detail))


def select_latest(cells: list[Cell]) -> list[Cell]:
    groups: dict[tuple[object, ...], list[Cell]] = {}
    for cell in cells:
        key = (cell.company_id, cell.concept_id, cell.statement, cell.period_start, cell.period_end)
        groups.setdefault(key, []).append(cell)
    selected: list[Cell] = []
    for group in groups.values():
        if len({(c.scope, c.basis, c.currency, c.unit) for c in group}) != 1:
            raise ValueError("unresolved compatibility")
        if any(c.published_on is None for c in group):
            raise ValueError("unresolved publication precedence")
        latest = max(c.published_on for c in group if c.published_on is not None)
        winners = [c for c in group if c.published_on == latest]
        if len({(c.amount, c.value_state) for c in winners}) > 1:
            raise ValueError("conflicting observations with tied publication dates")
        selected.append(min(winners, key=lambda c: c.id))
    return sorted(selected, key=lambda c: (c.statement, c.concept_id, c.period_end, c.id))


def logical_hash(payload: object) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()
