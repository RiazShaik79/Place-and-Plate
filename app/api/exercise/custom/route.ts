import { NextResponse } from "next/server";
import { addExercises, type NewExercise } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_MET, MAX_MINUTES, MIN_MET } from "@/lib/exercises";
import { ISO_DATE_RE } from "@/lib/nutrition";
import { isCategory, isIntensity } from "@/lib/types";

const MAX_ITEMS = 10;

/** Logs user-confirmed AI estimates. Body: { date, source: "text" | "photo", items: ExerciseItem[] } */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let body: { date?: unknown; source?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { date, source, items } = body;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (source !== "text" && source !== "photo") {
    return NextResponse.json({ error: "Source must be 'text' or 'photo'" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Items must be a list of 1 to ${MAX_ITEMS} activities` }, { status: 400 });
  }
  const parsed: NewExercise[] = [];
  for (const raw of items) {
    const item = parseItem(raw, `ai:${source}`);
    if (!item) return NextResponse.json({ error: "Each item needs a name and valid exercise numbers" }, { status: 400 });
    parsed.push(item);
  }
  return NextResponse.json({ entries: await addExercises(user.id, date, parsed) }, { status: 201 });
}

function parseItem(raw: unknown, source: string): NewExercise | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name || name.length > 100 || !isCategory(r.category) || !isIntensity(r.intensity)) return null;
  const inRange = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (!inRange(r.minutes, 1, MAX_MINUTES) || !inRange(r.met, MIN_MET, MAX_MET) || !inRange(r.calories, 0, 5000)) return null;
  return {
    source,
    name,
    category: r.category,
    intensity: r.intensity,
    minutes: Math.round(r.minutes as number),
    met: r.met as number,
    calories: Math.round(r.calories as number),
  };
}
