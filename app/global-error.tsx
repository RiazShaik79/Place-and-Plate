"use client";

// Last-resort error page for errors thrown while rendering the root layout. Reports to Sentry.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-paper px-4 font-sans text-ink antialiased">
        <main className="w-full max-w-md rounded-[20px] border border-line bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">The page couldn&apos;t load. Try again, or come back in a minute.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-full bg-basil px-5 py-2 text-sm font-semibold text-white hover:bg-basil-dark"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
