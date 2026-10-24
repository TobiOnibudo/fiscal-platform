"use client";
import { useEffect, useState } from "react";
import type { Statement } from "@/lib/contracts";
export type Failure = { code: string; message: string; requestId?: string };
export type StatementResponse = {
  datasetVersion: string;
  kind: "sample" | "verified";
  statement: Statement;
  coverage: {
    expectedPeriods: number;
    verifiedPeriods: number;
    gaps: string[];
  };
};
type State<T> = { loading: boolean; data?: T; error?: Failure };
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    signal,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw (
      body.error ?? {
        code: "REQUEST_FAILED",
        message: "The request could not complete.",
      }
    );
  return body;
}
export function useReview<T>(path: string | null, retry: number): State<T> {
  const [state, setState] = useState<State<T> & { key?: string }>({
    loading: true,
  });
  const key = `${path}:${retry}`;
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    read<T>(path, abort.signal)
      .then((data) => setState({ loading: false, data, key }))
      .catch((error) => {
        if (!abort.signal.aborted) setState({ loading: false, error, key });
      });
    return () => abort.abort();
  }, [path, key]);
  return state.key === key ? state : { loading: true };
}
