import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { HOME_PATH } from "@/lib/account";
import { APP_NAME } from "@/lib/brand";
import AuthShell from "@/components/AuthShell";
import Notice from "@/components/Notice";
import ResendVerification from "@/components/ResendVerification";
import { Check } from "@/components/Icons";

export const metadata: Metadata = { title: `Confirm your email, ${APP_NAME}` };

type Status = "verified" | "changed" | "expired" | "used" | "invalid" | "taken";

const PROBLEMS: Record<Exclude<Status, "verified" | "changed">, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "Confirmation links work for 24 hours." },
  used: { title: "This link has already been used", body: "Each confirmation link works once." },
  invalid: { title: "This link can't be used", body: "It may be incomplete, or the email change it was for was cancelled or replaced." },
  taken: { title: "That email is now used by another account", body: "Your sign-in email hasn't changed. Choose a different address in account settings." },
};

/** Where a confirmation link lands (via /api/auth/verify-email): says what happened and what's next. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const raw = (await searchParams).status;
  const status: Status = raw && ["verified", "changed", "expired", "used", "invalid", "taken"].includes(raw) ? (raw as Status) : "invalid";
  const user = await getCurrentUser();
  const primary = (href: string, text: string) => (
    <a href={href} className="inline-flex h-11 items-center justify-center rounded-full bg-basil px-5 text-[15px] font-semibold text-white transition-colors hover:bg-basil-dark">
      {text}
    </a>
  );
  const onwards = user ? primary(HOME_PATH, "Go to your dashboard") : primary("/login", "Sign in");

  if (status === "verified" || status === "changed") {
    return (
      <AuthShell>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-basil-soft text-basil">
          <Check className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">
          {status === "verified" ? "Email confirmed" : "Email address updated"}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          {status === "verified" ? (
            "Thanks. Your email address is confirmed."
          ) : user ? (
            <>
              Sign in with <span className="font-semibold break-words text-ink">{user.email}</span> from now on.
            </>
          ) : (
            "Sign in with your new email address from now on."
          )}
        </p>
        <div className="mt-8">{onwards}</div>
      </AuthShell>
    );
  }

  const problem = PROBLEMS[status];
  // A used link for an already-confirmed address isn't really a problem.
  const alreadyDone = status === "used" && user?.emailVerified && !user.pendingEmail;
  const canResend = user && (user.pendingEmail || !user.emailVerified) && status !== "taken";

  return (
    <AuthShell>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{alreadyDone ? "Email already confirmed" : problem.title}</h1>
      <div className="mt-5">
        <Notice>{alreadyDone ? "This link was used before. Your email address is confirmed, so there's nothing else to do." : problem.body}</Notice>
      </div>
      {canResend && (
        <p className="mt-5 text-[15px] text-muted">
          Need a new one? <ResendVerification className="text-basil" label="Send a new link" />
        </p>
      )}
      {!user && status !== "taken" && <p className="mt-5 text-[15px] text-muted">Sign in to send yourself a new link.</p>}
      <div className="mt-8">{onwards}</div>
    </AuthShell>
  );
}
