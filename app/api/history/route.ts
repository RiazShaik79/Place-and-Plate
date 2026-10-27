import { NextResponse } from "next/server";
import { dailyTotals, getSettings } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { buildBuckets, isPeriod, rangeStart, todaySoFar } from "@/lib/history";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { WATER_DEFAULT_ML } from "@/lib/account";
import { SLEEP_DEFAULT_MINUTES } from "@/lib/sleep";
import type { History } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET ?period=day|week|month&end=YYYY-MM-DD (the client's today) → History.
 * 14 days, 12 weeks (Monday start) or 12 months, oldest first; the last bucket stops at `end`.
 * Today's food, steps and water come back separately in `today`, not in the buckets.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const params = new URL(req.url).searchParams;
  const period = params.get("period");
  const end = params.get("end");
  if (!isPeriod(period)) {
    return NextResponse.json({ error: "Query param `period` must be day, week or month" }, { status: 400 });
  }
  if (!end || !ISO_DATE_RE.test(end)) {
    return NextResponse.json({ error: "Query param `end` must be YYYY-MM-DD" }, { status: 400 });
  }
  const totals = await dailyTotals(user.id, rangeStart(period, end), end);
  const calorieGoal = (await getSettings(user.id)).calorieGoal;
  const history: History = {
    period,
    buckets: buildBuckets(period, end, totals, calorieGoal),
    calorieGoal,
    stepsTarget: user.stepsTarget,
    waterTarget: user.waterTargetMl ?? WATER_DEFAULT_ML,
    sleepTarget: user.sleepTargetMin ?? SLEEP_DEFAULT_MINUTES,
    today: todaySoFar(end, totals),
  };
  return NextResponse.json(history);
}
