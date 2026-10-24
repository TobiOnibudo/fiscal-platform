"use client";
import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="boot" role="alert" aria-labelledby="workspace-error-title">
      <section className="boot-card">
        <Link className="boot-brand" href="/" aria-label="Fiscal home">
          fiscal<span>.</span>
        </Link>
        <div className="boot-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <p className="boot-eyebrow">Workspace unavailable</p>
        <h1 id="workspace-error-title">We couldn&apos;t load this review.</h1>
        <p className="boot-copy">
          Try again to reconnect to the financial review workspace.
        </p>
        <div className="boot-actions">
          <button className="button boot-primary" onClick={reset} autoFocus>
            <RotateCcw size={16} aria-hidden="true" />
            Try again
          </button>
          <Link className="text-button" href="/">
            Return to home
          </Link>
        </div>
      </section>
    </main>
  );
}
