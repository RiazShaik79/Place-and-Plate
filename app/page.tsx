import { redirect } from "next/navigation";
import CalorieTracker from "@/components/CalorieTracker";
import Header from "@/components/Header";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, hasLoggedFood } from "@/lib/db";
import { WATER_DEFAULT_ML } from "@/lib/account";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Header user={user} section="food" />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8">
        <CalorieTracker
          initialGoal={(await getSettings(user.id)).calorieGoal}
          waterTarget={user.waterTargetMl ?? WATER_DEFAULT_ML}
          hasHistory={await hasLoggedFood(user.id)}
        />
      </main>
    </>
  );
}
