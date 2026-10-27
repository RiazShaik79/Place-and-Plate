"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeEmail, PASSWORD_MIN, validateEmail, validateName, validateNewPassword } from "@/lib/account";
import { apiFetch, readFieldError, signOut, toFriendlyMessage } from "@/lib/client";
import type { User } from "@/lib/types";
import AddressSection from "./AddressSection";
import BodyGoalsSection from "./BodyGoalsSection";
import { PasswordField, SubmitButton, TextField } from "./FormField";
import { SignOut } from "./Icons";
import Notice from "./Notice";
import ResendVerification from "./ResendVerification";
import { SavedNote, Section, useFlash } from "./SettingsSection";
import Spinner from "./Spinner";
import { Avatar } from "./UserMenu";

const UNREACHABLE = "Couldn't reach the app. Check that it's still running, then try again.";

/** Account page body: profile, body and goals, address, password and sign out, each in its own panel. */
export default function AccountSettings({ user, goal, placesEnabled }: { user: User; goal: number; placesEnabled: boolean }) {
  return (
    <div className="mt-8 space-y-5 sm:space-y-6">
      <ProfileSection user={user} />
      <BodyGoalsSection user={user} goal={goal} />
      <AddressSection address={user.address} placesEnabled={placesEnabled} />
      <PasswordSection />
      <SignOutSection email={user.email} />
    </div>
  );
}

type ProfileErrors = { name?: string; email?: string };

function ProfileSection({ user }: { user: User }) {
  const router = useRouter();
  const [saved, setSaved] = useState({ name: user.name, email: user.email });
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, showFlash, clearFlash] = useFlash(6000);
  const [verified, setVerified] = useState(user.emailVerified);
  const [pending, setPending] = useState<string | null>(user.pendingEmail);
  const [cancelling, setCancelling] = useState(false);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null) };
  const dirty = name.trim() !== saved.name || normalizeEmail(email) !== saved.email;

  async function cancelChange() {
    setCancelling(true);
    try {
      const res = await apiFetch("/api/account/pending-email", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPending(null);
      showFlash("Email change cancelled");
    } catch {
      setFormError("Couldn't cancel the email change. Try again.");
    } finally {
      setCancelling(false);
    }
  }

  function showErrors(found: ProfileErrors) {
    setErrors(found);
    const first = (["name", "email"] as const).find((f) => found[f]);
    if (first) refs[first].current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    clearFlash();
    setFormError(null);
    const found: ProfileErrors = {};
    const n = validateName(name);
    if (n) found.name = n;
    const em = validateEmail(email);
    if (em) found.email = em;
    if (Object.keys(found).length > 0) return showErrors(found);

    setBusy(true);
    try {
      const res = await apiFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        const { message, field } = await readFieldError(res);
        if (field === "name" || field === "email") showErrors({ [field]: message });
        else setFormError(message);
        return;
      }
      const { user: updated } = (await res.json()) as { user: User };
      const startedChange = updated.pendingEmail && updated.pendingEmail !== pending;
      setName(updated.name);
      setEmail(updated.email); // the sign-in email only changes once the new one is confirmed
      setSaved({ name: updated.name, email: updated.email });
      setPending(updated.pendingEmail);
      setVerified(updated.emailVerified);
      showFlash(startedChange ? "Confirmation link sent" : "Changes saved");
      router.refresh(); // the header shows the new name and initials
    } catch (err) {
      setFormError(err instanceof TypeError ? UNREACHABLE : toFriendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <Section title="Profile" description="Your name and the email you sign in with.">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={name.trim() || saved.name} className="h-14 w-14 text-xl" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold">{saved.name}</p>
          <p className="text-sm text-muted">Member since {memberSince}</p>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="space-y-5">
        <TextField
          ref={refs.name}
          id="profile-name"
          label="Name"
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((p) => ({ ...p, name: undefined }));
          }}
          error={errors.name}
        />
        <TextField
          ref={refs.email}
          id="profile-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          hint={verified ? "Confirmed. You use this to sign in." : undefined}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((p) => ({ ...p, email: undefined }));
          }}
          error={errors.email}
        />
        {!verified && !pending && !errors.email && (
          <p className="-mt-3 text-sm text-[#7a5408]">
            Not confirmed yet. Open the link we sent to this address, or <ResendVerification label="send a new one" />.
          </p>
        )}
        {pending && (
          <div className="rounded-card bg-sunken px-3.5 py-3 text-sm text-muted" role="status">
            <p>
              Waiting for you to confirm <span className="font-semibold break-words text-ink">{pending}</span>. You keep signing in
              with <span className="font-semibold break-words text-ink">{saved.email}</span> until you open the link we sent there.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-basil">
              <ResendVerification />
              <button
                type="button"
                onClick={cancelChange}
                disabled={cancelling}
                className="font-semibold text-muted underline underline-offset-2 hover:text-over hover:no-underline disabled:opacity-60"
              >
                {cancelling ? "Cancelling…" : "Cancel the change"}
              </button>
            </p>
          </div>
        )}
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton busy={busy} disabled={!dirty}>
            {busy ? "Saving…" : "Save changes"}
          </SubmitButton>
          {flash && <SavedNote text={flash} />}
        </div>
      </form>
    </Section>
  );
}

type PasswordErrors = { currentPassword?: string; newPassword?: string };

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, showFlash, clearFlash] = useFlash(6000);
  const refs = { currentPassword: useRef<HTMLInputElement>(null), newPassword: useRef<HTMLInputElement>(null) };

  function showErrors(found: PasswordErrors) {
    setErrors(found);
    const first = (["currentPassword", "newPassword"] as const).find((f) => found[f]);
    if (first) refs[first].current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    clearFlash();
    setFormError(null);
    const found: PasswordErrors = {};
    if (!current) found.currentPassword = "Enter your current password.";
    const n = validateNewPassword(next);
    if (n) found.newPassword = n;
    if (Object.keys(found).length > 0) return showErrors(found);

    setBusy(true);
    try {
      const res = await apiFetch("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const { message, field } = await readFieldError(res);
        if (field === "currentPassword" || field === "newPassword") showErrors({ [field]: message });
        else setFormError(message);
        return;
      }
      setCurrent("");
      setNext("");
      setErrors({});
      showFlash("Password changed. Any other devices were signed out.");
    } catch (err) {
      setFormError(
        err instanceof TypeError ? UNREACHABLE : toFriendlyMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Password" description="Changing it signs you out everywhere except here.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {/* Lets password managers attach the new password to the right account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <PasswordField
          ref={refs.currentPassword}
          id="current-password"
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setErrors((p) => ({ ...p, currentPassword: undefined }));
          }}
          error={errors.currentPassword}
        />
        <PasswordField
          ref={refs.newPassword}
          id="new-password"
          label="New password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setErrors((p) => ({ ...p, newPassword: undefined }));
          }}
          error={errors.newPassword}
        />
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton busy={busy}>{busy ? "Changing password…" : "Change password"}</SubmitButton>
          {flash && <SavedNote text={flash} />}
        </div>
      </form>
    </Section>
  );
}

function SignOutSection({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(toFriendlyMessage(err));
      setBusy(false);
    }
  }

  // One action, so one row rather than the two-column layout of the forms above.
  return (
    <section aria-labelledby="section-sign-out" className="rounded-panel bg-surface p-5 ring-1 ring-line sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h2 id="section-sign-out" className="text-lg font-bold">
            Sign out
          </h2>
          <p className="mt-1 text-sm text-muted">
            You&apos;re signed in as <span className="font-semibold break-words text-ink">{email}</span>. Your log stays saved
            for next time.
          </p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full border border-line px-5 text-[15px] font-semibold text-ink transition-colors hover:border-over/40 hover:bg-over-soft hover:text-over disabled:opacity-60 sm:self-center"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <SignOut className="h-[18px] w-[18px]" />}
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </section>
  );
}
