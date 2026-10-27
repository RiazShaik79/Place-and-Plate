import { NextResponse } from "next/server";
import { addEntry, listEntries } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { findFood } from "@/lib/foods";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { isMeal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Query param `date` must be YYYY-MM-DD" }, { status: 400 });
  }
  return NextResponse.json({ entries: await listEntries(user.id, date) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let body: { foodId?: unknown; servings?: unknown; date?: unknown; meal?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { foodId, servings, date, meal } = body;
  const food = typeof foodId === "string" ? findFood(foodId) : undefined;
  if (!food) {
    return NextResponse.json({ error: "Unknown food" }, { status: 400 });
  }
  if (typeof servings !== "number" || !Number.isFinite(servings) || servings <= 0 || servings > 100) {
    return NextResponse.json({ error: "Servings must be a number between 0 and 100" }, { status: 400 });
  }
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!isMeal(meal)) {
    return NextResponse.json({ error: "Meal must be breakfast, lunch, dinner or snack" }, { status: 400 });
  }

  return NextResponse.json({ entry: await addEntry(user.id, food, servings, date, meal) }, { status: 201 });
}
