import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ExerciseTracker from "@/components/ExerciseTracker";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Activity, ${APP_NAME}` };

export default async function ExercisePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/exercise");
  const { date } = await searchParams;
  return (
    <>
      <Header user={user} section="exercise" />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8">
        <ExerciseTracker weightKg={user.weightKg} stepsTarget={user.stepsTarget} initialDate={typeof date === "string" ? date : undefined} />
      </main>
    </>
  );
}
