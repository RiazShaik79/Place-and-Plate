"use client";

import { useRef, useState } from "react";
import { HOME_PATH, PASSWORD_MIN, validateEmail, validateNewPassword } from "@/lib/account";
import { readFieldError, setFlash } from "@/lib/client";
import { PasswordField, SubmitButton, TextField } from "./FormField";
import { Check } from "./Icons";
import Notice from "./Notice";
import { APP_NAME } from "@/lib/brand";

const UNREACHABLE = "Couldn't reach the app. Check that it's still running, then try again.";

/** Step 1: ask for the email, then confirm the link is on its way (whether or not the account exists). */
export function ForgotPasswordForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const target = sentTo ?? email;
    const problem = validateEmail(target);
    setError(problem);
    setFormError(null);
    if (problem) {
      input.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      if (res.ok) {
        setSentTo(target.trim());
      } else {
        const { message, field } = await readFieldError(res);
        if (field === "email" && !sentTo) {
          setError(message);
          input.current?.focus();
        } else setFormError(message);
      }
    } catch {
      setFormError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-basil-soft text-basil">
          <Check className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">Check your email</h1>
        <p className="mt-2 text-[15px] text-muted">
          If an account uses <span className="font-semibold break-words text-ink">{sentTo}</span>, we&apos;ve sent it a link to
          choose a new password. The link works once and expires in 30 minutes.
        </p>
        <p className="mt-4 rounded-card bg-sunken px-3.5 py-3 text-sm text-muted">
          Running {APP_NAME} on your own computer? The email is printed in the terminal where the app is running.
        </p>
        {formError && (
          <div className="mt-4">
            <Notice tone="error">{formError}</Notice>
          </div>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <a
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-full bg-basil px-5 text-[15px] font-semibold text-white transition-colors hover:bg-basil-dark"
          >
            Back to sign in
          </a>
          <button
            onClick={() => submit()}
            disabled={busy}
            className="rounded text-[15px] font-semibold text-basil underline-offset-2 hover:underline disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send the link again"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">Reset your password</h1>
      <p className="mt-2 text-[15px] text-muted">Enter the email you sign in with and we&apos;ll send you a link to choose a new password.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <TextField
          ref={input}
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          error={error}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <SubmitButton busy={busy} className="w-full">
          {busy ? "Sending link…" : "Send reset link"}
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-[15px] text-muted">
        Remembered it?{" "}
        <a href="/login" className="rounded font-semibold text-basil underline-offset-2 hover:underline">
          Sign in
        </a>
      </p>
    </>
  );
}

/** Step 2: the link from the email. Choose a new password, then go straight into the app. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validateNewPassword(password);
    setError(problem);
    setFormError(null);
    if (problem) {
      input.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setFlash("Password updated");
        window.location.assign(HOME_PATH);
        return; // keep the busy state until the page changes
      }
      const { message, field } = await readFieldError(res);
      if (field === "password") {
        setError(message);
        input.current?.focus();
      } else setLinkProblem(message);
    } catch {
      setFormError(UNREACHABLE);
    }
    setBusy(false);
  }

  if (linkProblem) return <ResetLinkProblem message={linkProblem} />;

  return (
    <>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">Choose a new password</h1>
      <p className="mt-2 text-[15px] text-muted">You&apos;ll be signed in here, and signed out on every other device.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        {/* Lets password managers save the new password. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <PasswordField
          ref={input}
          id="new-password"
          label="New password"
          autoComplete="new-password"
          autoFocus
          hint={`At least ${PASSWORD_MIN} characters.`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          error={error}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <SubmitButton busy={busy} className="w-full">
          {busy ? "Saving password…" : "Save password and sign in"}
        </SubmitButton>
      </form>
    </>
  );
}

/** An expired, used or unknown link: say which, and offer the way forward. */
export function ResetLinkProblem({ message }: { message: string }) {
  return (
    <>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">This link can&apos;t be used</h1>
      <div className="mt-5">
        <Notice>{message}</Notice>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <a
          href="/forgot-password"
          className="inline-flex h-11 items-center justify-center rounded-full bg-basil px-5 text-[15px] font-semibold text-white transition-colors hover:bg-basil-dark"
        >
          Request a new link
        </a>
        <a href="/login" className="rounded text-[15px] font-semibold text-basil underline-offset-2 hover:underline">
          Back to sign in
        </a>
      </div>
    </>
  );
}
