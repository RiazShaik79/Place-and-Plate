import { NextResponse } from "next/server";
import { findUserForLogin, insertPasswordReset } from "@/lib/db";
import { newResetToken, RESET_TTL_MINUTES, resetThrottle } from "@/lib/auth";
import { normalizeEmail, validateEmail } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";
import { sendPasswordResetEmail } from "@/lib/mailer";

/**
 * Body: { email } → 200 { ok: true } whether or not the account exists, so the response
 * can't be used to find out which emails are registered.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const email = normalizeEmail(str(body.email));
  const emailError = validateEmail(email);
  if (emailError) return fieldError("email", emailError);

  const wait = resetThrottle.blockedMinutes(email);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many reset requests for this email. Try again in ${wait} ${wait === 1 ? "minute" : "minutes"}.` },
      { status: 429 },
    );
  }
  resetThrottle.record(email);

  const found = await findUserForLogin(email);
  if (found) {
    const { token, tokenHash, expires } = newResetToken();
    await insertPasswordReset(tokenHash, found.user.id, expires);
    const origin = process.env.APP_URL || new URL(req.url).origin;
    const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(found.user.email, found.user.name, link, RESET_TTL_MINUTES);
  }
  return NextResponse.json({ ok: true });
}
