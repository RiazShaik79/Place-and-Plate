// API checks for password reset + exercise. AI routes are never called (no quota).
import { db } from "../helpers/db.mjs";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { check, suite } from "../helpers/checks.mjs";

suite("Password reset and exercise logging", async () => {

  const BASE = process.env.BASE ?? "http://localhost:3100";

  function client() {
    let cookie = "";
    return async (path, { method = "GET", body, form } = {}) => {
      const res = await fetch(BASE + path, {
        method, redirect: "manual",
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: form ?? (body ? JSON.stringify(body) : undefined),
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const [name, value] = pair.split("=");
        if (name === "ct_session") cookie = value ? `ct_session=${value}` : "";
      }
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json };
    };
  }
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const stamp = Date.now();
  const emailA = `reset.${stamp}@example.com`;
  const a = client(), a2 = client(), anon = client(), b = client();

  // --- Unauthenticated access to new routes
  for (const [m, p] of [["GET", "/api/exercise?date=2026-10-16"], ["POST", "/api/exercise"], ["POST", "/api/exercise/custom"], ["DELETE", "/api/exercise/1"], ["GET", "/api/exercise/week?end=2026-10-16"], ["POST", "/api/ai/exercise/text"], ["POST", "/api/ai/exercise/image"]]) {
    const r = await anon(p, { method: m, body: m === "GET" ? undefined : {} });
    check(`anon ${m} ${p} → 401`, r.status === 401, `got ${r.status}`);
  }
  const ex = await fetch(BASE + "/exercise", { redirect: "manual" });
  check("anon /exercise → /login?next=/exercise", ex.headers.get("location")?.includes("next=%2Fexercise") || ex.headers.get("location")?.includes("next=/exercise"), ex.headers.get("location"));

  // --- Password reset
  let r = await a("/api/auth/register", { method: "POST", body: { name: "Rae Test", email: emailA, password: "first password" } });
  check("register A", r.status === 201);
  await a2("/api/auth/login", { method: "POST", body: { email: emailA, password: "first password" } });
  const userId = r.json.user.id;

  r = await anon("/api/auth/forgot", { method: "POST", body: { email: "not-an-email" } });
  check("forgot bad email → 400 field=email", r.status === 400 && r.json?.field === "email", JSON.stringify(r.json));
  r = await anon("/api/auth/forgot", { method: "POST", body: { email: `nobody.${stamp}@example.com` } });
  check("forgot unknown email → 200 (same as known)", r.status === 200 && r.json?.ok === true);
  r = await anon("/api/auth/forgot", { method: "POST", body: { email: emailA.toUpperCase() } });
  check("forgot known email → 200", r.status === 200 && r.json?.ok === true);
  const rows = await db.prepare("SELECT * FROM password_resets WHERE user_id = ?").all(userId);
  check("forgot stores exactly one hashed token", rows.length === 1 && rows[0].token_hash.length === 64 && !rows[0].used_at, JSON.stringify(rows));
  const ttl = (new Date(rows[0].expires_at) - new Date(rows[0].created_at)) / 60000;
  check("token expires in 30 min", Math.round(ttl) === 30, String(ttl));
  r = await anon("/api/auth/forgot", { method: "POST", body: { email: emailA } });
  check("second request replaces the first token", (await db.prepare("SELECT COUNT(*) n FROM password_resets WHERE user_id = ?").get(userId)).n === 1);
  await anon("/api/auth/forgot", { method: "POST", body: { email: emailA } });
  r = await anon("/api/auth/forgot", { method: "POST", body: { email: emailA } });
  check("4th request in 15 min → 429", r.status === 429, `${r.status} ${JSON.stringify(r.json)}`);

  // Our own known token (the real one is only in the server console).
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
  await db.prepare("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(token), userId, now.toISOString(), new Date(+now + 30 * 60000).toISOString());
  const expired = randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(expired), userId, new Date(+now - 60 * 60000).toISOString(), new Date(+now - 30 * 60000).toISOString());

  const page = await (await fetch(`${BASE}/reset-password?token=${token}`)).text();
  check("reset page with valid token shows the form", page.includes("Choose a new password"));
  const pageBad = await (await fetch(`${BASE}/reset-password?token=nope`)).text();
  check("reset page with bad token says so", pageBad.includes("isn&#x27;t valid") || pageBad.includes("isn't valid"));
  const pageExp = await (await fetch(`${BASE}/reset-password?token=${expired}`)).text();
  check("reset page with expired token says so", pageExp.includes("has expired"));

  r = await anon("/api/auth/reset", { method: "POST", body: { token: "nope", password: "new password 1" } });
  check("reset bad token → 400 invalid", r.status === 400 && r.json?.reason === "invalid");
  r = await anon("/api/auth/reset", { method: "POST", body: { token: expired, password: "new password 1" } });
  check("reset expired token → 400 expired", r.status === 400 && r.json?.reason === "expired");
  r = await anon("/api/auth/reset", { method: "POST", body: { token, password: "short" } });
  check("reset short password → 400 field=password", r.status === 400 && r.json?.field === "password");
  const c = client();
  r = await c("/api/auth/reset", { method: "POST", body: { token, password: "new password 1" } });
  check("reset → 200 and signs in", r.status === 200 && (await c("/api/account")).status === 200);
  check("other sessions signed out", (await a("/api/account")).status === 401 && (await a2("/api/account")).status === 401);
  r = await anon("/api/auth/reset", { method: "POST", body: { token, password: "new password 2" } });
  check("token single-use → 400 used", r.status === 400 && r.json?.reason === "used");
  check("old password rejected", (await a("/api/auth/login", { method: "POST", body: { email: emailA, password: "first password" } })).status === 401);
  check("new password works", (await a("/api/auth/login", { method: "POST", body: { email: emailA, password: "new password 1" } })).status === 200);

  // --- Weight in profile
  r = await a("/api/account", { method: "PATCH", body: { name: "Rae Test", email: emailA, weightKg: 12 } });
  check("weight 12 kg → 400 field=weightKg", r.status === 400 && r.json?.field === "weightKg");
  r = await a("/api/account", { method: "PATCH", body: { name: "Rae Test", email: emailA, weightKg: 80 } });
  check("weight 80 kg saved", r.status === 200 && r.json.user.weightKg === 80);
  r = await a("/api/account", { method: "PATCH", body: { name: "Rae Test", email: emailA } });
  check("omitting weight keeps it", r.json?.user?.weightKg === 80);

  // --- Exercise CRUD
  const date = "2026-10-16";
  r = await a("/api/exercise", { method: "POST", body: { exerciseId: "walk-outdoor-brisk", minutes: 30, date } });
  check("log brisk walk 30 min → 201, kcal = 4.3×80×0.5 = 172", r.status === 201 && r.json.entry.calories === 172, JSON.stringify(r.json));
  const walkId = r.json?.entry?.id;
  r = await a("/api/exercise", { method: "POST", body: { exerciseId: "nope", minutes: 30, date } });
  check("unknown exercise → 400", r.status === 400);
  r = await a("/api/exercise", { method: "POST", body: { exerciseId: "yoga", minutes: 0, date } });
  check("0 minutes → 400", r.status === 400);
  r = await a("/api/exercise/custom", { method: "POST", body: { date, source: "text", items: [{ name: "Treadmill walk", category: "cardio", intensity: "moderate", minutes: 45, met: 4, calories: 240 }] } });
  check("custom AI item → 201", r.status === 201 && r.json.entries[0].source === "ai:text");
  const customId = r.json?.entries?.[0]?.id;
  r = await a("/api/exercise/custom", { method: "POST", body: { date, source: "text", items: [{ name: "x", category: "flying", intensity: "moderate", minutes: 45, met: 4, calories: 240 }] } });
  check("custom bad category → 400", r.status === 400);
  r = await a("/api/exercise/custom", { method: "POST", body: { date, source: "text", items: [{ name: "x", category: "cardio", intensity: "moderate", minutes: 45, met: 99, calories: 240 }] } });
  check("custom MET 99 → 400", r.status === 400);
  r = await a(`/api/exercise?date=${date}`);
  check("list shows 2 sessions", r.json?.entries?.length === 2);
  r = await a(`/api/exercise/week?end=${date}`);
  check("week: 7 days, last = 75 min / 412 kcal", r.json?.days?.length === 7 && r.json.days[6].date === date && r.json.days[6].minutes === 75 && r.json.days[6].calories === 412, JSON.stringify(r.json?.days?.[6]));
  check("week: oldest is 6 days earlier, zero-filled", r.json?.days?.[0]?.date === "2026-10-10" && r.json.days[0].minutes === 0);

  // Isolation
  await b("/api/auth/register", { method: "POST", body: { name: "Other", email: `other.${stamp}@example.com`, password: "password-b" } });
  check("B sees none of A's sessions", (await b(`/api/exercise?date=${date}`)).json?.entries?.length === 0);
  check("B can't delete A's session → 404", (await b(`/api/exercise/${walkId}`, { method: "DELETE" })).status === 404);
  r = await b("/api/exercise", { method: "POST", body: { exerciseId: "walk-outdoor-brisk", minutes: 30, date } });
  check("B (no weight) uses 70 kg → 151 kcal", r.json?.entry?.calories === 151, JSON.stringify(r.json));

  check("A deletes own session → 204", (await a(`/api/exercise/${customId}`, { method: "DELETE" })).status === 204);
});
