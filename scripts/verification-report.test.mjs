import assert from "node:assert/strict";
import test from "node:test";
import { renderReport } from "./render-verification.mjs";

const sample = () => ({
  schemaVersion: 1,
  generatedAt: "2026-10-23T00:00:00Z",
  sourceRevision: "synthetic-test-input",
  checks: [
    { label: "A", status: "pass", durationMs: 1, log: "a.log", exitCode: 0 },
    { label: "B", status: "fail", durationMs: 1, log: "b.log", exitCode: 1 },
    {
      label: "C",
      status: "skipped",
      durationMs: 0,
      log: "c.log",
      exitCode: null,
    },
  ],
});

test("reports actual statuses without turning failures or skips into passes", () => {
  const html = renderReport(sample());
  assert.ok(html.includes("1 PASS"));
  assert.ok(html.includes("1 FAIL"));
  assert.ok(html.includes("1 SKIPPED"));
  assert.ok(html.includes("Foundation implemented; assessment incomplete"));
  assert.ok(html.includes('href="#report"'));
  assert.ok(html.includes('id="report"'));
});

test("escapes injected metadata and rejects traversal log links", () => {
  const input = sample();
  input.sourceRevision = '<script>alert("test")</script>';
  input.checks[0].label = '<img src=x onerror="test">';
  input.checks[0].log = "../secret.txt";
  const html = renderReport(input);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="evidence/../secret.txt"'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("No log recorded"));
});

test("rejects unknown evidence schemas and check statuses", () => {
  assert.throws(() => renderReport({ schemaVersion: 2, checks: [] }));
  const input = sample();
  input.checks[0].status = "not-a-result";
  assert.throws(() => renderReport(input));
});

test("identifies the base commit and never labels an unrecorded tree clean", () => {
  const html = renderReport(sample());
  assert.ok(html.includes("Base Git commit"));
  assert.ok(html.includes("Not recorded"));
  assert.ok(!html.includes("Clean when recorded"));
});
