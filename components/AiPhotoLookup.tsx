"use client";

import { useEffect, useRef, useState } from "react";
import type { Meal, NutritionEstimate, NutritionItem } from "@/lib/types";
import { FriendlyError, prepareImage, requestEstimate, toFriendlyMessage } from "@/lib/client";
import EstimateReview from "./EstimateReview";
import Notice from "./Notice";
import Spinner from "./Spinner";
import { Camera, Close, Sparkle, Upload } from "./Icons";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface Props {
  meal: Meal;
  onLog: (items: NutritionItem[]) => Promise<void>;
}

export default function AiPhotoLookup({ meal, onLog }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [dragging, setDragging] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the object URL when the preview changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function choose(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    setEstimate(null);
    if (!picked.type.startsWith("image/")) {
      setError("That file isn't a photo. Choose a JPEG, PNG, WebP or HEIC image.");
      return;
    }
    setFile(picked);
    setPreviewFailed(false);
    setPreviewUrl(URL.createObjectURL(picked));
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    choose(picked);
  }

  function clear() {
    setFile(null);
    setPreviewUrl(null);
    setHint("");
    setEstimate(null);
    setError(null);
  }

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setEstimate(null);
    try {
      const image = await prepareImage(file);
      if (image.size > MAX_UPLOAD_BYTES) throw new FriendlyError("That photo is larger than 10 MB. Choose a smaller one.");
      const form = new FormData();
      form.append("image", image, file.name);
      if (hint.trim()) form.append("hint", hint.trim());
      const result = await requestEstimate("/api/ai/image", { method: "POST", body: form });
      if (result.items.length === 0) {
        setError(`No food found in that photo. ${result.notes}`.trim());
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
    clear();
  }

  const secondaryBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-sunken disabled:opacity-50";
  const primaryBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-basil px-4 text-sm font-semibold text-white transition-colors hover:bg-basil-dark disabled:opacity-50";

  return (
    <div>
      {/* `capture` opens the camera on phones; the second input opens the gallery / file picker. */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      <input ref={fileInput} type="file" accept="image/*" onChange={pick} className="hidden" />

      {!previewUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center rounded-card border-2 border-dashed px-5 py-8 text-center transition-colors ${
            dragging ? "border-basil bg-basil-soft" : "border-line bg-sunken/60"
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-basil ring-1 ring-line">
            <Camera className="h-6 w-6" />
          </span>
          <p className="mt-3 font-semibold">Photograph your plate</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            AI identifies each food it can see and estimates the portion. You review before anything is logged.
          </p>
          <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button onClick={() => cameraInput.current?.click()} className={primaryBtn}>
              <Camera className="h-4 w-4" />
              Take photo
            </button>
            <button onClick={() => fileInput.current?.click()} className={secondaryBtn}>
              <Upload className="h-4 w-4" />
              Upload photo
            </button>
          </div>
          <p className="mt-3 hidden text-xs text-faint sm:block">or drop an image here</p>
        </div>
      ) : (
        <div>
          <div className="relative overflow-hidden rounded-card bg-sunken">
            {previewFailed ? (
              <p className="px-4 py-10 text-center text-sm text-muted">
                No preview for this format ({file?.name}), but it can still be analysed.
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img
                src={previewUrl}
                alt="Your meal"
                onError={() => setPreviewFailed(true)}
                className="mx-auto max-h-72 w-full object-contain"
              />
            )}
            {!loading && !estimate && (
              <button
                onClick={clear}
                aria-label="Remove photo"
                title="Remove photo"
                className="absolute top-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-ink/70 text-white backdrop-blur hover:bg-ink/85"
              >
                <Close className="h-4 w-4" />
              </button>
            )}
            {loading && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/75 backdrop-blur-[2px]"
                role="status"
              >
                <Spinner className="h-8 w-8 text-basil" />
                <span className="text-sm font-semibold">Identifying foods…</span>
              </div>
            )}
          </div>

          {!estimate && (
            <>
              <label htmlFor="photo-hint" className="sr-only">
                Details for the AI (optional)
              </label>
              <input
                id="photo-hint"
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyze()}
                maxLength={300}
                disabled={loading}
                placeholder="Optional details, e.g. “only the left plate” or “large portion”"
                className="mt-3 h-11 w-full rounded-full border border-line bg-sunken px-4 text-sm outline-none transition-colors placeholder:text-faint focus:border-basil focus:bg-surface focus:ring-2 focus:ring-basil/20 disabled:opacity-60"
              />
              <button onClick={analyze} disabled={loading} className={`${primaryBtn} mt-3 w-full`}>
                {loading ? <Spinner className="h-4 w-4" /> : <Sparkle className="h-4 w-4" />}
                {loading ? "Identifying foods…" : "Identify foods"}
              </button>
            </>
          )}
        </div>
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
