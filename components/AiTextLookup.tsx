"use client";

import { useState } from "react";
import type { Meal, NutritionEstimate, NutritionItem } from "@/lib/types";
import { requestEstimate, toFriendlyMessage } from "@/lib/client";
import EstimateReview from "./EstimateReview";
import Notice from "./Notice";
import Spinner from "./Spinner";
import { Sparkle } from "./Icons";

const MAX_LENGTH = 500;

const EXAMPLES = ["2 scrambled eggs and a slice of toast", "chicken caesar salad", "a large latte and a blueberry muffin"];

interface Props {
  meal: Meal;
  onLog: (items: NutritionItem[]) => Promise<void>;
}

export default function AiTextLookup({ meal, onLog }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    const description = text.trim();
    if (!description || loading) return;
    setLoading(true);
    setError(null);
    setEstimate(null);
    try {
      const result = await requestEstimate("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (result.items.length === 0) {
        setError(`No food found in that description. ${result.notes}`.trim());
      } else {
        setEstimate(result);
      }
    } catch (err) {
      setError(toFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirm(items: NutritionItem[]) {
    await onLog(items);
    setEstimate(null);
    setText("");
  }

  return (
    <div>
      <form onSubmit={lookup}>
        <label htmlFor="ai-text" className="mb-2 block text-sm text-muted">
          Write what you ate the way you&apos;d say it. AI estimates each item for you to review.
        </label>
        <div className="rounded-card border border-line bg-sunken transition-colors focus-within:border-basil focus-within:bg-surface focus-within:ring-2 focus-within:ring-basil/20">
          <textarea
            id="ai-text"
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
            placeholder="e.g. grilled chicken with rice and a side salad, plus a glass of orange juice"
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
          <Spinner className="h-4 w-4 text-basil" /> Estimating calories and macros for each item…
        </p>
      )}
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      {estimate && <EstimateReview estimate={estimate} meal={meal} onConfirm={confirm} onCancel={() => setEstimate(null)} />}
    </div>
  );
}
