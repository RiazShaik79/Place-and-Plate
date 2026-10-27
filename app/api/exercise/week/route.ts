import { NextResponse } from "next/server";
import { exerciseTotalsByDay } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ISO_DATE_RE, shiftDate } from "@/lib/nutrition";
import type { ExerciseDay } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET ?end=YYYY-MM-DD → { days }: the 7 days ending on `end`, oldest first, zeros included. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const end = new URL(req.url).searchParams.get("end");
  if (!end || !ISO_DATE_RE.test(end)) {
    return NextResponse.json({ error: "Query param `end` must be YYYY-MM-DD" }, { status: 400 });
  }
  const start = shiftDate(end, -6);
  const found = new Map((await exerciseTotalsByDay(user.id, start, end)).map((d) => [d.date, d]));
  const days: ExerciseDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(start, i);
    const d = found.get(date);
    return { date, minutes: Math.round(d?.minutes ?? 0), calories: Math.round(d?.calories ?? 0) };
  });
  return NextResponse.json({ days });
}
