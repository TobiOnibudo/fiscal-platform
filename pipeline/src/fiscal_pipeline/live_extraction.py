"""Explicit one-request pilot; cached replay never constructs an API client."""

import base64
import hashlib
import json
import os
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
) -> list[Cell]:
    if not 1 <= max_output_tokens <= 16000:
        raise ValueError("output token bound must be between 1 and 16000")
    if not model.strip():
        raise ValueError("explicit evaluated model identifier required")
    content = pdf.read_bytes()
    if len(content) > 5_000_000 or not content.startswith(b"%PDF-"):
        raise ValueError("pilot requires a PDF page group no larger than 5 MB")
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
    with OpenAI(max_retries=0, timeout=120) as client:
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
                            + "Source pages are one-based.",
                        },
                    ],
                }
            ],
            text_format=ExtractionEnvelope,
        )
    raw = response.model_dump_json(indent=2)
    raw_hash = hashlib.sha256(raw.encode()).hexdigest()
    (directory / f"{raw_hash}.response.json").write_text(raw, encoding="utf-8")
    if response.status != "completed" or response.output_parsed is None:
        raise ValueError("incomplete, refused, or unparseable response preserved for review")
    record = {
        "status": "completed",
        "cells": [c.model_dump(mode="json") for c in response.output_parsed.cells],
    }
    response_path.write_text(json.dumps(record, sort_keys=True), encoding="utf-8")
    return decode_recorded_response(json.dumps(record))
