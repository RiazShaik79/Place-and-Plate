import { NextResponse } from "next/server";
import { getSleep, setSleep } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isClockTime, isQuality, SLEEP_DEFAULT_MINUTES, sleepMinutes, sleepProblem } from "@/lib/sleep";
import { ISO_DATE_RE, shiftDate, toISODate } from "@/lib/nutrition";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** GET ?date=YYYY-MM-DD (the day you woke up) → { sleep: { bed, wake, minutes, quality } | null, target } */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !ISO_DATE_RE.test(date)) return bad("Query param `date` must be YYYY-MM-DD");
  return NextResponse.json({ sleep: await getSleep(user.id, date), target: user.sleepTargetMin ?? SLEEP_DEFAULT_MINUTES });
}

/**
 * Body { date, bed: "HH:MM", wake: "HH:MM", quality: 1–5 | null } → { sleep }, or { date, clear: true }.
 * Minutes are worked out here (across midnight when wake ≤ bed) and must be 30 min to 16 h.
 */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { date, bed, wake, quality, clear } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return bad("Date must be YYYY-MM-DD");
  // The client sends its own local day; a day past tomorrow on the server's clock is never "today".
  if (date > shiftDate(toISODate(new Date()), 1)) return bad("You can't log sleep for a future day");
  if (clear === true) {
    await setSleep(user.id, date, null);
    return NextResponse.json({ sleep: null });
  }
  if (!isClockTime(bed) || !isClockTime(wake)) return bad("Bed and wake times must be HH:MM (24-hour)");
  const minutes = sleepMinutes(bed, wake);
  const problem = sleepProblem(minutes);
  if (problem) return bad(problem);
  if (quality !== null && quality !== undefined && !isQuality(quality)) return bad("Quality must be a whole number from 1 to 5");
  const sleep = { bed, wake, minutes: minutes!, quality: (quality as number | null | undefined) ?? null };
  await setSleep(user.id, date, sleep);
  return NextResponse.json({ sleep });
}
