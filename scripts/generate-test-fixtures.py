"""Generate versioned synthetic contract/replay artifacts; never production source evidence."""

import json
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "tests"))

from test_repository import synthetic_release  # noqa: E402
from fiscal_pipeline.domain import Cell, logical_hash, select_latest  # noqa: E402

payload, validation = synthetic_release()
directory = ROOT / "contracts" / "fixtures"
directory.mkdir(parents=True, exist_ok=True)
for filename, data in [
    ("synthetic-dataset.v1.json", payload),
    ("synthetic-validation.v1.json", validation),
]:
    (directory / filename).write_text(
        json.dumps(data, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
cells = [
    Cell.model_validate_json(json.dumps(bundle["cells"][0]))
    for bundle in validation["sourceBundles"]
]
manifest = {
    "artifacts": [
        {
            "path": "synthetic-validation.v1.json",
            "sha256": hashlib.sha256(
                (directory / "synthetic-validation.v1.json").read_bytes()
            ).hexdigest(),
        }
    ],
    "cells": [c.model_dump(mode="json") for c in cells],
    "expectedHash": logical_hash(
        [c.model_dump(mode="json") for c in select_latest(cells)]
    ),
}
(directory / "synthetic-replay.v1.json").write_text(
    json.dumps(manifest, sort_keys=True, indent=2) + "\n",
    encoding="utf-8",
    newline="\n",
)
