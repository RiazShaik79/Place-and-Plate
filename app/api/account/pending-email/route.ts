import { NextResponse } from "next/server";
import { setPendingEmail } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Cancel an email change that hasn't been confirmed; its links stop working. → { user } */
export async function DELETE() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user: await setPendingEmail(user.id, null) });
}
