import { NextResponse } from "next/server";
import { GeminiError } from "@/lib/gemini";
import { estimateExerciseFromImage } from "@/lib/exercise-ai";
import { requireUser } from "@/lib/auth";
import { DEFAULT_WEIGHT_KG } from "@/lib/exercises";
import { readImageForm } from "@/lib/http";

/** multipart/form-data { image, hint? } → ExerciseEstimate. Never writes to the DB. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const form = await readImageForm(req);
  if (form instanceof NextResponse) return form;
  try {
    return NextResponse.json(
      await estimateExerciseFromImage(form.base64, form.mimeType, form.hint, user.weightKg ?? DEFAULT_WEIGHT_KG, user.weightKg === null),
    );
  } catch (err) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
