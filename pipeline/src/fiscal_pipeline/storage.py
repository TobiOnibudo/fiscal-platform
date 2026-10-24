"""Private, content-addressed Cloudflare R2 storage for source PDFs."""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from typing import Any, Protocol, cast
from urllib.parse import urlsplit

_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
_COMPANY = re.compile(r"^[a-z][a-z0-9-]{1,60}$")


class ObjectClient(Protocol):
    def head_object(self, **kwargs: Any) -> dict[str, Any]: ...

    def put_object(self, **kwargs: Any) -> dict[str, Any]: ...


@dataclass(frozen=True)
class R2Config:
    account_id: str
    bucket: str
    endpoint: str
    access_key_id: str
    secret_access_key: str
    prefix: str = "filings"

    @classmethod
    def from_environment(cls) -> R2Config:
        required = {
            "R2_ACCOUNT_ID": os.getenv("R2_ACCOUNT_ID", "").strip(),
            "R2_BUCKET": os.getenv("R2_BUCKET", "").strip(),
            "R2_ENDPOINT": os.getenv("R2_ENDPOINT", "").strip(),
            "R2_ACCESS_KEY_ID": os.getenv("R2_ACCESS_KEY_ID", "").strip(),
            "R2_SECRET_ACCESS_KEY": os.getenv("R2_SECRET_ACCESS_KEY", "").strip(),
        }
        missing = sorted(name for name, value in required.items() if not value)
        if missing:
            raise ValueError(f"R2 is not configured: missing {', '.join(missing)}")
        endpoint = urlsplit(required["R2_ENDPOINT"])
        if (
            endpoint.scheme != "https"
            or not endpoint.hostname
            or endpoint.username
            or endpoint.password
            or endpoint.path not in {"", "/"}
        ):
            raise ValueError("R2_ENDPOINT must be a bare HTTPS S3 endpoint")
        if not _BUCKET.fullmatch(required["R2_BUCKET"]):
            raise ValueError("R2_BUCKET has an invalid name")
        prefix = os.getenv("R2_PREFIX", "filings").strip("/")
        if not prefix or any(not part or part in {".", ".."} for part in prefix.split("/")):
            raise ValueError("R2_PREFIX must be a safe object-key prefix")
        return cls(
            account_id=required["R2_ACCOUNT_ID"],
            bucket=required["R2_BUCKET"],
            endpoint=required["R2_ENDPOINT"].rstrip("/"),
            access_key_id=required["R2_ACCESS_KEY_ID"],
            secret_access_key=required["R2_SECRET_ACCESS_KEY"],
            prefix=prefix,
        )


@dataclass(frozen=True)
class StoredPdf:
    key: str
    sha256: str
    size: int
    created: bool


def object_key(config: R2Config, company_id: str, sha256: str) -> str:
    if not _COMPANY.fullmatch(company_id):
        raise ValueError("company ID is not safe for an object key")
    if not re.fullmatch(r"[a-f0-9]{64}", sha256):
        raise ValueError("source digest must be a SHA-256 hex value")
    return f"{config.prefix}/{company_id}/{sha256}.pdf"


def create_client(config: R2Config) -> ObjectClient:
    try:
        import boto3  # type: ignore[import-untyped]
    except ImportError as exc:  # pragma: no cover - depends on optional install
        raise RuntimeError("R2 support requires `uv sync --extra storage`") from exc
    return cast(
        ObjectClient,
        boto3.client(
            "s3",
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key_id,
            aws_secret_access_key=config.secret_access_key,
            region_name="auto",
        ),
    )


def _not_found(error: Exception) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, dict):
        return False
    code = str(response.get("Error", {}).get("Code", ""))
    return code in {"404", "NoSuchKey", "NotFound"}


def store_pdf(
    client: ObjectClient,
    config: R2Config,
    company_id: str,
    content: bytes,
    sha256: str,
) -> StoredPdf:
    """Store once by digest; an existing different object is a hard failure."""
    if not content.startswith(b"%PDF-"):
        raise ValueError("R2 source content does not contain a PDF signature")
    actual_digest = hashlib.sha256(content).hexdigest()
    if actual_digest != sha256:
        raise ValueError("R2 source content does not match its SHA-256 digest")
    key = object_key(config, company_id, sha256)
    try:
        existing = client.head_object(Bucket=config.bucket, Key=key)
    except Exception as exc:
        if not _not_found(exc):
            raise RuntimeError("could not verify R2 object state") from exc
    else:
        metadata = existing.get("Metadata", {})
        if existing.get("ContentLength") != len(content) or metadata.get("sha256") != sha256:
            raise ValueError("existing R2 object conflicts with immutable source content")
        return StoredPdf(key=key, sha256=sha256, size=len(content), created=False)
    client.put_object(
        Bucket=config.bucket,
        Key=key,
        Body=content,
        ContentType="application/pdf",
        ContentDisposition=f'inline; filename="{sha256}.pdf"',
        Metadata={"sha256": sha256, "company": company_id},
    )
    return StoredPdf(key=key, sha256=sha256, size=len(content), created=True)
