import { NextResponse } from "next/server";
import { addFavorite } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Star the food of one of your entries. Body { entryId } → { favorite } (starring twice is a no-op). */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { entryId } = body;
  if (typeof entryId !== "number" || !Number.isInteger(entryId) || entryId <= 0) {
    return NextResponse.json({ error: "entryId must be a positive whole number" }, { status: 400 });
  }
  const favorite = await addFavorite(user.id, entryId);
  if (!favorite) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  return NextResponse.json({ favorite });
}
