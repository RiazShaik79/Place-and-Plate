import { NextResponse } from "next/server";
import { addCustomEntries } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { isMeal, type AiSource, type NutritionItem } from "@/lib/types";

const MAX_ITEMS = 20;

/** Logs user-confirmed AI estimates. Body: { date, meal, source: "text" | "photo", items: NutritionItem[] } */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let body: { date?: unknown; meal?: unknown; source?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { date, meal, source, items } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!isMeal(meal)) {
    return NextResponse.json({ error: "Meal must be breakfast, lunch, dinner or snack" }, { status: 400 });
  }
  if (source !== "text" && source !== "photo") {
    return NextResponse.json({ error: "Source must be 'text' or 'photo'" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Items must be a list of 1 to ${MAX_ITEMS} foods` }, { status: 400 });
  }

  const parsed: NutritionItem[] = [];
  for (const raw of items) {
    const item = parseItem(raw);
    if (!item) return NextResponse.json({ error: "Each item needs a name and valid nutrition numbers" }, { status: 400 });
    parsed.push(item);
  }

  return NextResponse.json({ entries: await addCustomEntries(user.id, parsed, source as AiSource, date, meal) }, { status: 201 });
}

function parseItem(raw: unknown): NutritionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const portion = typeof r.portion === "string" ? r.portion.trim() : "";
  if (!name || name.length > 100 || portion.length > 60) return null;

  const inRange = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  if (!inRange(r.calories, 10_000) || !inRange(r.protein, 1_000) || !inRange(r.carbs, 1_000) || !inRange(r.fat, 1_000)) {
    return null;
  }
  return {
    name,
    portion,
    calories: r.calories as number,
    protein: r.protein as number,
    carbs: r.carbs as number,
    fat: r.fat as number,
  };
}
