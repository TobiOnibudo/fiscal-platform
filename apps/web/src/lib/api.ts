import { z } from "zod";
import { ReviewError } from "./repository";
export const querySchema = z
  .object({
    q: z.string().max(200).optional(),
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    statement: z.enum(["income", "balance", "cashflow"]).default("income"),
    historical: z.enum(["true", "false"]).default("false"),
    download: z.literal("manifest").optional(),
    limit: z.coerce.number().int().min(1).max(100).default(5),
    cursor: z.string().max(200).optional(),
    classification: z.string().max(100).optional(),
    year: z
      .string()
      .regex(/^(19|20)\d{2}$/)
      .optional(),
    from: z
      .string()
      .regex(/^(19|20)\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^(19|20)\d{2}$/)
      .optional(),
    company: z
      .string()
      .regex(/^[a-z0-9-]{1,100}$/)
      .optional(),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    "The beginning year must precede the ending year",
  );

export function apiFailure(error: unknown, requestId: string) {
  if (error instanceof ReviewError)
    return Response.json(
      { error: { code: error.code, message: error.message, requestId } },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "The request does not match the API contract.",
          requestId,
        },
      },
      { status: 400 },
    );
  console.error(`[api:${requestId}] Unexpected API error`, error);
  return Response.json(
    {
      error: {
        code: "DATA_UNAVAILABLE",
        message:
          "Review data is unavailable. Check the database connection and migrations, then retry.",
        requestId,
      },
    },
    { status: 503 },
  );
}
