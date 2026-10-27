import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import AccountSettings from "@/components/AccountSettings";
import { ChevronLeft } from "@/components/Icons";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { placesConfigured } from "@/lib/places";
import { APP_NAME } from "@/lib/brand";
import { HOME_PATH } from "@/lib/account";

export const metadata: Metadata = { title: `Account settings, ${APP_NAME}` };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8">
        <a
          href={HOME_PATH}
          className="-ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to dashboard
        </a>
        <h1 className="mt-3 text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">Account settings</h1>
        <p className="mt-1.5 text-[15px] text-muted">Your details, daily targets, address and password.</p>
        <AccountSettings user={user} goal={(await getSettings(user.id)).calorieGoal} placesEnabled={placesConfigured()} />
      </main>
    </>
  );
}
