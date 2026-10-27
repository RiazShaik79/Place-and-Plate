import { NextResponse } from "next/server";
import { isEmailTaken, setPendingEmail, updateProfile } from "@/lib/db";
import { getDeviceUser, rememberOnDevice, requireUser } from "@/lib/auth";
import { normalizeEmail, validateEmail, validateName, validateWeight } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";
import { sendVerificationLink } from "@/lib/verification";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user });
}

/**
 * Body: { name, email, weightKg? } → { user }. Name and weight change at once. A different email
 * doesn't: it becomes `pendingEmail` and a confirmation link goes to it; the sign-in email only
 * changes when that link is opened. weightKg: number (kg) or null to clear; omitted keeps it.
 */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const name = str(body.name).trim();
  const email = normalizeEmail(str(body.email));
  const nameError = validateName(name);
  if (nameError) return fieldError("name", nameError);
  const emailError = validateEmail(email);
  if (emailError) return fieldError("email", emailError);
  let weightKg = user.weightKg;
  if ("weightKg" in body) {
    if (body.weightKg === null || body.weightKg === "") weightKg = null;
    else {
      const weightError = validateWeight(body.weightKg);
      if (weightError) return fieldError("weightKg", weightError);
      weightKg = Math.round(Number(body.weightKg) * 10) / 10;
    }
  }
  if (email !== user.email && await isEmailTaken(email, user.id)) {
    return fieldError("email", "Another account already uses this email.", 409);
  }

  let updated = await updateProfile(user.id, name, weightKg);
  if (updated && email !== user.email && email !== user.pendingEmail) {
    updated = await setPendingEmail(user.id, email);
    if (updated) await sendVerificationLink(req, updated, email);
  }
  // Keep the sign-in page's "Welcome back" in step with the new name.
  if (updated && (await getDeviceUser())?.email === user.email) await rememberOnDevice(updated);
  return NextResponse.json({ user: updated });
}
