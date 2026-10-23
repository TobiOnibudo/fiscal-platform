import json
from pathlib import Path

import pytest
from test_repository import engine  # noqa: F401
from typer.testing import CliRunner

from fiscal_pipeline.cli import app
from fiscal_pipeline.live_extraction import extract_pilot


def test_cli_help_and_replay() -> None:
    runner = CliRunner()
    assert runner.invoke(app, ["--help"]).exit_code == 0
    manifest = Path(__file__).parents[2] / "contracts/fixtures/synthetic-replay.v1.json"
    result = runner.invoke(app, ["replay", str(manifest), "--offline"])
    assert result.exit_code == 0, result.output
    assert json.loads(manifest.read_text())["expectedHash"] in result.output


def test_live_extraction_guards(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    pdf = tmp_path / "synthetic.pdf"
    pdf.write_bytes(b"%PDF-test")
    with pytest.raises(ValueError, match="offline response cache miss"):
        extract_pilot(pdf, tmp_path, "test-model", offline=True, allow_paid=False)
    with pytest.raises(ValueError, match="allow-paid"):
        extract_pilot(pdf, tmp_path, "test-model", offline=False, allow_paid=False)
    with pytest.raises(ValueError, match="OPENAI_API_KEY missing"):
        extract_pilot(pdf, tmp_path, "test-model", offline=False, allow_paid=True)


@pytest.mark.integration
def test_add_company_uses_persisted_config(engine, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    import os

    from fiscal_pipeline import sources

    monkeypatch.setenv("INGEST_DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    monkeypatch.setenv("INGEST_ENV", "local")
    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "add-company",
            "synthetic-issuer",
            "Synthetic Issuer",
            "https://example.com/reports",
            "example.com",
            "--fiscal-month",
            "6",
        ],
    )
    assert result.exit_code == 0, result.output
    monkeypatch.setattr(sources, "discover", lambda entry, domains: [entry + "/annual.pdf"])
    discovered = runner.invoke(app, ["discover", "--company", "synthetic-issuer"])
    # Typer required scalar values are arguments, matching add-company and other commands.
    if discovered.exit_code:
        discovered = runner.invoke(app, ["discover", "synthetic-issuer"])
    assert discovered.exit_code == 0, discovered.output
    assert "example.com/reports/annual.pdf" in discovered.output
