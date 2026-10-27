import { NextResponse } from "next/server";
import { estimateFromText, GeminiError } from "@/lib/gemini";
import { requireUser } from "@/lib/auth";

const MAX_LENGTH = 500;

export async function POST(req: Request) {
  // Signed-in users only, so the Gemini quota can't be spent by anyone who finds the URL.
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
    return NextResponse.json(await estimateFromText(description));
  } catch (err) {
    if (err instanceof GeminiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
