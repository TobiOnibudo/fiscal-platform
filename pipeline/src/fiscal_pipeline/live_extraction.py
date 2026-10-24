"""Explicit one-request pilot; cached replay never constructs an API client."""

import base64
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

from pydantic import Field

from fiscal_pipeline.domain import Cell, StrictModel, logical_hash
from fiscal_pipeline.extraction import (
    EXTRACTION_INSTRUCTIONS,
    PROMPT_VERSION,
    decode_recorded_response,
)


class ExtractionEnvelope(StrictModel):
    cells: list[Cell] = Field(min_length=1, max_length=20000)


def locate_pages(pdf: Path) -> list[dict[str, Any]]:
    import pdfplumber

    with pdfplumber.open(pdf) as document:
        if len(document.pages) > 1000:
            raise ValueError("PDF page limit exceeded")
        return [
            {"pdfPage": number, "text": page.extract_text() or ""}
            for number, page in enumerate(document.pages, 1)
        ]


STATEMENT_HEADINGS = {
    "income": [
        r"consolidated statement of (?:profit or loss|comprehensive income)",
        r"consolidated income statement",
    ],
    "balance": [
        r"consolidated statement of financial position",
        r"consolidated balance sheet",
    ],
    "cashflow": [
        r"consolidated statement of cash flows?",
        r"consolidated cash flow statement",
    ],
}


def locate_statement_pages(pdf: Path) -> dict[str, list[int]]:
    """Locate likely statement pages using headings plus table-density signals."""
    from pypdf import PdfReader

    reader = PdfReader(pdf)
    pages = [
        {"pdfPage": index, "text": page.extract_text() or ""}
        for index, page in enumerate(reader.pages, 1)
    ]
    result: dict[str, list[int]] = {}
    all_patterns = [pattern for patterns in STATEMENT_HEADINGS.values() for pattern in patterns]
    for statement, patterns in STATEMENT_HEADINGS.items():
        candidates: list[tuple[int, int]] = []
        for page in pages:
            text = str(page["text"])
            lowered = re.sub(r"\s+", " ", text.lower())
            matches = [match for pattern in patterns if (match := re.search(pattern, lowered))]
            if not matches:
                continue
            numeric_cells = len(re.findall(r"(?:\(?-?\d[\d,.]*\)?)", text))
            # A primary statement title is near the beginning of its page. Notes
            # often mention the same title much later in prose; position must
            # dominate table density so those references cannot win.
            first_heading = min(match.start() for match in matches)
            score = 1_000 - min(first_heading, 900) + min(numeric_cells, 80)
            if "contents" in lowered[:300]:
                score -= 800
            if sum(bool(re.search(pattern, lowered)) for pattern in all_patterns) > 1:
                score -= 900
            page_number = page["pdfPage"]
            if not isinstance(page_number, int):
                raise ValueError("invalid internal PDF page number")
            candidates.append((score, page_number))
        if candidates:
            start = max(candidates)[1]
            result[statement] = [start]
    # Some issuer PDFs render the balance-sheet page as outlines/images, so it
    # has no extractable heading text. Primary statements are conventionally
    # adjacent; only accept the unambiguous page immediately after income when
    # cash flow is two to five pages later. The chosen PDF page remains the
    # model input, so this fallback never manufactures statement content.
    if "balance" not in result and {"income", "cashflow"} <= result.keys():
        income_page = result["income"][0]
        cashflow_page = result["cashflow"][0]
        if 2 <= cashflow_page - income_page <= 5:
            result["balance"] = [income_page + 1]
    missing = set(STATEMENT_HEADINGS) - result.keys()
    if missing:
        raise ValueError(f"could not locate statements: {', '.join(sorted(missing))}")
    return result


def prepare_statement_groups(pdf: Path, output: Path) -> dict[str, Path]:
    """Create one-page primary-statement groups for model transcription.

    The locator deliberately selects the page carrying the statement heading. A
    continuation is added only by an explicit operator-supplied group; blindly
    including the following page can mix two different primary statements.
    """
    from pypdf import PdfReader, PdfWriter

    locations = locate_statement_pages(pdf)
    reader = PdfReader(pdf)
    output.mkdir(parents=True, exist_ok=True)
    groups: dict[str, Path] = {}
    for statement, pages in locations.items():
        start = pages[0]
        selected = [start]
        writer = PdfWriter()
        for page_number in selected:
            writer.add_page(reader.pages[page_number - 1])
        target = output / f"{statement}-pages-{'-'.join(map(str, selected))}.pdf"
        with target.open("wb") as stream:
            writer.write(stream)
        if not target.read_bytes().startswith(b"%PDF-") or target.stat().st_size > 20_000_000:
            raise ValueError(f"prepared {statement} page group violates extraction bounds")
        groups[statement] = target
    return groups


def prepare_page_group(pdf: Path, output: Path, statement: str, page: int) -> Path:
    """Create one explicitly selected bounded statement page group."""
    from pypdf import PdfReader, PdfWriter

    if statement not in STATEMENT_HEADINGS:
        raise ValueError("unknown statement type")
    reader = PdfReader(pdf)
    if not 1 <= page <= len(reader.pages):
        raise ValueError("page lies outside the source PDF")
    output.mkdir(parents=True, exist_ok=True)
    writer = PdfWriter()
    writer.add_page(reader.pages[page - 1])
    target = output / f"{statement}-pages-{page}.pdf"
    with target.open("wb") as stream:
        writer.write(stream)
    if not target.read_bytes().startswith(b"%PDF-") or target.stat().st_size > 20_000_000:
        raise ValueError("prepared statement page violates extraction bounds")
    return target


def extract_pilot(
    pdf: Path,
    archive: Path,
    model: str,
    *,
    offline: bool,
    allow_paid: bool,
    max_output_tokens: int = 12000,
    company_id: str | None = None,
    filing_id: str | None = None,
    expected_statement: str | None = None,
) -> list[Cell]:
    if not 1 <= max_output_tokens <= 64000:
        raise ValueError("output token bound must be between 1 and 64000")
    if not model.strip():
        raise ValueError("explicit evaluated model identifier required")
    content = pdf.read_bytes()
    if len(content) > 20_000_000 or not content.startswith(b"%PDF-"):
        raise ValueError("pilot requires a PDF page group no larger than 20 MB")
    source_hash = hashlib.sha256(content).hexdigest()
    if (company_id is None) != (filing_id is None):
        raise ValueError("company and filing identifiers must be supplied together")
    configuration = {
        "sourceHash": source_hash,
        "model": model,
        "promptVersion": PROMPT_VERSION,
        "schemaHash": logical_hash(ExtractionEnvelope.model_json_schema()),
        "maxOutputTokens": max_output_tokens,
        "companyId": company_id,
        "filingId": filing_id,
        "expectedStatement": expected_statement,
    }
    cache_key = logical_hash(configuration)
    directory = archive / "attempts" / cache_key
    response_path = directory / "decoded.json"
    if response_path.exists():
        return decode_recorded_response(response_path.read_text(encoding="utf-8"))
    if offline:
        raise ValueError("offline response cache miss; no API request was made")
    if not allow_paid:
        raise ValueError("fresh extraction requires explicit --allow-paid")
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY missing; no API request was made")
    pages = locate_pages(pdf)
    if not 1 <= len(pages) <= 6:
        raise ValueError("pilot must contain 1-6 reviewed statement pages, including continuations")
    from openai import OpenAI

    directory.mkdir(parents=True, exist_ok=True)
    (directory / "input.json").write_text(
        json.dumps(configuration, sort_keys=True), encoding="utf-8"
    )
    with OpenAI(max_retries=0, timeout=300) as client:
        response = client.responses.parse(
            model=model,
            store=False,
            max_output_tokens=max_output_tokens,
            instructions=EXTRACTION_INSTRUCTIONS,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_file",
                            "filename": pdf.name,
                            "file_data": "data:application/pdf;base64,"
                            + base64.b64encode(content).decode(),
                        },
                        {
                            "type": "input_text",
                            "text": "Transcribe this complete consolidated statement "
                            f"page group. Source SHA256: {source_hash}. "
                            + (
                                "Use company_id exactly "
                                f"{company_id!r} and filing_id exactly {filing_id!r}. "
                                if company_id and filing_id
                                else ""
                            )
                            + (
                                f"This is the {expected_statement!r} statement; set statement "
                                f"to {expected_statement!r} for every cell. "
                                if expected_statement
                                else ""
                            )
                            + "Source pages are one-based.",
                        },
                    ],
                }
            ],
            text_format=ExtractionEnvelope,
        )
    raw = response.model_dump_json(indent=2)
    raw_hash = hashlib.sha256(raw.encode()).hexdigest()
    # A fixed filename keeps the cache below the legacy Windows MAX_PATH limit;
    # the content hash is retained inside the decoded envelope.
    (directory / "raw-response.json").write_text(raw, encoding="utf-8")
    if response.status != "completed" or response.output_parsed is None:
        raise ValueError("incomplete, refused, or unparseable response preserved for review")
    record = {
        "status": "completed",
        "responseHash": raw_hash,
        "cells": [c.model_dump(mode="json") for c in response.output_parsed.cells],
    }
    response_path.write_text(json.dumps(record, sort_keys=True), encoding="utf-8")
    return decode_recorded_response(json.dumps(record))
