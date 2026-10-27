"use client";

import { useState } from "react";
import type { ExerciseEstimate, ExerciseItem } from "@/lib/types";
import { requestEstimate, toFriendlyMessage } from "@/lib/client";
import ExerciseReview from "./ExerciseReview";
import Notice from "./Notice";
import Spinner from "./Spinner";
import { Sparkle } from "./Icons";

const MAX_LENGTH = 500;

const EXAMPLES = ["30 minute brisk walk outdoors", "45 min treadmill walk at 6% incline", "1 hour of yoga, then 15 minutes stretching"];

export default function ExerciseTextLookup({ onLog }: { onLog: (items: ExerciseItem[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<ExerciseEstimate | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    const description = text.trim();
    if (!description || loading) return;
    setLoading(true);
    setError(null);
    setEstimate(null);
    try {
      const result = await requestEstimate<ExerciseEstimate>("/api/ai/exercise/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (result.items.length === 0) setError(`No exercise found in that description. ${result.notes}`.trim());
      else setEstimate(result);
    } catch (err) {
      setError(toFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirm(items: ExerciseItem[]) {
    await onLog(items);
    setEstimate(null);
    setText("");
  }

  return (
    <div>
      <form onSubmit={lookup}>
        <label htmlFor="exercise-ai-text" className="mb-2 block text-sm text-muted">
          Say what you did, for how long and where. AI estimates the calories for you to review.
        </label>
        <div className="rounded-card border border-line bg-sunken transition-colors focus-within:border-basil focus-within:bg-surface focus-within:ring-2 focus-within:ring-basil/20">
          <textarea
            id="exercise-ai-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={MAX_LENGTH}
            rows={3}
            disabled={loading}
            placeholder="e.g. walked the dog for 40 minutes, mostly uphill"
            className="block w-full resize-none bg-transparent px-3.5 pt-3 outline-none placeholder:text-faint disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5">
            <span className={`text-xs tabular-nums ${text.length > MAX_LENGTH * 0.9 ? "text-near" : "text-faint"}`}>
              {text.length}/{MAX_LENGTH}
            </span>
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-basil px-4 text-sm font-semibold text-white transition-colors hover:bg-basil-dark disabled:opacity-40"
            >
              {loading ? <Spinner className="h-4 w-4" /> : <Sparkle className="h-4 w-4" />}
              {loading ? "Estimating…" : "Estimate"}
            </button>
          </div>
        </div>
      </form>

      {!text && !estimate && !loading && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="rounded-full border border-line px-3 py-1 text-[13px] text-muted transition-colors hover:border-basil/40 hover:text-basil"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted" role="status">
          <Spinner className="h-4 w-4 text-basil" /> Estimating duration, effort and calories…
        </p>
      )}
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      {estimate && <ExerciseReview estimate={estimate} onConfirm={confirm} onCancel={() => setEstimate(null)} />}
    </div>
  );
}
