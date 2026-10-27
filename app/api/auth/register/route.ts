import { NextResponse } from "next/server";
import { createUser } from "@/lib/db";
import { hashPassword, rememberOnDevice, startSession } from "@/lib/auth";
import { normalizeEmail, validateEmail, validateName, validateNewPassword } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";
import { sendVerificationLink } from "@/lib/verification";

/** Body: { name, email, password } → 201 { user } and a session cookie. */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const name = str(body.name).trim();
  const email = normalizeEmail(str(body.email));
  const password = str(body.password);

  const nameError = validateName(name);
  if (nameError) return fieldError("name", nameError);
  const emailError = validateEmail(email);
  if (emailError) return fieldError("email", emailError);
  const passwordError = validateNewPassword(password);
  if (passwordError) return fieldError("password", passwordError);

  const user = await createUser(email, name, await hashPassword(password));
  if (!user) return fieldError("email", "An account with this email already exists. Sign in instead.", 409);

  await startSession(user.id);
  await rememberOnDevice(user);
  await sendVerificationLink(req, user, user.email);
  return NextResponse.json({ user }, { status: 201 });
}
