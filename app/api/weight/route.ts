import { NextResponse } from "next/server";
import { listWeights, logWeight, weightBefore } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { WEIGHT_MAX, WEIGHT_MIN } from "@/lib/account";
import { ISO_DATE_RE, shiftDate, toISODate } from "@/lib/nutrition";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → { entries: [{date, kg}], before: {date, kg} | null,
 * goalKg, weeklyChangeKg }. `before` is the weigh-in just before `from`, to start the trend from.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const params = new URL(req.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to || !ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) {
    return bad("Query params `from` and `to` must be YYYY-MM-DD, from ≤ to");
  }
  const [entries, before] = await Promise.all([listWeights(user.id, from, to), weightBefore(user.id, from)]);
  return NextResponse.json({ entries, before, goalKg: user.goalWeightKg, weeklyChangeKg: user.weeklyChangeKg });
}

/** Body { date, kg } → { date, kg }. Replaces that day's weigh-in; the newest becomes the current weight. */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { date, kg } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return bad("Date must be YYYY-MM-DD");
  // The client sends its own local day; a day past tomorrow on the server's clock is never "today".
  if (date > shiftDate(toISODate(new Date()), 1)) return bad("You can't log a weight for a future day");
  if (typeof kg !== "number" || !Number.isFinite(kg) || kg < WEIGHT_MIN || kg > WEIGHT_MAX) {
    return bad(`Weight must be from ${WEIGHT_MIN} to ${WEIGHT_MAX} kg`);
  }
  const rounded = Math.round(kg * 10) / 10;
  await logWeight(user.id, date, rounded);
  return NextResponse.json({ date, kg: rounded });
}
