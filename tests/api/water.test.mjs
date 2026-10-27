// Water API: quick adds (atomic), undo, exact totals, validation, target, isolation, history.
import { db } from "../helpers/db.mjs";
import { check, suite } from "../helpers/checks.mjs";

suite("Water: quick adds, undo, totals, target, history", async () => {
  const BASE = process.env.BASE ?? "http://localhost:3100";
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  const today = daysAgo(0), yday = daysAgo(1), twoAgo = daysAgo(2);

  function client() {
    let cookie = "";
    return async (path, { method = "GET", body } = {}) => {
      const res = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("ct_session=")) cookie = c.split(";")[0];
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, json };
    };
  }

  const a = client(), b = client(), anon = client();
  await a("/api/auth/register", { method: "POST", body: { name: "Wren Water", email: `water.${Date.now()}@example.com`, password: "a good password" } });
  await b("/api/auth/register", { method: "POST", body: { name: "Other", email: `water.other.${Date.now()}@example.com`, password: "a good password" } });

  for (const [m, body] of [["GET", undefined], ["POST", { date: today, add: 250 }], ["PUT", { date: today, ml: 1 }]]) {
    const r = await anon(m === "GET" ? `/api/water?date=${today}` : "/api/water", { method: m, body });
    check(`anon ${m} /api/water → 401`, r.status === 401, `got ${r.status}`);
  }

  let r = await a(`/api/water?date=${today}`);
  check("GET: nothing yet → ml null, default target 2000", r.status === 200 && r.json.ml === null && r.json.target === 2000, JSON.stringify(r.json));
  r = await a("/api/water", { method: "POST", body: { date: today, add: 250 } });
  check("POST +250 → 250", r.status === 200 && r.json.ml === 250, JSON.stringify(r.json));
  r = await a("/api/water", { method: "POST", body: { date: today, add: 500 } });
  check("POST +500 → 750", r.json?.ml === 750, JSON.stringify(r.json));
  r = await a("/api/water", { method: "POST", body: { date: today, add: -250 } });
  check("POST -250 (undo) → 500", r.json?.ml === 500, JSON.stringify(r.json));
  r = await a("/api/water", { method: "POST", body: { date: today, add: -2000 } });
  check("undo below zero stops at 0", r.json?.ml === 0, JSON.stringify(r.json));
  r = await a("/api/water", { method: "PUT", body: { date: today, ml: 1800 } });
  check("PUT 1800 → 1800", r.status === 200 && (await a(`/api/water?date=${today}`)).json.ml === 1800);
  r = await a("/api/water", { method: "PUT", body: { date: today, ml: null } });
  check("PUT null clears the day", r.status === 200 && (await a(`/api/water?date=${today}`)).json.ml === null);
  await a("/api/water", { method: "PUT", body: { date: today, ml: 9900 } });
  r = await a("/api/water", { method: "POST", body: { date: today, add: 500 } });
  check("adds stop at the 10,000 ml maximum", r.json?.ml === 10000, JSON.stringify(r.json));
  await a("/api/water", { method: "PUT", body: { date: today, ml: null } });

  for (const [label, method, body] of [
    ["bad date", "POST", { date: "2026-1-1", add: 250 }],
    ["add 0", "POST", { date: today, add: 0 }],
    ["fractional add", "POST", { date: today, add: 2.5 }],
    ["add 5000", "POST", { date: today, add: 5000 }],
    ["add -5000", "POST", { date: today, add: -5000 }],
    ["add as text", "POST", { date: today, add: "250" }],
    ["total over max", "PUT", { date: today, ml: 10001 }],
    ["negative total", "PUT", { date: today, ml: -1 }],
  ]) {
    r = await a("/api/water", { method, body });
    check(`${method} ${label} → 400`, r.status === 400 && typeof r.json?.error === "string", `${r.status} ${JSON.stringify(r.json)}`);
  }
  check("GET bad date → 400", (await a("/api/water?date=nope")).status === 400);

  // Ten taps at the same moment all count
  await Promise.all(Array.from({ length: 10 }, () => a("/api/water", { method: "POST", body: { date: yday, add: 250 } })));
  r = await a(`/api/water?date=${yday}`);
  check("10 simultaneous +250 → exactly 2500", r.json?.ml === 2500, JSON.stringify(r.json));

  // Isolation
  r = await b(`/api/water?date=${yday}`);
  check("another account doesn't see it", r.json?.ml === null, JSON.stringify(r.json));

  // Target
  r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 2000, waterTargetMl: 2500 } });
  check("body: water target 2500 saves", r.status === 200 && r.json.user.waterTargetMl === 2500, JSON.stringify(r.json));
  check("GET reports the new target", (await a(`/api/water?date=${today}`)).json.target === 2500);
  for (const v of [100, 7000, 2500.5, "lots"]) {
    r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 2000, waterTargetMl: v } });
    check(`body: water target ${JSON.stringify(v)} → 400 field=waterTargetMl`, r.status === 400 && r.json?.field === "waterTargetMl", JSON.stringify(r.json));
  }
  r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 2000, stepsTarget: 8000 } });
  check("body without waterTargetMl keeps the saved target", r.json?.user?.waterTargetMl === 2500, JSON.stringify(r.json?.user));

  // History: finished days in buckets, today separately
  await a("/api/water", { method: "PUT", body: { date: twoAgo, ml: 1500 } });
  await a("/api/water", { method: "POST", body: { date: today, add: 750 } });
  r = await a(`/api/history?period=day&end=${today}`);
  const days = r.json.buckets;
  const byDate = Object.fromEntries(days.map((x) => [x.start, x]));
  check("history: waterTarget 2500", r.json.waterTarget === 2500, String(r.json.waterTarget));
  check("history: yesterday 2500 ml, 1 water day", byDate[yday]?.water === 2500 && byDate[yday]?.waterDays === 1, JSON.stringify(byDate[yday]));
  check("history: two days ago 1500 ml", byDate[twoAgo]?.water === 1500);
  check("history: today's water is not in the bucket", byDate[today]?.water === 0 && byDate[today]?.waterDays === 0, JSON.stringify(byDate[today]));
  check("history: today.water = 750", r.json.today?.water === 750, JSON.stringify(r.json.today));
  r = await a(`/api/history?period=week&end=${today}`);
  check("history week: water totals the finished days (4000)", r.json.buckets.reduce((s, x) => s + x.water, 0) === 4000);

  const migrated = await db.prepare("SELECT name FROM schema_migrations WHERE name = '002_water.sql'").get();
  check("migration 002_water.sql is recorded (applied on the server's first query)", Boolean(migrated));

  // Deleting the account removes its water (cascade)
  const uid = (await db.prepare("SELECT user_id FROM daily_water WHERE date = ? LIMIT 1").get(twoAgo))?.user_id;
  check("rows are stored per user and day", Boolean(uid));
});
