import { check, suite } from "../helpers/checks.mjs";

suite("Accounts: register, sign in/out, profile, password, isolation", async () => {
  ﻿// API smoke test for auth/account. Never calls the AI routes with a session (no Gemini quota used).
  const BASE = process.env.BASE ?? "http://localhost:3100";

  function client() {
    let cookie = "";
    return async (path, { method = "GET", body, raw } = {}) => {
      const res = await fetch(BASE + path, {
        method, redirect: "manual",
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: raw ?? (body ? JSON.stringify(body) : undefined),
      });
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) {
        const [pair] = c.split(";");
        const [name, value] = pair.split("=");
        if (name === "ct_session") cookie = value ? `ct_session=${value}` : "";
        if (/max-age=0|expires=Thu, 01 Jan 1970/i.test(c)) cookie = "";
      }
      let json = null;
      try { json = await res.json(); } catch {}
      return { status: res.status, json, headers: res.headers, setCookie: set };
    };
  }

  const stamp = Date.now();
  const a = client(), b = client(), anon = client();
  const emailA = `alex.${stamp}@example.com`, emailB = `sam.${stamp}@example.com`;

  // Unauthenticated access
  for (const [m, p] of [["GET", "/api/log?date=2026-10-16"], ["POST", "/api/log"], ["POST", "/api/log/custom"], ["DELETE", "/api/log/1"], ["GET", "/api/settings"], ["PUT", "/api/settings"], ["POST", "/api/ai/text"], ["GET", "/api/account"], ["PUT", "/api/account/password"]]) {
    const r = await anon(p, { method: m, body: m === "GET" ? undefined : {} });
    check(`anon ${m} ${p} â†’ 401`, r.status === 401, `got ${r.status}`);
  }
  const home = await fetch(BASE + "/", { redirect: "manual" });
  check("anon GET / redirects to /login", [307, 308, 303].includes(home.status) && home.headers.get("location")?.includes("/login"), `${home.status} ${home.headers.get("location")}`);
  const acct = await fetch(BASE + "/account", { redirect: "manual" });
  check("anon GET /account redirects to /login?next=/account", acct.headers.get("location")?.includes("next=%2Faccount") || acct.headers.get("location")?.includes("next=/account"), `${acct.status} ${acct.headers.get("location")}`);

  // Register validation
  let r = await a("/api/auth/register", { method: "POST", body: { name: "", email: emailA, password: "longenough" } });
  check("register empty name â†’ 400 field=name", r.status === 400 && r.json?.field === "name", JSON.stringify(r.json));
  r = await a("/api/auth/register", { method: "POST", body: { name: "Alex", email: "nope", password: "longenough" } });
  check("register bad email â†’ 400 field=email", r.status === 400 && r.json?.field === "email", JSON.stringify(r.json));
  r = await a("/api/auth/register", { method: "POST", body: { name: "Alex", email: emailA, password: "short" } });
  check("register short password â†’ 400 field=password", r.status === 400 && r.json?.field === "password", JSON.stringify(r.json));
  r = await a("/api/auth/register", { method: "POST", raw: "{not json" });
  check("register invalid JSON â†’ 400", r.status === 400);

  // Register OK
  r = await a("/api/auth/register", { method: "POST", body: { name: "  Alex Morgan ", email: `  ${emailA.toUpperCase()} `, password: "correct horse" } });
  check("register â†’ 201", r.status === 201, JSON.stringify(r.json));
  check("register normalizes email + trims name", r.json?.user?.email === emailA && r.json?.user?.name === "Alex Morgan", JSON.stringify(r.json));
  check("register response has no password hash", !JSON.stringify(r.json).includes("scrypt"));
  const sc = r.setCookie.join(" ");
  check("session cookie is HttpOnly + SameSite=Lax", /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), sc);
  r = await a("/api/account");
  check("GET /api/account after register", r.status === 200 && r.json.user.email === emailA);

  // Duplicate
  r = await b("/api/auth/register", { method: "POST", body: { name: "Other", email: emailA, password: "whatever123" } });
  check("register duplicate email â†’ 409 field=email", r.status === 409 && r.json?.field === "email", JSON.stringify(r.json));

  // Second user + isolation
  r = await b("/api/auth/register", { method: "POST", body: { name: "Sam", email: emailB, password: "password-b" } });
  check("register user B â†’ 201", r.status === 201);
  r = await a("/api/log", { method: "POST", body: { foodId: "chicken-breast", servings: 1, date: "2026-10-16", meal: "snack" } });
  const foodOk = r.status === 201;
  if (!foodOk) {
    // find a valid food id
    console.log("note: banana not in catalogue:", r.status, JSON.stringify(r.json));
  }
  const entryId = r.json?.entry?.id;
  r = await a("/api/log/custom", { method: "POST", body: { date: "2026-10-16", meal: "lunch", source: "text", items: [{ name: "Test bowl", portion: "1 bowl", calories: 500, protein: 30, carbs: 50, fat: 15 }] } });
  check("A logs custom item â†’ 201", r.status === 201, JSON.stringify(r.json));
  const customId = r.json?.entries?.[0]?.id;
  r = await b("/api/log?date=2026-10-16");
  check("B sees none of A's entries", r.status === 200 && r.json.entries.length === 0, JSON.stringify(r.json));
  r = await b(`/api/log/${customId}`, { method: "DELETE" });
  check("B cannot delete A's entry â†’ 404", r.status === 404, `got ${r.status}`);
  r = await a("/api/log?date=2026-10-16");
  check("A still has its entries", r.json?.entries?.some((e) => e.id === customId));

  // Settings per user
  r = await a("/api/settings", { method: "PUT", body: { calorieGoal: 1800 } });
  check("A sets goal 1800", r.status === 200 && r.json.settings.calorieGoal === 1800);
  r = await b("/api/settings");
  check("B goal unaffected (2000)", r.json?.settings?.calorieGoal === 2000, JSON.stringify(r.json));

  // Profile
  r = await a("/api/account", { method: "PATCH", body: { name: "Alex M.", email: emailB } });
  check("A cannot take B's email â†’ 409", r.status === 409 && r.json?.field === "email", JSON.stringify(r.json));
  r = await a("/api/account", { method: "PATCH", body: { name: "Alex M.", email: emailA } });
  check("A updates name", r.status === 200 && r.json.user.name === "Alex M.");
  r = await a("/api/account", { method: "PATCH", body: { name: "x".repeat(61), email: emailA } });
  check("name too long â†’ 400", r.status === 400 && r.json?.field === "name");

  // Logout / login
  r = await a("/api/auth/logout", { method: "POST" });
  check("logout â†’ 204", r.status === 204);
  r = await a("/api/account");
  check("after logout â†’ 401", r.status === 401);
  r = await a("/api/auth/login", { method: "POST", body: { email: emailA, password: "wrong password" } });
  check("login wrong password â†’ 401 generic", r.status === 401 && /don't match/.test(r.json?.error), JSON.stringify(r.json));
  r = await a("/api/auth/login", { method: "POST", body: { email: `nobody.${stamp}@example.com`, password: "whatever" } });
  check("login unknown email â†’ same 401", r.status === 401 && /don't match/.test(r.json?.error));
  r = await a("/api/auth/login", { method: "POST", body: { email: emailA.toUpperCase(), password: "correct horse" } });
  check("login (case-insensitive email) â†’ 200", r.status === 200, JSON.stringify(r.json));

  // Password change: signs out other sessions
  const a2 = client();
  r = await a2("/api/auth/login", { method: "POST", body: { email: emailA, password: "correct horse" } });
  check("A logs in on 2nd device", r.status === 200);
  r = await a("/api/account/password", { method: "PUT", body: { currentPassword: "nope", newPassword: "battery staple" } });
  check("password change wrong current â†’ 400 field=currentPassword", r.status === 400 && r.json?.field === "currentPassword");
  r = await a("/api/account/password", { method: "PUT", body: { currentPassword: "correct horse", newPassword: "short" } });
  check("password change short new â†’ 400 field=newPassword", r.status === 400 && r.json?.field === "newPassword");
  r = await a("/api/account/password", { method: "PUT", body: { currentPassword: "correct horse", newPassword: "battery staple" } });
  check("password change â†’ 204", r.status === 204, `${r.status} ${JSON.stringify(r.json)}`);
  r = await a("/api/account");
  check("current device still signed in", r.status === 200);
  r = await a2("/api/account");
  check("other device signed out â†’ 401", r.status === 401);
  r = await a2("/api/auth/login", { method: "POST", body: { email: emailA, password: "correct horse" } });
  check("old password rejected", r.status === 401);
  r = await a2("/api/auth/login", { method: "POST", body: { email: emailA, password: "battery staple" } });
  check("new password works", r.status === 200);

  // Throttle: 5 failures then 429
  const t = client();
  const emailT = `throttle.${stamp}@example.com`;
  for (let i = 0; i < 5; i++) await t("/api/auth/login", { method: "POST", body: { email: emailT, password: "bad" } });
  r = await t("/api/auth/login", { method: "POST", body: { email: emailT, password: "bad" } });
  check("6th failed login â†’ 429", r.status === 429 && /Try again in/.test(r.json?.error), JSON.stringify(r.json));

  // Cleanup A's test entries
  if (entryId) await a(`/api/log/${entryId}`, { method: "DELETE" });
  r = await a(`/api/log/${customId}`, { method: "DELETE" });
  check("A deletes own entry â†’ 204", r.status === 204);
});
