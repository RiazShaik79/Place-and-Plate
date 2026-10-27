import { NextResponse } from "next/server";
import { removeFavorite } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await removeFavorite(user.id, id))) {
    return NextResponse.json({ error: "Favourite not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
