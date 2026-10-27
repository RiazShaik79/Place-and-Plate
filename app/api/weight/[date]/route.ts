import { NextResponse } from "next/server";
import { deleteWeight } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ISO_DATE_RE } from "@/lib/nutrition";

export async function DELETE(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { date } = await params;
  if (!ISO_DATE_RE.test(date)) return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  if (!(await deleteWeight(user.id, date))) return NextResponse.json({ error: "No weigh-in on that day" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
