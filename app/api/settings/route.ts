import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_GOAL, MIN_GOAL } from "@/lib/nutrition";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ settings: await getSettings(user.id) });
}

/** Body: { calorieGoal: number } (whole kcal, 800–6000) */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let body: { calorieGoal?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const goal = body.calorieGoal;
  if (typeof goal !== "number" || !Number.isInteger(goal) || goal < MIN_GOAL || goal > MAX_GOAL) {
    return NextResponse.json({ error: `calorieGoal must be a whole number from ${MIN_GOAL} to ${MAX_GOAL}` }, { status: 400 });
  }
  return NextResponse.json({ settings: await saveSettings(user.id, { calorieGoal: goal }) });
}
