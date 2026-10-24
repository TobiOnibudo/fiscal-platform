"""Explicit operator commands. Setup, replay and validation never call a model."""

import json
import os
import re
from datetime import date, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import typer
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from fiscal_pipeline import sources
from fiscal_pipeline.domain import (
    Cell,
    SourceInventory,
    logical_hash,
    select_latest,
    validate,
)
from fiscal_pipeline.models import Company, CompanyPublication, Dataset, Filing
from fiscal_pipeline.repository import (
    materialize_automated_dataset,
    record_extraction,
    validate_automated_attempts,
)
from fiscal_pipeline.repository import publish as publish_dataset
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


@app.command("prepare-statements")
def prepare_statements(pdf: Path, output: Path) -> None:
    """Locate and create bounded statement page groups for extraction."""
    from fiscal_pipeline.live_extraction import prepare_statement_groups

    groups = prepare_statement_groups(pdf, output)
    typer.echo(json.dumps({name: str(path) for name, path in groups.items()}, indent=2))


@app.command("prepare-page")
def prepare_page(pdf: Path, output: Path, statement: str, page: int) -> None:
    """Create a bounded group from an explicitly verified source page."""
    from fiscal_pipeline.live_extraction import prepare_page_group

    target = prepare_page_group(pdf, output, statement, page)
    typer.echo(json.dumps({"statement": statement, "page": page, "path": str(target)}))


@app.command()
def extract(
    pdf: Path,
    model: str,
    offline: bool = False,
    allow_paid: bool = False,
    max_output_tokens: int = typer.Option(32000, min=1, max=64000),
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
    max_output_tokens: int = typer.Option(32000, min=1, max=64000),
    page_offset: int = typer.Option(0, min=0),
) -> None:
    """Extract, validate, and persist one bounded statement page group."""
    from hashlib import sha256

    from fiscal_pipeline.live_extraction import extract_pilot

    load_dotenv()
    content = pdf.read_bytes()
    source_hash = sha256(content).hexdigest()
    expected_statement = pdf.name.split("-pages-", 1)[0]
    if expected_statement not in {"income", "balance", "cashflow"}:
        raise typer.BadParameter(
            "statement group filename must start with income-, balance-, or cashflow-"
        )
    extracted = extract_pilot(
        pdf,
        Path(os.getenv("ARCHIVE_DIR", "archive")),
        model,
        offline=offline,
        allow_paid=allow_paid,
        max_output_tokens=max_output_tokens,
        company_id=company,
        filing_id=filing_id,
        expected_statement=expected_statement,
    )
    extracted = [cell for cell in extracted if cell.raw_label.strip()]
    if not extracted:
        raise typer.BadParameter("model output contains no labeled statement rows")
    binding_hash = logical_hash(
        [cell.model_dump(mode="json", exclude={"id"}) for cell in extracted]
    )
    cells = []
    periods = sorted({cell.period_end for cell in extracted}, reverse=True)
    by_period = {
        period: [cell for cell in extracted if cell.period_end == period] for period in periods
    }
    if not periods or any(not period_cells for period_cells in by_period.values()):
        raise typer.BadParameter("model output contains an empty annual column")
    indexed: dict[date, dict[tuple[str, int], Cell]] = {}
    ordered_keys: list[tuple[str, int]] = []
    for period in periods:
        occurrences: dict[str, int] = {}
        indexed[period] = {}
        for cell in by_period[period]:
            base = re.sub(r"[^a-z0-9]+", "-", cell.raw_label.lower()).strip("-")
            occurrences[base] = occurrences.get(base, 0) + 1
            key = (base, occurrences[base])
            indexed[period][key] = cell
            if key not in ordered_keys:
                ordered_keys.append(key)
    normalized: list[tuple[int, str, Cell]] = []
    for row_index, (base, occurrence) in enumerate(ordered_keys):
        concept_id = base if occurrence == 1 else f"{base}-{occurrence}"
        for period in periods:
            candidate = indexed[period].get((base, occurrence))
            if candidate is not None:
                normalized.append((row_index, concept_id, candidate))
    latest_period = periods[0]
    for index, (row_index, concept_id, cell) in enumerate(normalized):
        if cell.statement == "balance":
            period_start = None
        else:
            previous_end = cell.period_end.replace(year=cell.period_end.year - 1)
            period_start = previous_end + timedelta(days=1)
        identity = sha256(
            f"{filing_id}:{source_hash}:{model}:{binding_hash}:{expected_statement}:{concept_id}:"
            f"{cell.period_end}:{index}".encode()
        ).hexdigest()
        cells.append(
            cell.model_copy(
                update={
                    "id": identity,
                    "company_id": company,
                    "filing_id": filing_id,
                    "concept_id": concept_id,
                    "period_start": period_start,
                    "evidence": cell.evidence.model_copy(
                        update={
                            "page": cell.evidence.page + page_offset,
                            "row": f"r{row_index + 1:04d}",
                            "column": cell.period_end.isoformat(),
                            "comparative": (
                                "updated"
                                if cell.period_end < latest_period
                                and cell.evidence.comparative == "original"
                                else cell.evidence.comparative
                            ),
                        }
                    ),
                }
            )
        )
    with Session(create_engine(database_url())) as session, session.begin():
        attempt = record_extraction(
            session,
            company_id=company,
            filing_id=filing_id,
            source_hash=source_hash,
            model=model,
            cells=cells,
            expected_statement=expected_statement,
        )
        attempt_id = attempt.id
        dataset = materialize_automated_dataset(session, company)
        dataset_id = dataset.id
    typer.echo(
        json.dumps(
            {
                "attemptId": attempt_id,
                "datasetId": dataset_id,
                "status": "published",
                "cells": len(cells),
            }
        )
    )


@app.command("ingest-recorded")
def ingest_recorded(
    company: str,
    filing_id: str,
    response: Path,
    source_pdf: Path,
    page_offset: int = typer.Option(0, min=0),
    model: str = typer.Option("recorded", "--model"),
) -> None:
    """Import a cached typed response, binding identity and pages deterministically."""
    from fiscal_pipeline.extraction import decode_recorded_response

    load_dotenv()
    source_hash = sha256(source_pdf.read_bytes()).hexdigest()
    decoded = decode_recorded_response(response.read_text(encoding="utf-8"))
    cells = []
    for index, cell in enumerate(decoded):
        start = cell.period_start
        if start is None and cell.statement != "balance":
            prior_end = cell.period_end.replace(year=cell.period_end.year - 1)
            start = prior_end + timedelta(days=1)
        evidence = cell.evidence.model_copy(
            update={"source_hash": source_hash, "page": cell.evidence.page + page_offset}
        )
        identity = sha256(
            f"{filing_id}:{cell.statement}:{cell.concept_id}:{cell.period_end}:{index}".encode()
        ).hexdigest()
        cells.append(
            cell.model_copy(
                update={
                    "id": identity,
                    "company_id": company,
                    "filing_id": filing_id,
                    "period_start": start,
                    "evidence": evidence,
                }
            )
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
        attempt_id = attempt.id
        dataset = materialize_automated_dataset(session, company)
        dataset_id = dataset.id
    typer.echo(
        json.dumps(
            {
                "attemptId": attempt_id,
                "datasetId": dataset_id,
                "status": "published",
                "cells": len(cells),
            }
        )
    )


@app.command("materialize")
def materialize(company: str) -> None:
    """Publish the current deterministic read model from extracted observations."""
    with Session(create_engine(database_url())) as session, session.begin():
        dataset = materialize_automated_dataset(session, company)
        dataset_id = dataset.id
    typer.echo(json.dumps({"company": company, "datasetId": dataset_id, "status": "published"}))


@app.command("validate-attempts")
def validate_attempts(company: str) -> None:
    """Apply deterministic usability checks and quarantine invalid attempts."""
    with Session(create_engine(database_url())) as session, session.begin():
        result = validate_automated_attempts(session, company)
    typer.echo(json.dumps({"company": company, **result}))


@app.command("set-report-year")
def set_report_year(company: str, filing_id: str, report_year: int) -> None:
    """Attach deterministic report-year precedence to an archived filing."""
    if not 1900 <= report_year <= 2200:
        raise typer.BadParameter("report year must be between 1900 and 2200")
    with Session(create_engine(database_url())) as session, session.begin():
        filing = session.get(Filing, filing_id)
        if filing is None or filing.company_id != company:
            raise typer.BadParameter("filing does not belong to the selected company")
        metadata = dict(filing.metadata_json)
        metadata["reportYear"] = report_year
        filing.metadata_json = metadata
    typer.echo(json.dumps({"company": company, "filingId": filing_id, "reportYear": report_year}))


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
def discover(company: str, entry_url: str | None = typer.Option(None, "--entry-url")) -> None:
    """Discover links on one official index; not a claim of exhaustive coverage."""
    entry, domains = company_config(company)
    if entry_url is not None:
        parsed = urlsplit(entry_url)
        if parsed.scheme != "https" or parsed.hostname not in domains:
            raise typer.BadParameter("entry URL must use an approved publisher host")
        entry = entry_url
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
    report_year: int | None = typer.Option(None, "--report-year", min=1900, max=2200),
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
                report_year=report_year,
            )
            result["filingId"] = filing.id
    typer.echo(json.dumps(result, indent=2))


@app.command("archive-local")
def archive_local(
    company: str,
    source_url: str,
    pdf: Path,
    title: str = typer.Option(..., "--title"),
    classification: str = typer.Option("annual_report", "--classification"),
    report_year: int | None = typer.Option(None, "--report-year", min=1900, max=2200),
) -> None:
    """Archive browser-retrieved official PDF bytes through the normal storage boundary."""
    _, domains = company_config(company)
    sources.validate_url(source_url, domains)
    content = pdf.read_bytes()
    if not content.startswith(b"%PDF-") or len(content) > 150_000_000:
        raise typer.BadParameter("source must be a PDF no larger than 150 MB")
    digest = sha256(content).hexdigest()
    archive = Path(os.getenv("ARCHIVE_DIR", "archive")) / "pdf"
    archive.mkdir(parents=True, exist_ok=True)
    path = archive / f"{digest}.pdf"
    if path.exists() and sha256(path.read_bytes()).hexdigest() != digest:
        raise typer.BadParameter("immutable archive content mismatch")
    if not path.exists():
        path.write_bytes(content)
    config = R2Config.from_environment()
    stored = store_pdf(create_client(config), config, company, content, digest)
    storage = {
        "provider": "cloudflare-r2",
        "bucket": config.bucket,
        "key": stored.key,
        "sha256": stored.sha256,
        "size": stored.size,
        "created": stored.created,
    }
    with Session(create_engine(database_url())) as session, session.begin():
        filing = persist_filing(
            session,
            company_id=company,
            title=title,
            source_url=source_url,
            sha256=digest,
            classification=classification,
            published_on=None,
            storage_metadata=storage,
            report_year=report_year,
        )
        filing_id = filing.id
    typer.echo(json.dumps({"filingId": filing_id, "sha256": digest, "path": str(path)}))


def database_url() -> str:
    load_dotenv()
    if os.getenv("INGEST_ENV", "local") != "local":
        raise typer.BadParameter("CLI mutations are local-only in this milestone")
    url = os.environ["INGEST_DATABASE_URL"]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


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
