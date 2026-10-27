import { NextResponse } from "next/server";
import { addWater, getWater, setWater } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DAILY_WATER_MAX, WATER_ADD_MAX, WATER_DEFAULT_ML } from "@/lib/account";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const badDate = () => NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** GET ?date=YYYY-MM-DD → { ml: number | null, target: number } (target falls back to 2,000 ml) */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !ISO_DATE_RE.test(date)) return badDate();
  return NextResponse.json({ ml: await getWater(user.id, date), target: user.waterTargetMl ?? WATER_DEFAULT_ML });
}

/** Body: { date, add } (whole ml, ±1 to ±2,000; negative undoes an add) → { ml } (the new total) */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { date, add } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return badDate();
  if (!isWhole(add) || add === 0 || Math.abs(add) > WATER_ADD_MAX) {
    return NextResponse.json({ error: `Add must be a whole number of ml from -${WATER_ADD_MAX} to ${WATER_ADD_MAX}, not 0` }, { status: 400 });
  }
  return NextResponse.json({ ml: await addWater(user.id, date, add) });
}

/** Body: { date, ml } (whole number 0–10,000, or null to clear) → { ml } */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { date, ml } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return badDate();
  if (ml !== null && (!isWhole(ml) || ml < 0 || ml > DAILY_WATER_MAX)) {
    return NextResponse.json({ error: `Water must be a whole number of ml from 0 to ${DAILY_WATER_MAX.toLocaleString("en-US")}` }, { status: 400 });
  }
  await setWater(user.id, date, ml as number | null);
  return NextResponse.json({ ml });
}
