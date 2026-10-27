import { NextResponse } from "next/server";
import { findUserForLogin } from "@/lib/db";
import {
  clearLoginFailures,
  dummyPasswordHash,
  forgetOnDevice,
  lockoutMinutes,
  recordLoginFailure,
  rememberOnDevice,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { normalizeEmail } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";

/** Body: { email, password, remember? } → { user } and a session cookie (persistent unless remember is false). */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const email = normalizeEmail(str(body.email));
  const password = str(body.password);
  if (!email) return fieldError("email", "Enter your email address.");
  if (!password) return fieldError("password", "Enter your password.");

  const wait = lockoutMinutes(email);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${wait} ${wait === 1 ? "minute" : "minutes"}.` },
      { status: 429 },
    );
  }

  const found = await findUserForLogin(email);
  // Verify against a dummy hash for unknown emails so both cases take the same time.
  const ok = await verifyPassword(password, found?.passwordHash ?? (await dummyPasswordHash()));
  if (!found || !ok) {
    recordLoginFailure(email);
    return NextResponse.json({ error: "That email and password don't match. Check them and try again." }, { status: 401 });
  }

  clearLoginFailures(email);
  // "Keep me signed in" defaults to on; only an explicit false gives a browser-session cookie.
  const remember = body.remember !== false;
  await startSession(found.user.id, remember);
  if (remember) await rememberOnDevice(found.user);
  else await forgetOnDevice(); // e.g. a shared computer: don't greet this person by name next time
  return NextResponse.json({ user: found.user });
}
