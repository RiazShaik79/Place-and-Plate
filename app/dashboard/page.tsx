import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Dashboard from "@/components/Dashboard";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Dashboard, ${APP_NAME}` };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  return (
    <>
      <Header user={user} section="dashboard" />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8">
        <Dashboard />
      </main>
    </>
  );
}
