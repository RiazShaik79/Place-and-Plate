import { NextResponse } from "next/server";
import { getSteps, setSteps } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DAILY_STEPS_MAX } from "@/lib/account";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD → { steps: number | null, target: number | null } */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Query param `date` must be YYYY-MM-DD" }, { status: 400 });
  }
  return NextResponse.json({ steps: await getSteps(user.id, date), target: user.stepsTarget });
}

/** Body: { date, steps } (whole number 0–100,000, or null to clear) → { steps } */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { date, steps } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (steps !== null && (typeof steps !== "number" || !Number.isInteger(steps) || steps < 0 || steps > DAILY_STEPS_MAX)) {
    return NextResponse.json({ error: `Steps must be a whole number from 0 to ${DAILY_STEPS_MAX.toLocaleString("en-US")}` }, { status: 400 });
  }
  await setSteps(user.id, date, steps as number | null);
  return NextResponse.json({ steps });
}
