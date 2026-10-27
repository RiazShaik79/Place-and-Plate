import { NextResponse } from "next/server";
import { deleteEntry, updateEntry } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_SERVINGS } from "@/lib/foods";
import { readJson } from "@/lib/http";
import { isMeal, type Meal } from "@/lib/types";

async function entryId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Body { servings?, meal? } → { entry }. Servings rescale calories and macros in proportion. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = await entryId(params);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { servings, meal } = body;
  if (servings === undefined && meal === undefined) {
    return NextResponse.json({ error: "Send servings and/or meal" }, { status: 400 });
  }
  if (servings !== undefined && (typeof servings !== "number" || !Number.isFinite(servings) || servings <= 0 || servings > MAX_SERVINGS)) {
    return NextResponse.json({ error: `Servings must be a number between 0 and ${MAX_SERVINGS}` }, { status: 400 });
  }
  if (meal !== undefined && !isMeal(meal)) {
    return NextResponse.json({ error: "Meal must be breakfast, lunch, dinner or snack" }, { status: 400 });
  }
  const entry = await updateEntry(user.id, id, { servings: servings as number | undefined, meal: meal as Meal | undefined });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = await entryId(params);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  if (!(await deleteEntry(user.id, id))) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
