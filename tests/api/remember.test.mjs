// "Keep me signed in": cookie type, stored flag, renewal.
import { db } from "../helpers/db.mjs";
import { createHash } from "node:crypto";
import { check, suite } from "../helpers/checks.mjs";

suite("Keep me signed in: cookies, renewal, device memory", async () => {

  const BASE = process.env.BASE ?? "http://localhost:3100";
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const HOUR = 3600e3, DAY = 24 * HOUR;

  async function post(path, body, cookie) {
    return fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  }
  const sessionCookie = (res) => (res.headers.getSetCookie() ?? []).find((c) => c.startsWith("ct_session="));
  const tokenOf = (c) => c.split(";")[0].split("=")[1];
  const row = async (token) => db.prepare("SELECT remember, expires_at FROM sessions WHERE token_hash = ?").get(sha(token));
  const hoursLeft = (r) => (new Date(r.expires_at) - Date.now()) / HOUR;

  const email = `remember.${Date.now()}@example.com`;
  await post("/api/auth/register", { name: "Remy Test", email, password: "a good password" });

  // Ticked (explicit true)
  let res = await post("/api/auth/login", { email, password: "a good password", remember: true });
  let c = sessionCookie(res);
  check("remember=true → 200", res.status === 200);
  check("remember=true → persistent cookie (Expires set)", /Expires=/i.test(c), c);
  const expiresIn = (new Date(c.match(/Expires=([^;]+)/i)[1]) - Date.now()) / DAY;
  check("persistent cookie lasts ~30 days", expiresIn > 29.9 && expiresIn <= 30, String(expiresIn));
  let r = await row(tokenOf(c));
  check("DB: remember=1, ~30 days", r.remember === 1 && Math.round(hoursLeft(r) / 24) === 30, JSON.stringify(r));
  const remembered = tokenOf(c);

  // Omitted → defaults to remembered
  res = await post("/api/auth/login", { email, password: "a good password" });
  check("remember omitted → persistent (default on)", /Expires=/i.test(sessionCookie(res)));

  // Unticked
  res = await post("/api/auth/login", { email, password: "a good password", remember: false });
  c = sessionCookie(res);
  check("remember=false → browser-session cookie (no Expires / Max-Age)", !/Expires=|Max-Age=/i.test(c), c);
  r = await row(tokenOf(c));
  check("DB: remember=0, ~12 hours", r.remember === 0 && Math.round(hoursLeft(r)) === 12, JSON.stringify(r));
  const short = tokenOf(c);

  // Fresh sessions are not renewed (no Set-Cookie churn on every request)
  res = await fetch(BASE + "/api/account", { headers: { Cookie: `ct_session=${remembered}` } });
  check("fresh remembered session: no renewal cookie", res.status === 200 && !sessionCookie(res));

  // Remembered session with 5 days left → renewed to 30 days, cookie re-sent with Expires
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() + 5 * DAY).toISOString(), sha(remembered));
  res = await fetch(BASE + "/api/account", { headers: { Cookie: `ct_session=${remembered}` } });
  c = sessionCookie(res);
  check("remembered session near expiry → renewed to ~30 days", Math.round(hoursLeft(await row(remembered)) / 24) === 30, JSON.stringify(await row(remembered)));
  check("renewal re-sends a persistent cookie", c && /Expires=/i.test(c), c);

  // Short session with 2 hours left → renewed to 12 hours, cookie stays a session cookie
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() + 2 * HOUR).toISOString(), sha(short));
  res = await fetch(BASE + "/api/exercise?date=2026-10-16", { headers: { Cookie: `ct_session=${short}` } });
  c = sessionCookie(res);
  check("short session in use → renewed to ~12 hours", res.status === 200 && Math.round(hoursLeft(await row(short))) === 12, JSON.stringify(await row(short)));
  check("renewal keeps it a browser-session cookie", c && !/Expires=|Max-Age=/i.test(c), c);

  // Short session past its idle limit → 401
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() - 1000).toISOString(), sha(short));
  res = await fetch(BASE + "/api/account", { headers: { Cookie: `ct_session=${short}` } });
  check("idle short session → 401", res.status === 401);

  // Pages still recognise a remembered session
  res = await fetch(BASE + "/exercise", { headers: { Cookie: `ct_session=${remembered}` }, redirect: "manual" });
  check("remembered session opens /exercise", res.status === 200);

  // The exercise Photo route still exists as API but isn't in the UI (checked by the browser scenario)
});
