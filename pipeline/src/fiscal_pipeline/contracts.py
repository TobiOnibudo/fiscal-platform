"""Generate committed schemas from the sole Pydantic extraction contract."""

import json
import sys
from pathlib import Path

from pydantic import BaseModel

from fiscal_pipeline.domain import Cell, SourceInventory
from fiscal_pipeline.public_contract import PublicDataset


def main() -> None:
    destination = Path(__file__).resolve().parents[3] / "contracts"
    destination.mkdir(exist_ok=True)
    models: list[tuple[str, type[BaseModel]]] = [
        ("cell.v1", Cell),
        ("source-inventory.v1", SourceInventory),
        ("dataset.v1", PublicDataset),
    ]
    for name, model in models:
        expected = json.dumps(model.model_json_schema(), sort_keys=True, indent=2) + "\n"
        path = destination / f"{name}.schema.json"
        if "--check" in sys.argv:
            if not path.exists() or path.read_text(encoding="utf-8") != expected:
                raise SystemExit(f"contract drift: {path.name}")
        else:
            path.write_text(expected, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
