import { NextResponse } from "next/server";
import { completeEmailVerification } from "@/lib/db";
import { getDeviceUser, linkTokenHash, rememberOnDevice } from "@/lib/auth";

/**
 * The link from a verification email. Confirms the address (or completes an email change), then
 * redirects to /verify-email?status=… which explains the result. Works signed in or out.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const result = token ? await completeEmailVerification(linkTokenHash(token)) : ({ status: "invalid" } as const);
  if (result.status === "changed" && (await getDeviceUser())?.email === result.previousEmail) {
    await rememberOnDevice(result.user); // "Welcome back" now shows the new email
  }
  const origin = process.env.APP_URL || new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/verify-email?status=${result.status}`, 303);
}
