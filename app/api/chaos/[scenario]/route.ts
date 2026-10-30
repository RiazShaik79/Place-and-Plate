import { NextResponse } from "next/server";
import { chaosAllowed, chaosEnabled } from "@/lib/chaos";
import { runScenario } from "@/lib/chaos-cases";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * GET (header x-chaos-token) → runs one seeded bug from lib/chaos-cases.ts, which throws (500);
 * a 404 unless CHAOS_MODE=enabled, the token matches CHAOS_TOKEN and the scenario is allowed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ scenario: string }> }) {
  if (!chaosEnabled()) return notFound();
  log.warn("CHAOS MODE ENABLED", { route: "/api/chaos/[scenario]" });
  const { scenario } = await params;
  if (!chaosAllowed(scenario, req.headers.get("x-chaos-token"))) return notFound();
  return NextResponse.json({ scenario, result: await runScenario(scenario) });
}
