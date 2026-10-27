"use client";

import { useRef, useState } from "react";
import {
  firstName,
  PASSWORD_MIN,
  HOME_PATH,
  safeNextPath,
  validateEmail,
  validateName,
  validateNewPassword,
  type AccountField,
} from "@/lib/account";
import { readFieldError, setFlash } from "@/lib/client";
import { PasswordField, SubmitButton, TextField } from "./FormField";
import Notice from "./Notice";
import { Check } from "./Icons";
import { APP_NAME } from "@/lib/brand";

type Mode = "login" | "register";
type Errors = Partial<Record<AccountField, string>>;

const COPY: Record<Mode, { title: string; intro: string; submit: string; busy: string }> = {
  login: {
    title: "Sign in",
    intro: "Pick up your meals and workouts where you left off.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  register: {
    title: "Create your account",
    intro: "Log what you eat and how you move, and see each day add up against your goal.",
    submit: "Create account",
    busy: "Creating account…",
  },
};

interface Props {
  mode: Mode;
  next?: string;
  /** Why the user landed here: their session ended, or they just signed out. */
  reason?: "expired" | "signedout";
  /** Sign-in only: the person remembered on this browser ("Keep me signed in" last time). */
  remembered?: { email: string; name: string } | null;
}

export default function AuthForm({ mode, next, reason, remembered: rememberedOnDevice = null }: Props) {
  const [remembered, setRemembered] = useState(mode === "login" ? rememberedOnDevice : null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(remembered?.email ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };
  const copy = COPY[mode];
  const destination = safeNextPath(next, mode === "register" ? "/" : HOME_PATH);
  const nextQuery = next ? `?next=${encodeURIComponent(destination)}` : "";

  function validate(): Errors {
    const found: Errors = {};
    if (mode === "register") {
      const n = validateName(name);
      if (n) found.name = n;
    }
    const e = validateEmail(email);
    if (e) found.email = e;
    if (mode === "register") {
      const p = validateNewPassword(password);
      if (p) found.password = p;
    } else if (!password) {
      found.password = "Enter your password.";
    }
    return found;
  }

  function focusFirst(found: Errors) {
    const order = ["name", "email", "password"] as const;
    const first = order.find((f) => found[f]);
    if (first) refs[first].current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password, remember }),
      });
      if (res.ok) {
        // The next page greets a new account once.
        if (mode === "register") setFlash(`Welcome, ${firstName(name)}. Log your first meal below.`);
        // A full navigation so the server renders the app with the new session cookie.
        window.location.assign(destination);
        return; // keep the busy state until the page changes
      }
      const { message, field } = await readFieldError(res);
      if (field === "name" || field === "email" || field === "password") {
        setErrors({ [field]: message });
        focusFirst({ [field]: message });
      } else {
        setFormError(message);
      }
    } catch {
      setFormError("Couldn't reach the app. Check that it's still running, then try again.");
    }
    setBusy(false);
  }

  // "Not you?": forget the remembered person on this browser and show the blank form.
  async function switchAccount() {
    setRemembered(null);
    setEmail("");
    setPassword("");
    setErrors({});
    fetch("/api/auth/forget-device", { method: "POST" }).catch(() => {});
    requestAnimationFrame(() => refs.email.current?.focus());
  }

  const clearError = (field: AccountField) => errors[field] && setErrors((prev) => ({ ...prev, [field]: undefined }));

  return (
    <>
      {reason === "expired" && (
        <div className="mb-6">
          <Notice>Your session ended. Sign in again to continue.</Notice>
        </div>
      )}
      {reason === "signedout" && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-card bg-basil-soft px-3.5 py-3 text-sm text-basil-dark">
          <Check className="h-[18px] w-[18px] shrink-0" />
          <span>
            You&apos;ve signed out.{" "}
            {remembered && "Next time, close the tab instead to stay signed in."}
          </span>
        </p>
      )}

      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">
        {remembered ? `Welcome back, ${firstName(remembered.name)}` : copy.title}
      </h1>
      {remembered ? (
        <p className="mt-2 text-[15px] text-muted">
          Enter your password to continue.{" "}
          <button
            type="button"
            onClick={switchAccount}
            className="rounded font-semibold text-basil underline-offset-2 hover:underline"
          >
            Not {firstName(remembered.name)}?
          </button>
        </p>
      ) : (
        <p className="mt-2 text-[15px] text-muted">{copy.intro}</p>
      )}

      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        {mode === "register" && (
          <TextField
            ref={refs.name}
            id="name"
            label="Name"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
            }}
            error={errors.name}
          />
        )}
        <TextField
          ref={refs.email}
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={mode === "login" && !remembered}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearError("email");
          }}
          error={errors.email}
        />
        <PasswordField
          ref={refs.password}
          id="password"
          label="Password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          autoFocus={!!remembered}
          aside={
            mode === "login" && (
              <a
                href={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
                className="rounded text-sm font-semibold text-basil underline-offset-2 hover:underline"
              >
                Forgot password?
              </a>
            )
          }
          hint={mode === "register" ? `At least ${PASSWORD_MIN} characters.` : undefined}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearError("password");
          }}
          error={errors.password}
        />

        {mode === "login" && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              aria-describedby="remember-hint"
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-basil ${
                remember ? "border-basil bg-basil text-white" : "border-[#b9c4bc] bg-surface"
              }`}
            >
              {remember && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">Keep me signed in</span>
              <span id="remember-hint" className="block text-sm text-muted">
                {remember
                  ? "Stay signed in on this device until you sign out."
                  : "You'll be signed out when you close the browser."}
              </span>
            </span>
          </label>
        )}

        {formError && <Notice tone="error">{formError}</Notice>}

        <SubmitButton busy={busy} className="w-full">
          {busy ? copy.busy : copy.submit}
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[15px] text-muted">
        {mode === "login" ? (
          <>
            New to {APP_NAME}?{" "}
            <a href={`/register${nextQuery}`} className="rounded font-semibold text-basil underline-offset-2 hover:underline">
              Create an account
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a href={`/login${nextQuery}`} className="rounded font-semibold text-basil underline-offset-2 hover:underline">
              Sign in
            </a>
          </>
        )}
      </p>
    </>
  );
}
