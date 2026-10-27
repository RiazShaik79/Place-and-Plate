import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, getDeviceUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/account";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Sign in to ${APP_NAME}` };

type SearchParams = Promise<{ next?: string; expired?: string; signedout?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, expired, signedout } = await searchParams;
  if (await getCurrentUser()) redirect(safeNextPath(next));
  const reason = expired ? "expired" : signedout ? "signedout" : undefined;
  return (
    <AuthShell>
      <AuthForm mode="login" next={next} reason={reason} remembered={await getDeviceUser()} />
    </AuthShell>
  );
}
