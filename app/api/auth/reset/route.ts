import { NextResponse } from "next/server";
import { completePasswordReset, findPasswordReset } from "@/lib/db";
import { hashPassword, resetTokenHash, startSession } from "@/lib/auth";
import { RESET_LINK_PROBLEMS, validateNewPassword } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";

/** Body: { token, password } → 200 { ok: true }, signs out every device, then signs in here. */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const token = str(body.token);
  const password = str(body.password);
  const tokenHash = resetTokenHash(token);
  const lookup = token ? await findPasswordReset(tokenHash) : ({ status: "invalid" } as const);
  if (lookup.status !== "valid") {
    return NextResponse.json({ error: RESET_LINK_PROBLEMS[lookup.status], reason: lookup.status }, { status: 400 });
  }
  const passwordError = validateNewPassword(password);
  if (passwordError) return fieldError("password", passwordError);

  // Re-checked under a row lock: if the same link was submitted twice at once, only one wins.
  if (!(await completePasswordReset(tokenHash, lookup.userId, await hashPassword(password)))) {
    return NextResponse.json({ error: RESET_LINK_PROBLEMS.used, reason: "used" }, { status: 400 });
  }
  await startSession(lookup.userId);
  return NextResponse.json({ ok: true });
}
