import { NextResponse } from "next/server";
import { repeatEntries, type RepeatItem } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_SERVINGS, REPEAT_MAX_ITEMS } from "@/lib/foods";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { readJson } from "@/lib/http";
import { isMeal } from "@/lib/types";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const isId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/**
 * Add foods again: Body { date, meal, items: [{ entryId | favoriteId, servings? }] } (1–30 items)
 * → 201 { entries }. Nutrition is copied from the user's own rows, never taken from the client.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { date, meal, items } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return bad("Date must be YYYY-MM-DD");
  if (!isMeal(meal)) return bad("Meal must be breakfast, lunch, dinner or snack");
  if (!Array.isArray(items) || items.length === 0 || items.length > REPEAT_MAX_ITEMS) {
    return bad(`Items must be a list of 1 to ${REPEAT_MAX_ITEMS} foods`);
  }
  const parsed: RepeatItem[] = [];
  for (const raw of items) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const s = r.servings;
    if (s !== undefined && (typeof s !== "number" || !Number.isFinite(s) || s <= 0 || s > MAX_SERVINGS)) {
      return bad(`Servings must be a number between 0 and ${MAX_SERVINGS}`);
    }
    const servings = s as number | undefined;
    if (isId(r.entryId) && r.favoriteId === undefined) parsed.push({ entryId: r.entryId, servings });
    else if (isId(r.favoriteId) && r.entryId === undefined) parsed.push({ favoriteId: r.favoriteId, servings });
    else return bad("Each item needs one entryId or favoriteId");
  }
  const entries = await repeatEntries(user.id, parsed, date, meal);
  if (!entries) return NextResponse.json({ error: "One of those foods wasn't found" }, { status: 404 });
  return NextResponse.json({ entries }, { status: 201 });
}
