import { NextResponse } from "next/server";
import { addExercises, listExercise } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { caloriesBurned, DEFAULT_WEIGHT_KG, findExercise, MAX_MINUTES } from "@/lib/exercises";
import { ISO_DATE_RE } from "@/lib/nutrition";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD → { entries } */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Query param `date` must be YYYY-MM-DD" }, { status: 400 });
  }
  return NextResponse.json({ entries: await listExercise(user.id, date) });
}

/** Body: { exerciseId, minutes, date } → 201 { entry }. Calories are computed here from the user's weight. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let body: { exerciseId?: unknown; minutes?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const exercise = typeof body.exerciseId === "string" ? findExercise(body.exerciseId) : undefined;
  if (!exercise) return NextResponse.json({ error: "Unknown exercise" }, { status: 400 });
  const { minutes, date } = body;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    return NextResponse.json({ error: `Minutes must be a whole number from 1 to ${MAX_MINUTES}` }, { status: 400 });
  }
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }

  const weight = user.weightKg ?? DEFAULT_WEIGHT_KG;
  const [entry] = await addExercises(user.id, date, [
    {
      source: exercise.id,
      name: exercise.name,
      category: exercise.category,
      intensity: exercise.intensity,
      minutes,
      met: exercise.met,
      calories: caloriesBurned(exercise.met, weight, minutes),
    },
  ]);
  return NextResponse.json({ entry }, { status: 201 });
}
