"""Public API v1 payload. Keep aligned with apps/web/src/lib/contracts.ts."""

import re
from datetime import date
from typing import Literal

from pydantic import Field, model_validator

from fiscal_pipeline.domain import StrictModel


class PublicCell(StrictModel):
    value: str | None
    state: Literal["reported", "not_reported", "unreadable"]
    observationId: str
    filingId: str
    rawLabel: str
    rawText: str
    pdfPage: int = Field(ge=1)
    printedPage: str
    comparative: Literal["original", "updated", "restated"]

    @model_validator(mode="after")
    def amount_state(self) -> "PublicCell":
        if (self.state == "reported") != (self.value is not None):
            raise ValueError("reported state requires amount; missing state forbids amount")
        if self.value is not None and not re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?", self.value):
            raise ValueError("invalid exact decimal")
        return self


class PublicPeriod(StrictModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    start: date | None
    end: date


class PublicRow(StrictModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    unit: str = Field(min_length=1)
    aliases: list[str]
    depth: int = Field(ge=0, le=10)
    kind: Literal["item", "subtotal", "section"]
    historical: bool
    cells: dict[str, PublicCell]


class PublicStatement(StrictModel):
    id: Literal["income", "balance", "cashflow"]
    title: str = Field(min_length=1)
    scope: Literal["consolidated"]
    basis: str = Field(min_length=1)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    unit: str = Field(min_length=1)
    periods: list[PublicPeriod] = Field(max_length=50)
    rows: list[PublicRow] = Field(max_length=5000)

    @model_validator(mode="after")
    def identities(self) -> "PublicStatement":
        periods = {p.id for p in self.periods}
        if len(periods) != len(self.periods) or len({r.id for r in self.rows}) != len(self.rows):
            raise ValueError("duplicate row or period identity")
        for row in self.rows:
            if not set(row.cells).issubset(periods):
                raise ValueError("cell references unknown period")
        for period in self.periods:
            if (self.id == "balance") != (period.start is None):
                raise ValueError("instant/duration mismatch")
            if period.start and period.start > period.end:
                raise ValueError("period bounds invalid")
        return self


class PublicCoverage(StrictModel):
    expectedPeriods: int = Field(ge=0)
    verifiedPeriods: int = Field(ge=0)
    gaps: list[str]


class PublicDataset(StrictModel):
    schemaVersion: Literal["1"]
    companyId: str = Field(min_length=1)
    kind: Literal["sample", "verified"]
    statements: list[PublicStatement]
    coverage: PublicCoverage

    @model_validator(mode="after")
    def coverage_and_identity(self) -> "PublicDataset":
        if len({s.id for s in self.statements}) != len(self.statements):
            raise ValueError("duplicate statements")
        if self.coverage.verifiedPeriods > self.coverage.expectedPeriods:
            raise ValueError("verified coverage exceeds expected")
        return self
