"use client";

import { useRef, useState } from "react";
import { Check } from "./Icons";

/** A settings panel: title and description on the left, the form on the right (stacked on phones). */
export function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="grid gap-5 rounded-panel bg-surface p-5 ring-1 ring-line sm:p-7 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8"
    >
      <div>
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** "Saved" confirmation that sits next to a form's button and fades after a few seconds. */
export function SavedNote({ text }: { text: string }) {
  return (
    <p role="status" className="flex animate-toast-in items-center gap-1.5 text-sm font-semibold text-ok">
      <Check className="h-4 w-4" />
      {text}
    </p>
  );
}

export function useFlash(ms = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = (text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), ms);
  };
  return [message, flash, () => setMessage(null)] as const;
}
