import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/account";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Create your ${APP_NAME} account` };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNextPath(next));
  return (
    <AuthShell>
      <AuthForm mode="register" next={next} />
    </AuthShell>
  );
}
