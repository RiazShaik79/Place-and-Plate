"use client";

import { useState } from "react";
import { apiFetch, readFieldError } from "@/lib/client";
import Spinner from "./Spinner";

/**
 * "Resend link" for email confirmation: posts to /api/account/verify-email (which picks the pending
 * new email, or the unconfirmed sign-in email) and reports where it went or why it couldn't.
 */
export default function ResendVerification({ className = "", label = "Resend link" }: { className?: string; label?: string }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" } | { kind: "sent"; to: string } | { kind: "error"; message: string }>({ kind: "idle" });

  async function resend() {
    setState({ kind: "busy" });
    try {
      const res = await apiFetch("/api/account/verify-email", { method: "POST" });
      if (res.ok) {
        const { sentTo } = (await res.json()) as { sentTo: string };
        setState({ kind: "sent", to: sentTo });
      } else {
        setState({ kind: "error", message: (await readFieldError(res)).message });
      }
    } catch {
      setState({ kind: "error", message: "Couldn't reach the app. Try again." });
    }
  }

  if (state.kind === "sent") {
    return (
      <span role="status" className={`font-semibold ${className}`} title={`Sent to ${state.to}`}>
        New link sent.
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 ${className}`}>
      <button
        type="button"
        onClick={resend}
        disabled={state.kind === "busy"}
        className="inline-flex items-center gap-1.5 rounded font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-60"
      >
        {state.kind === "busy" && <Spinner className="h-3.5 w-3.5" />}
        {state.kind === "busy" ? "Sending…" : label}
      </button>
      {state.kind === "error" && (
        <span role="alert" className="text-over">
          {state.message}
        </span>
      )}
    </span>
  );
}
