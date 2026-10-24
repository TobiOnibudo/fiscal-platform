"""Explicit operator commands. Setup, replay and validation never call a model."""

import json
import os
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import typer
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from fiscal_pipeline import sources
from fiscal_pipeline.domain import Cell, SourceInventory, logical_hash, select_latest, validate
from fiscal_pipeline.models import Company, CompanyPublication, Dataset, Filing
from fiscal_pipeline.repository import publish as publish_dataset
from fiscal_pipeline.repository import record_extraction
from fiscal_pipeline.repository import record_filing as persist_filing
from fiscal_pipeline.repository import seed_companies as seed
from fiscal_pipeline.sample_data import sample_dataset
from fiscal_pipeline.storage import R2Config, create_client, store_pdf

app = typer.Typer(no_args_is_help=True, pretty_exceptions_show_locals=False)
PUBLISHED_ON_OPTION = typer.Option(None, "--published-on")


@app.command()
def locate(pdf: Path) -> None:
    """Extract local one-based page text for operator statement-boundary review."""
    from fiscal_pipeline.live_extraction import locate_pages

    typer.echo(json.dumps(locate_pages(pdf), indent=2))


@app.command()
def extract(
    pdf: Path,
    model: str,
    offline: bool = False,
    allow_paid: bool = False,
    max_output_tokens: int = typer.Option(12000, min=1, max=16000),
) -> None:
    """One bounded optional model pilot; all returned cells remain unapproved."""
    from fiscal_pipeline.live_extraction import extract_pilot

    load_dotenv()
    cells = extract_pilot(
        pdf,
        Path(os.getenv("ARCHIVE_DIR", "archive")),
        model,
        offline=offline,
        allow_paid=allow_paid,
        max_output_tokens=max_output_tokens,
    )
    typer.echo(json.dumps([c.model_dump(mode="json") for c in cells], indent=2))


@app.command("ingest-extraction")
def ingest_extraction(
    company: str,
    filing_id: str,
    pdf: Path,
    model: str,
    offline: bool = False,
    allow_paid: bool = False,
    max_output_tokens: int = typer.Option(12000, min=1, max=16000),
) -> None:
    """Extract one reviewed page group and persist it as a review-only candidate."""
    from hashlib import sha256

    from fiscal_pipeline.live_extraction import extract_pilot

    load_dotenv()
    content = pdf.read_bytes()
    source_hash = sha256(content).hexdigest()
    cells = extract_pilot(
        pdf,
        Path(os.getenv("ARCHIVE_DIR", "archive")),
        model,
        offline=offline,
        allow_paid=allow_paid,
        max_output_tokens=max_output_tokens,
        company_id=company,
        filing_id=filing_id,
    )
    with Session(create_engine(database_url())) as session, session.begin():
        attempt = record_extraction(
            session,
            company_id=company,
            filing_id=filing_id,
            source_hash=source_hash,
            model=model,
            cells=cells,
        )
    typer.echo(json.dumps({"attemptId": attempt.id, "status": attempt.status, "cells": len(cells)}))


def company_config(company: str) -> tuple[str, list[str]]:
    with Session(create_engine(database_url())) as session:
        configured = session.get(Company, company)
        if configured is None:
            raise typer.BadParameter("unknown company; seed or add-company first")
        config = configured.config
        return str(config["entryPoints"][0]), list(config["approvedDomains"])


@app.command()
def add_company(
    company: str,
    name: str,
    entry_url: str,
    approved_domains: str,
    fiscal_month: int = typer.Option(..., min=1, max=12),
) -> None:
    """Register a company and an explicit comma-separated publisher host allowlist."""
    domains = sorted(set(d.strip().lower() for d in approved_domains.split(",")))
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,60}", company) or not name.strip():
        raise typer.BadParameter("company requires stable lowercase ID and nonempty legal name")
    if any(not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", domain) for domain in domains):
        raise typer.BadParameter("approved domains must be exact public DNS host names")
    parsed = urlsplit(entry_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in domains
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 443}
    ):
        raise typer.BadParameter("entry URL must use HTTPS on an approved publisher host")
    with Session(create_engine(database_url())) as session, session.begin():
        if session.get(Company, company) is not None:
            raise typer.BadParameter("company already exists; configuration is not overwritten")
        session.add(
            Company(
                id=company,
                name=name.strip(),
                fiscal_year_end_month=fiscal_month,
                config={"entryPoints": [entry_url], "approvedDomains": domains},
            )
        )
        session.flush()
        session.add(CompanyPublication(company_id=company, dataset_id=None, generation=0))
    typer.echo(f"Registered {company}; no source data has been extracted or verified.")


@app.command()
def discover(company: str) -> None:
    """Discover links on one official index; not a claim of exhaustive coverage."""
    entry, domains = company_config(company)
    typer.echo(
        json.dumps(
            {"company": company, "status": "discovered", "links": sources.discover(entry, domains)},
            indent=2,
        )
    )


@app.command()
def download(
    company: str,
    url: str,
    store_r2: bool = typer.Option(False, "--store-r2"),
    record_filing: bool = typer.Option(False, "--record-filing"),
    title: str | None = typer.Option(None, "--title"),
    classification: str = typer.Option("unreviewed", "--classification"),
    published_on: str | None = PUBLISHED_ON_OPTION,
) -> None:
    """Archive one official PDF; R2/database writes require explicit operator flags."""
    if record_filing and not store_r2:
        raise typer.BadParameter("--record-filing requires --store-r2")
    if record_filing and not title:
        raise typer.BadParameter("--record-filing requires --title")
    try:
        publication_date = date.fromisoformat(published_on) if published_on else None
    except ValueError as exc:
        raise typer.BadParameter("--published-on must use YYYY-MM-DD") from exc
    _, domains = company_config(company)
    archive = Path(os.getenv("ARCHIVE_DIR", "archive"))
    result: dict[str, Any] = sources.download(url, domains, archive)
    stored = None
    if store_r2:
        config = R2Config.from_environment()
        stored = store_pdf(
            create_client(config),
            config,
            company,
            Path(str(result["path"])).read_bytes(),
            str(result["sha256"]),
        )
        result["storage"] = {
            "provider": "cloudflare-r2",
            "bucket": config.bucket,
            "key": stored.key,
            "sha256": stored.sha256,
            "size": stored.size,
            "created": stored.created,
        }
    if record_filing and stored is not None and title is not None:
        with Session(create_engine(database_url())) as session, session.begin():
            filing = persist_filing(
                session,
                company_id=company,
                title=title,
                source_url=str(result["sourceUrl"]),
                sha256=str(result["sha256"]),
                classification=classification,
                published_on=publication_date,
                storage_metadata=dict(result["storage"]),
            )
            result["filingId"] = filing.id
    typer.echo(json.dumps(result, indent=2))


def database_url() -> str:
    load_dotenv()
    if os.getenv("INGEST_ENV", "local") != "local":
        raise typer.BadParameter("CLI mutations are local-only in this milestone")
    return os.environ["INGEST_DATABASE_URL"]


@app.command()
def seed_companies() -> None:
    """Idempotently add Wise and Adyen configuration; no financial values."""
    with Session(create_engine(database_url())) as session, session.begin():
        seed(session)
    typer.echo("Company configuration seeded; no data has been verified.")


@app.command()
def seed_sample() -> None:
    """Install local-only illustrative data for a UI walkthrough, never source data."""
    with Session(create_engine(database_url())) as session, session.begin():
        seed(session)
        for company in ["wise", "adyen"]:
            dataset_id, payload, validation = sample_dataset(company)
            if session.get(Dataset, dataset_id) is None:
                session.add(
                    Dataset(
                        id=dataset_id,
                        company_id=company,
                        status="published",
                        payload=payload,
                        validation=validation,
                    )
                )
            filing_id = f"sample-{company}-walkthrough"
            if session.get(Filing, filing_id) is None:
                session.add(
                    Filing(
                        id=filing_id,
                        company_id=company,
                        title="Demo dataset",
                        source_url="",
                        sha256="sample",
                        classification="sample",
                        published_on=None,
                        metadata_json={"mode": "sample"},
                    )
                )
            pointer = session.get(CompanyPublication, company)
            if pointer is None:
                session.add(
                    CompanyPublication(company_id=company, dataset_id=dataset_id, generation=1)
                )
            elif pointer.dataset_id != dataset_id:
                pointer.dataset_id = dataset_id
                pointer.generation += 1
        pilot_filing = session.get(Filing, "wise-2020-annual-report")
        if pilot_filing is None:
            session.add(
                Filing(
                    id="wise-2020-annual-report",
                    company_id="wise",
                    title="Wise annual report 2020",
                    source_url="https://wise.com/imaginary-v2/202fc0ec8b6991c74cb298a6c7b9276c.pdf",
                    sha256="d0c5a2c85d78bb64342224f9f3de7d91f68825cef3cf31427c83132e1e031c16",
                    classification="annual_report",
                    published_on=None,
                    metadata_json={"status": "unreviewed", "source": "local_pilot"},
                )
            )
    typer.echo("Illustrative local sample installed for Wise and Adyen; no values are verified.")


@app.command("validate")
def validate_file(candidate: Path, inventory: Path) -> None:
    """Check a frozen candidate against independently reviewed source inventory."""
    cells = [Cell.model_validate_json(json.dumps(c)) for c in json.loads(candidate.read_text())]
    source = SourceInventory.model_validate_json(inventory.read_text())
    issues = validate(cells, source)
    typer.echo(json.dumps([i.model_dump() for i in issues], indent=2))
    raise typer.Exit(code=1 if issues else 0)


@app.command()
def replay(manifest: Path, offline: bool = typer.Option(False)) -> None:
    """Hash-check recorded input artifacts then replay selection without network access."""
    if not offline:
        raise typer.BadParameter("replay requires --offline; fresh extraction is separate")
    record = json.loads(manifest.read_text())
    for artifact in record["artifacts"]:
        import hashlib

        path = (manifest.parent / artifact["path"]).resolve()
        if not path.is_relative_to(manifest.parent.resolve()):
            raise typer.BadParameter("artifact path escapes manifest directory")
        if hashlib.sha256(path.read_bytes()).hexdigest() != artifact["sha256"]:
            raise typer.BadParameter("artifact hash mismatch")
    cells = [Cell.model_validate_json(json.dumps(c)) for c in record["cells"]]
    selected = [c.model_dump(mode="json") for c in select_latest(cells)]
    actual = logical_hash(selected)
    if actual != record["expectedHash"]:
        raise typer.BadParameter("logical replay hash differs")
    typer.echo(actual)


@app.command()
def publish(dataset_id: str, expected_generation: int) -> None:
    """Activate an approved local dataset with optimistic publication generation."""
    with Session(create_engine(database_url())) as session, session.begin():
        generation = publish_dataset(session, dataset_id, expected_generation)
    typer.echo(f"Published generation {generation}")


@app.command()
def restore_demo() -> None:
    """No source-reviewed snapshot exists yet; fail instead of creating invented data."""
    typer.echo("No verified demo snapshot available. Seed companies; coverage work remains.")
    raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
