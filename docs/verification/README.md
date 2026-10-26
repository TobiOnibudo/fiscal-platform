# Verification evidence

This directory contains the local verification deliverables for the repository.

## Contents

- `browser-review.md` records the manual browser walkthrough.
- `evidence/` contains the machine-readable verification result, check logs, test output, and HTTP smoke-check output from a specific local run.
- `index.html` is the generated HTML view of the recorded evidence.

## Generate the report

From the repository root, run the verification checks and then render the report:

```powershell
node scripts/verify-local.mjs
node scripts/render-verification.mjs
```

The detailed explanation and reproduction requirements are in [Verification report](../verification-report.md). The report is local documentation, not proof of a hosted deployment or an evergreen test result. Regenerate it after meaningful changes instead of editing `index.html` or the evidence files by hand.
