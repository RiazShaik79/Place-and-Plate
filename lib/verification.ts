// Server only: create a verification link for an email address and send it.
import { insertEmailVerification } from "./db";
import { newVerifyToken, VERIFY_TTL_HOURS } from "./auth";
import { sendVerificationEmail } from "./mailer";
import type { User } from "./types";

/** Send a link to `email` (the sign-in email, or `user.pendingEmail` for a change). */
export async function sendVerificationLink(req: Request, user: Pick<User, "id" | "name" | "email">, email: string) {
  const { token, tokenHash, expires } = newVerifyToken();
  await insertEmailVerification(tokenHash, user.id, email, expires);
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const link = `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendVerificationEmail(email, user.name, link, VERIFY_TTL_HOURS, email !== user.email);
}
