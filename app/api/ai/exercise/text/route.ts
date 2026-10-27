import { NextResponse } from "next/server";
import { GeminiError } from "@/lib/gemini";
import { estimateExerciseFromText } from "@/lib/exercise-ai";
import { requireUser } from "@/lib/auth";
import { DEFAULT_WEIGHT_KG } from "@/lib/exercises";

const MAX_LENGTH = 500;

/** Body: { description } → ExerciseEstimate. Never writes to the DB. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let body: { description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "`description` is required" }, { status: 400 });
  }
  if (description.length > MAX_LENGTH) {
    return NextResponse.json({ error: `\`description\` must be at most ${MAX_LENGTH} characters` }, { status: 400 });
  }
  try {
    return NextResponse.json(await estimateExerciseFromText(description, user.weightKg ?? DEFAULT_WEIGHT_KG, user.weightKg === null));
  } catch (err) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
