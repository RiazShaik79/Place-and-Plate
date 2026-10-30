import { NextResponse } from "next/server";
import { chaosEnabled } from "@/lib/chaos";
import { pingDb } from "@/lib/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

// Under Render's 5 s health-check timeout, including a cold connection and pending migrations.
const DB_TIMEOUT_MS = 3000;
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET → 200 { status: "ok", db: "up", db_ms, version, uptime_s }
 *     | 503 { status: "degraded", db: "down", code, version, uptime_s }
 * plus `chaos: true` while chaos mode is on (Watchtower shows a banner).
 * No sign-in (Render and Watchtower call it). Never returns hosts, URLs or error messages.
 */
export async function GET() {
  const db = await pingDb(DB_TIMEOUT_MS);
  const version = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev";
  const uptime_s = Math.round(process.uptime());
  const chaos = chaosEnabled() ? { chaos: true } : {};
  if (db.ok) {
    return NextResponse.json({ status: "ok", db: "up", db_ms: db.ms, version, uptime_s, ...chaos }, { headers: NO_STORE });
  }
  log.error("health_db_down", { code: db.code, ms: db.ms });
  return NextResponse.json({ status: "degraded", db: "down", code: db.code, version, uptime_s, ...chaos }, { status: 503, headers: NO_STORE });
}
