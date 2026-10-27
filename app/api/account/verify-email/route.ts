import { NextResponse } from "next/server";
import { requireUser, verifyThrottle } from "@/lib/auth";
import { sendVerificationLink } from "@/lib/verification";

/**
 * Resend a confirmation link: to the pending new email if there is one, otherwise to the
 * sign-in email if it isn't verified yet. 3 per user per 15 minutes.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const target = user.pendingEmail ?? (user.emailVerified ? null : user.email);
  if (!target) return NextResponse.json({ error: "Your email is already confirmed." }, { status: 400 });

  const key = String(user.id);
  const wait = verifyThrottle.blockedMinutes(key);
  if (wait > 0) {
    return NextResponse.json({ error: `You've asked for a few links already. Try again in ${wait} ${wait === 1 ? "minute" : "minutes"}.` }, { status: 429 });
  }
  verifyThrottle.record(key);
  await sendVerificationLink(req, user, target);
  return NextResponse.json({ sentTo: target });
}
