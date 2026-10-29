// Health and debug routes: /api/health reports the DB without leaking anything; /api/debug/error
// stays a 404 unless DEBUG_ERROR_TOKEN is configured (it never is in tests).
import { check, suite } from "../helpers/checks.mjs";

suite("Health: DB check, no caching, no leaks; debug route is off", async () => {
  const BASE = process.env.BASE ?? "http://localhost:3100";

  const res = await fetch(`${BASE}/api/health`);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  check("GET /api/health → 200 without signing in", res.status === 200, `got ${res.status}`);
  check("status ok, db up", json?.status === "ok" && json?.db === "up", text);
  check("db_ms and uptime_s are numbers", typeof json?.db_ms === "number" && typeof json?.uptime_s === "number", text);
  check("version is set", typeof json?.version === "string" && json.version.length > 0, text);
  check("Cache-Control: no-store", (res.headers.get("cache-control") ?? "").includes("no-store"), res.headers.get("cache-control"));
  check("body has no URLs, hosts or credentials", !/mysql:|@|localhost|127\.0\.0\.1|password/i.test(text), text);

  let cookie = "";
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hal Health", email: `health.${Date.now()}@example.com`, password: "a good password" }),
  });
  for (const c of reg.headers.getSetCookie?.() ?? []) if (c.startsWith("ct_session=")) cookie = c.split(";")[0];
  check("registered a test account", reg.status === 201 || reg.status === 200, `got ${reg.status}`);

  const anon = await fetch(`${BASE}/api/debug/error`, { headers: { "x-debug-token": "x".repeat(40) } });
  check("debug route → 404 when DEBUG_ERROR_TOKEN is unset (anonymous)", anon.status === 404, `got ${anon.status}`);
  const signedIn = await fetch(`${BASE}/api/debug/error`, { headers: { Cookie: cookie, "x-debug-token": "x".repeat(40) } });
  check("debug route → 404 when DEBUG_ERROR_TOKEN is unset (signed in)", signedIn.status === 404, `got ${signedIn.status}`);
});
