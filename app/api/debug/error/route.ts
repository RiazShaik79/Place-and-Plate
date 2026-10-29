import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Temporary: lets the owner throw one known server error to check Sentry and the logs end to end.
// Off unless DEBUG_ERROR_TOKEN (32+ chars) is set AND the request sends it in x-debug-token AND the
// caller is signed in. Otherwise it behaves like a missing route. Unset the variable after testing.
const MIN_TOKEN_LENGTH = 32;

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function tokenMatches(sent: string | null): boolean {
  const expected = process.env.DEBUG_ERROR_TOKEN ?? "";
  if (expected.length < MIN_TOKEN_LENGTH || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GET (header x-debug-token) → throws "Watchtower phase-1 test error" (500); otherwise 404. */
export async function GET(req: Request) {
  if (!tokenMatches(req.headers.get("x-debug-token"))) return notFound();
  const user = await requireUser();
  if (user instanceof NextResponse) return notFound();
  throw new Error("Watchtower phase-1 test error");
}
