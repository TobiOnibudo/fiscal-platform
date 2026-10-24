import json

import pytest

from fiscal_pipeline.public_contract import PublicDataset
from fiscal_pipeline.sample_data import sample_dataset


@pytest.mark.parametrize("company", ["wise", "adyen"])
def test_sample_data_is_explicitly_non_verified_and_complete_for_ui(company: str) -> None:
    dataset_id, payload, validation = sample_dataset(company)

    public = PublicDataset.model_validate_json(json.dumps(payload))

    assert len(dataset_id) == 64
    assert public.kind == "sample"
    assert public.coverage.verifiedPeriods == 0
    assert validation["reviewed"] is False
    assert {statement.id for statement in public.statements} == {"income", "balance", "cashflow"}
    assert all(len(statement.periods) == 10 for statement in public.statements)
    assert all(statement.rows for statement in public.statements)


def test_sample_data_rejects_unconfigured_company() -> None:
    with pytest.raises(ValueError, match="Wise and Adyen"):
        sample_dataset("example")
