import json

import pytest
from test_domain import candidate  # noqa: F401

from fiscal_pipeline.domain import Cell, SourceInventory
from fiscal_pipeline.extraction import decode_recorded_response


def test_model_cannot_approve_itself(candidate: tuple[list[Cell], SourceInventory]) -> None:  # noqa: F811
    cells, _ = candidate
    raw = json.dumps({"status": "completed", "cells": [c.model_dump(mode="json") for c in cells]})
    extracted = decode_recorded_response(raw)
    assert all(not c.mapping_reviewed and not c.evidence.reviewed for c in extracted)


@pytest.mark.parametrize(
    "response",
    [
        {"status": "incomplete", "cells": []},
        {"status": "completed", "refusal": "cannot transcribe", "cells": []},
        {"status": "completed", "cells": []},
    ],
)
def test_response_failure(response: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        decode_recorded_response(json.dumps(response))
