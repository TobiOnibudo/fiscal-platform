"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="boot">
      <h1>The workspace could not open</h1>
      <p>Try loading it again.</p>
      <button onClick={reset}>Retry</button>
    </main>
  );
}
