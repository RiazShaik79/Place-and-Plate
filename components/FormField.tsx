"use client";

import { forwardRef, useState } from "react";
import { Alert, Eye, EyeOff } from "./Icons";
import Spinner from "./Spinner";

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  /** Width etc. for the input box only, so hints and errors can use the full row. */
  inputClassName?: string;
  hint?: string; // shown under the field until there's an error
  error?: string | null;
  /** Something to the right of the label, e.g. a "Forgot?" link. */
  aside?: React.ReactNode;
}

const INPUT =
  "h-11 w-full rounded-lg border bg-surface px-3.5 text-[15px] outline-none transition-colors placeholder:text-faint " +
  "focus:ring-2 disabled:bg-sunken disabled:text-muted";
// An invalid field stays red while focused, so the field being fixed keeps its error state.
const inputState = (error?: string | null) =>
  error ? "border-over focus:border-over focus:ring-over/15" : "border-line focus:border-basil focus:ring-basil/20";

/** A labelled text input with an optional hint and an inline error tied to it for screen readers. */
export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { id, label, hint, error, aside, className, inputClassName = "", ...input },
  ref,
) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {aside}
      </div>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${INPUT} ${inputState(error)} ${inputClassName}`}
        {...input}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
});

/** A password input with a show/hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(
  { id, label, hint, error, aside, className, inputClassName = "", ...input },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT} pr-12 ${inputState(error)} ${inputClassName}`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink"
        >
          {visible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
});

/** A labelled select with the same hint / error handling as TextField. */
export const SelectField = forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> & { id: string; label: string; hint?: string; error?: string | null; options: { value: string; label: string }[] }
>(function SelectField({ id, label, hint, error, className, options, ...select }, ref) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <select ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={`${INPUT} ${inputState(error)}`} {...select}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
});

function FieldMessage({ id, hint, error }: { id: string; hint?: string; error?: string | null }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm text-over">
        <Alert className="mt-0.5 h-4 w-4 shrink-0" />
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
        {hint}
      </p>
    );
  }
  return null;
}

/** The primary action of a form. Shows a spinner and keeps its width while busy. */
export function SubmitButton({
  busy,
  children,
  className = "",
  disabled,
}: {
  busy: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-basil px-5 text-[15px] font-semibold text-white transition-colors hover:bg-basil-dark disabled:opacity-60 ${className}`}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
