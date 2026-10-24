from __future__ import annotations

import hashlib

import pytest

from fiscal_pipeline.storage import R2Config, object_key, store_pdf


class NotFound(Exception):
    response = {"Error": {"Code": "404"}}


class FakeClient:
    def __init__(self) -> None:
        self.objects: dict[str, dict[str, object]] = {}

    def head_object(self, *, Bucket: str, Key: str) -> dict[str, object]:
        del Bucket
        if Key not in self.objects:
            raise NotFound()
        return self.objects[Key]

    def put_object(
        self, *, Bucket: str, Key: str, Body: bytes, **kwargs: object
    ) -> dict[str, object]:
        del Bucket
        self.objects[Key] = {
            "ContentLength": len(Body),
            "Metadata": kwargs["Metadata"],
        }
        return {}


def config() -> R2Config:
    return R2Config(
        account_id="account",
        bucket="fiscal-filings-prod",
        endpoint="https://account.r2.cloudflarestorage.com",
        access_key_id="key",
        secret_access_key="secret",
    )


def test_store_pdf_is_content_addressed_and_idempotent() -> None:
    content = b"%PDF-1.7\nsource"
    digest = hashlib.sha256(content).hexdigest()
    client = FakeClient()
    first = store_pdf(client, config(), "wise", content, digest)
    second = store_pdf(client, config(), "wise", content, digest)
    assert first.created is True
    assert second.created is False
    assert first.key == f"filings/wise/{digest}.pdf"
    assert object_key(config(), "wise", digest) == first.key


def test_store_pdf_rejects_digest_or_existing_object_mismatch() -> None:
    content = b"%PDF-1.7\nsource"
    digest = hashlib.sha256(content).hexdigest()
    client = FakeClient()
    with pytest.raises(ValueError, match="SHA-256"):
        store_pdf(client, config(), "wise", content, "0" * 64)
    client.objects[f"filings/wise/{digest}.pdf"] = {
        "ContentLength": 1,
        "Metadata": {"sha256": digest},
    }
    with pytest.raises(ValueError, match="conflicts"):
        store_pdf(client, config(), "wise", content, digest)


def test_r2_configuration_requires_safe_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("R2_ACCOUNT_ID", "account")
    monkeypatch.setenv("R2_BUCKET", "fiscal-filings-prod")
    monkeypatch.setenv("R2_ENDPOINT", "https://account.r2.cloudflarestorage.com")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    assert R2Config.from_environment().bucket == "fiscal-filings-prod"
    monkeypatch.setenv("R2_ENDPOINT", "http://insecure.example.com")
    with pytest.raises(ValueError, match="HTTPS"):
        R2Config.from_environment()
