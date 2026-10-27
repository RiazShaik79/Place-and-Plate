// Small helpers shared by the auth/account route handlers.
import { NextResponse } from "next/server";
import type { AccountField } from "./account";

/** Parse a JSON object body, or return a 400 response. */
export async function readJson(req: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}

/** An error the form shows under one field: `{ error, field }`. */
export function fieldError(field: AccountField, message: string, status = 400) {
  return NextResponse.json({ error: message, field }, { status });
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // Gemini inline requests are capped at 20 MB; base64 adds ~33%.
const MAX_HINT_LENGTH = 300;

/** Parse multipart { image, hint? } for the AI photo routes, or return a 400/413/415 response. */
export async function readImageForm(req: Request): Promise<{ base64: string; mimeType: string; hint?: string } | NextResponse> {
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
  if (!IMAGE_TYPES.has(image.type)) {
    return NextResponse.json({ error: "Image must be JPEG, PNG, WebP or HEIC" }, { status: 415 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 10 MB or smaller" }, { status: 413 });
  }
  const hintField = form.get("hint");
  const hint = typeof hintField === "string" ? hintField.trim().slice(0, MAX_HINT_LENGTH) : "";
  return { base64: Buffer.from(await image.arrayBuffer()).toString("base64"), mimeType: image.type, hint: hint || undefined };
}
