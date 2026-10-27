import { NextResponse } from "next/server";
import { estimateFromImage, GeminiError } from "@/lib/gemini";
import { requireUser } from "@/lib/auth";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_BYTES = 10 * 1024 * 1024; // Gemini inline requests are capped at 20 MB; base64 adds ~33%.
const MAX_HINT_LENGTH = 300;

export async function POST(req: Request) {
  // Signed-in users only, so the Gemini quota can't be spent by anyone who finds the URL.
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with an `image` field" }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "`image` file is required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return NextResponse.json({ error: "Image must be JPEG, PNG, WebP or HEIC" }, { status: 415 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 10 MB or smaller" }, { status: 413 });
  }

  const hintField = form.get("hint");
  const hint = typeof hintField === "string" ? hintField.trim().slice(0, MAX_HINT_LENGTH) : undefined;

  try {
    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    return NextResponse.json(await estimateFromImage(base64, image.type, hint || undefined));
  } catch (err) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
