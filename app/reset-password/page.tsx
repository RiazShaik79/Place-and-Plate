import type { Metadata } from "next";
import { findPasswordReset } from "@/lib/db";
import { resetTokenHash } from "@/lib/auth";
import { RESET_LINK_PROBLEMS } from "@/lib/account";
import AuthShell from "@/components/AuthShell";
import { ResetLinkProblem, ResetPasswordForm } from "@/components/PasswordResetForms";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Choose a new password, ${APP_NAME}` };

/** The link from the reset email. Checks the token up front so a dead link says so before any typing. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const lookup = typeof token === "string" && token ? await findPasswordReset(resetTokenHash(token)) : ({ status: "invalid" } as const);
  return (
    <AuthShell>
      {lookup.status === "valid" ? <ResetPasswordForm token={token!} /> : <ResetLinkProblem message={RESET_LINK_PROBLEMS[lookup.status]} />}
    </AuthShell>
  );
}
