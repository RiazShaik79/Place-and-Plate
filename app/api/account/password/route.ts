import { NextResponse } from "next/server";
import { deleteOtherSessions, getPasswordHash, updatePasswordHash } from "@/lib/db";
import { currentSessionHash, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { validateNewPassword } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";

/** Body: { currentPassword, newPassword } → 204. Signs out every other device. */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const currentPassword = str(body.currentPassword);
  const newPassword = str(body.newPassword);
  if (!currentPassword) return fieldError("currentPassword", "Enter your current password.");
  const stored = await getPasswordHash(user.id);
  if (!stored || !(await verifyPassword(currentPassword, stored))) {
    return fieldError("currentPassword", "That isn't your current password.");
  }
  const passwordError = validateNewPassword(newPassword);
  if (passwordError) return fieldError("newPassword", passwordError);
  if (newPassword === currentPassword) return fieldError("newPassword", "Choose a password you aren't using now.");

  await updatePasswordHash(user.id, await hashPassword(newPassword));
  const keep = await currentSessionHash();
  if (keep) await deleteOtherSessions(user.id, keep);
  return new NextResponse(null, { status: 204 });
}
