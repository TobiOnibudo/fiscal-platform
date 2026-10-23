import { z } from "zod";

export const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const cellSchema = z
  .object({
    value: decimal.nullable(),
    state: z.enum(["reported", "not_reported", "unreadable"]),
    observationId: z.string(),
    filingId: z.string(),
    rawLabel: z.string(),
    rawText: z.string(),
    pdfPage: z.number().int().positive(),
    printedPage: z.string(),
    comparative: z.enum(["original", "updated", "restated"]),
  })
  .strict()
  .refine(
    (c) => (c.state === "reported") === (c.value !== null),
    "Reported cells require a value; missing cells cannot carry one",
  );
const currency = z.string().regex(/^[A-Z]{3}$/);
const nonblank = z.string().trim().min(1);
export const rowSchema = z
  .object({
    id: nonblank,
    label: nonblank,
    currency,
    unit: nonblank,
    aliases: z.array(z.string()),
    depth: z.number().int().min(0).max(10),
    kind: z.enum(["item", "subtotal", "section"]),
    historical: z.boolean(),
    cells: z.record(z.string(), cellSchema),
  })
  .strict();
export const statementSchema = z
  .object({
    id: z.enum(["income", "balance", "cashflow"]),
    title: nonblank,
    scope: z.literal("consolidated"),
    basis: nonblank,
    currency,
    unit: nonblank,
    periods: z
      .array(
        z
          .object({
            id: nonblank,
            label: nonblank,
            start: z.iso.date().nullable(),
            end: z.iso.date(),
          })
          .strict()
          .refine(
            (p) => !p.start || p.start <= p.end,
            "Period begins after its end",
          ),
      )
      .max(50),
    rows: z.array(rowSchema).max(5000),
  })
  .strict()
  .superRefine((statement, context) => {
    const periods = new Set(statement.periods.map((p) => p.id));
    if (periods.size !== statement.periods.length)
      context.addIssue({ code: "custom", message: "Duplicate period IDs" });
    if (new Set(statement.rows.map((r) => r.id)).size !== statement.rows.length)
      context.addIssue({ code: "custom", message: "Duplicate row IDs" });
    for (const row of statement.rows)
      for (const key of Object.keys(row.cells))
        if (!periods.has(key))
          context.addIssue({
            code: "custom",
            message: "Cell references unknown period",
          });
    for (const period of statement.periods)
      if ((statement.id === "balance") !== (period.start === null))
        context.addIssue({
          code: "custom",
          message:
            "Balance sheet periods must be instants; other statements require durations",
        });
  });
export const datasetSchema = z
  .object({
    schemaVersion: z.literal("1"),
    companyId: nonblank,
    kind: z.enum(["sample", "verified"]),
    statements: z.array(statementSchema),
    coverage: z
      .object({
        expectedPeriods: z.number().int().nonnegative(),
        verifiedPeriods: z.number().int().nonnegative(),
        gaps: z.array(z.string()),
      })
      .strict()
      .refine(
        (c) => c.verifiedPeriods <= c.expectedPeriods,
        "Verified coverage exceeds expected coverage",
      ),
  })
  .strict()
  .refine(
    (d) => new Set(d.statements.map((s) => s.id)).size === d.statements.length,
    "Duplicate statements",
  );
export type Dataset = z.infer<typeof datasetSchema>;
export type Statement = z.infer<typeof statementSchema>;
export type Row = z.infer<typeof rowSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type Company = {
  id: string;
  name: string;
  fiscal_year_end_month: number;
};
export type Filing = {
  id: string;
  title: string;
  source_url: string;
  classification: string;
  published_on: string | null;
  sha256: string;
};
export type Published = { version: string; data: Dataset; validation: unknown };

export function searchRows(
  rows: Row[],
  query: string,
  historical: boolean,
): Row[] {
  const eligible = rows.filter((r) => historical || !r.historical);
  const needle = query.trim().toLocaleLowerCase("en");
  if (!needle) return eligible;
  const matched = new Set(
    eligible
      .filter((r) =>
        [r.label, ...r.aliases].some((label) =>
          label.toLocaleLowerCase("en").includes(needle),
        ),
      )
      .map((r) => r.id),
  );
  const keep = new Set(matched);
  const ancestors: Row[] = [];
  for (const row of eligible) {
    while (
      ancestors.length &&
      ancestors[ancestors.length - 1].depth >= row.depth
    )
      ancestors.pop();
    if (matched.has(row.id))
      for (const ancestor of ancestors) keep.add(ancestor.id);
    if (row.kind === "section") ancestors.push(row);
  }
  return eligible.filter((r) => keep.has(r.id));
}
export function displayDecimal(value: string): string {
  const [whole, fraction] = value.split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (fraction === undefined ? "" : `.${fraction}`)
  );
}
export function safeSource(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
