import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import { ForgotPasswordForm } from "@/components/PasswordResetForms";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Reset your password, ${APP_NAME}` };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  // Signed in already: changing the password lives on the account page.
  if (await getCurrentUser()) redirect("/account");
  const { email } = await searchParams;
  return (
    <AuthShell>
      <ForgotPasswordForm initialEmail={typeof email === "string" ? email.slice(0, 254) : ""} />
    </AuthShell>
  );
}
