# Contracts

This directory holds the versioned data contracts shared by the ingestion pipeline, the web application, and their tests.

## Contents

- `dataset.v1.schema.json` defines the published financial-statement dataset.
- `cell.v1.schema.json` defines a source-grounded statement cell.
- `source-inventory.v1.schema.json` defines the independent source inventory used during validation.
- `fixtures/` contains synthetic datasets and replay inputs. They are test data, not company financial data.

## Consumers

The pipeline validates and generates contract artifacts. The web application imports the synthetic dataset fixture in component and contract tests. Pipeline CLI tests use the replay fixture, and the documented offline replay command depends on it.

Update a contract only when the matching pipeline and web validation, fixtures, and tests are updated together. Keep fixtures synthetic and do not add production financial data here.
