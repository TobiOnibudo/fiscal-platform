"""Bounded official-host discovery and content-addressed PDF archive."""

import hashlib
import ipaddress
import json
import socket
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx


class Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self.links.extend(value for key, value in attrs if key == "href" and value)


def validate_url(url: str, approved_domains: list[str]) -> None:
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in approved_domains
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 443}
    ):
        raise ValueError("URL must use HTTPS on an explicitly approved publisher host")
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("publisher host resolved to a non-public address")


def fetch(url: str, approved_domains: list[str], *, max_bytes: int) -> tuple[bytes, str]:
    """Every redirect is independently validated; explicit proxy use is disabled."""
    with httpx.Client(timeout=30, follow_redirects=False, trust_env=False) as client:
        for _ in range(5):
            validate_url(url, approved_domains)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0 Safari/537.36"
                ),
                "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            with client.stream("GET", url, headers=headers) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers["location"])
                    continue
                response.raise_for_status()
                chunks = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("source exceeds configured size bound")
                    chunks.append(chunk)
                return b"".join(chunks), url
    raise ValueError("redirect limit exceeded")


def discover(entry: str, domains: list[str]) -> list[str]:
    data, resolved = fetch(entry, domains, max_bytes=4_000_000)
    parser = Links()
    parser.feed(data.decode("utf-8", errors="replace"))
    links = {urljoin(resolved, link).split("#")[0] for link in parser.links}
    return sorted(
        url
        for url in links
        if urlsplit(url).hostname in domains
        and any(token in url.lower() for token in [".pdf", "static-files", "/financials/"])
    )


def download(url: str, domains: list[str], archive: Path) -> dict[str, str]:
    data, resolved = fetch(url, domains, max_bytes=150_000_000)
    if not data.startswith(b"%PDF-"):
        raise ValueError("source does not contain a PDF signature")
    digest = hashlib.sha256(data).hexdigest()
    directory = archive / "pdf"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{digest}.pdf"
    if path.exists():
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("immutable archive content mismatch")
    else:
        path.write_bytes(data)
    record = {
        "sourceUrl": url,
        "resolvedUrl": resolved,
        "sha256": digest,
        "path": str(path),
        "status": "downloaded",
        "classification": "unreviewed",
    }
    manifest = archive / "downloads.jsonl"
    with manifest.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, sort_keys=True) + "\n")
    return record
