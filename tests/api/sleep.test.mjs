// Sleep: log a night (bed / wake / quality), the server-computed duration across midnight,
// validation, clearing, the target, history, isolation and cascade.
import { db } from "../helpers/db.mjs";
import { check, suite } from "../helpers/checks.mjs";
import { client, daysAgo } from "../helpers/http.mjs";

suite("Sleep log and target", async () => {
  const today = daysAgo(0), yday = daysAgo(1), future = daysAgo(-3);
  const a = client(), b = client(), anon = client();
  const emailA = `sleep.${Date.now()}@example.com`;
  await a("/api/auth/register", { method: "POST", body: { name: "Sol Sleeper", email: emailA, password: "a good password" } });
  await b("/api/auth/register", { method: "POST", body: { name: "Other", email: `sleep.other.${Date.now()}@example.com`, password: "a good password" } });

  for (const [m, p, body] of [["GET", `/api/sleep?date=${today}`], ["PUT", "/api/sleep", { date: today, bed: "23:00", wake: "07:00" }]]) {
    check(`anon ${m} /api/sleep → 401`, (await anon(p, { method: m, body })).status === 401);
  }

  let r = await a(`/api/sleep?date=${today}`);
  check("nothing yet → sleep null, default target 480", r.status === 200 && r.json.sleep === null && r.json.target === 480, JSON.stringify(r.json));

  r = await a("/api/sleep", { method: "PUT", body: { date: today, bed: "23:15", wake: "06:35", quality: 4 } });
  check("23:15 → 06:35 across midnight = 440 min, quality 4", r.status === 200 && r.json.sleep.minutes === 440 && r.json.sleep.quality === 4, JSON.stringify(r.json));
  r = await a(`/api/sleep?date=${today}`);
  check("GET returns the night", r.json.sleep?.bed === "23:15" && r.json.sleep.wake === "06:35" && r.json.sleep.minutes === 440);

  r = await a("/api/sleep", { method: "PUT", body: { date: today, bed: "01:00", wake: "08:30", quality: null } });
  check("saving again replaces it (01:00 → 08:30 = 450, no quality)", r.json?.sleep?.minutes === 450 && r.json.sleep.quality === null);
  check("…one row only", Number((await db.prepare("SELECT COUNT(*) n FROM daily_sleep d JOIN users u ON u.id = d.user_id WHERE u.email = ?").get(emailA)).n) === 1);

  for (const [label, body] of [
    ["bad time 25:00", { date: today, bed: "25:00", wake: "07:00" }],
    ["bad time 7:5", { date: today, bed: "23:00", wake: "7:5" }],
    ["too short (20 min)", { date: today, bed: "07:00", wake: "07:20" }],
    ["too long (18 h)", { date: today, bed: "06:00", wake: "00:00" }],
    ["quality 0", { date: today, bed: "23:00", wake: "07:00", quality: 0 }],
    ["quality 6", { date: today, bed: "23:00", wake: "07:00", quality: 6 }],
    ["a future day", { date: future, bed: "23:00", wake: "07:00" }],
    ["bad date", { date: "17/10", bed: "23:00", wake: "07:00" }],
  ]) {
    r = await a("/api/sleep", { method: "PUT", body });
    check(`PUT ${label} → 400`, r.status === 400 && typeof r.json?.error === "string", `${r.status} ${JSON.stringify(r.json)}`);
  }

  r = await a("/api/sleep", { method: "PUT", body: { date: yday, bed: "22:30", wake: "06:30" } });
  check("another night (yesterday) is separate", r.json?.sleep?.minutes === 480 && (await a(`/api/sleep?date=${today}`)).json.sleep.minutes === 450);
  check("another account sees nothing", (await b(`/api/sleep?date=${today}`)).json.sleep === null);

  // Target
  r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 2000, sleepTargetMin: 450 } });
  check("body: sleep target 7.5 h (450) saves", r.status === 200 && r.json.user.sleepTargetMin === 450, JSON.stringify(r.json));
  check("GET reports the new target", (await a(`/api/sleep?date=${today}`)).json.target === 450);
  for (const v of [120, 800, 450.5]) {
    r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 2000, sleepTargetMin: v } });
    check(`body: sleep target ${v} → 400 field=sleepTargetMin`, r.status === 400 && r.json?.field === "sleepTargetMin", JSON.stringify(r.json));
  }
  check("body without sleepTargetMin keeps it", (await a("/api/account/body", { method: "PUT", body: { calorieGoal: 2000 } })).json?.user?.sleepTargetMin === 450);

  // History: nights count the day you woke, today included
  r = await a(`/api/history?period=day&end=${today}`);
  const last = r.json.buckets.at(-1), prev = r.json.buckets.at(-2);
  check("history: today's night is in today's bucket (450)", last.sleep === 450 && last.sleepDays === 1, JSON.stringify(last));
  check("history: yesterday 480", prev.sleep === 480 && prev.sleepDays === 1);
  check("history: sleepTarget 450", r.json.sleepTarget === 450);

  // Clear
  r = await a("/api/sleep", { method: "PUT", body: { date: today, clear: true } });
  check("clear → sleep null", r.status === 200 && r.json.sleep === null && (await a(`/api/sleep?date=${today}`)).json.sleep === null);

  // Migration + cascade
  check("migration 005_sleep.sql recorded", Boolean(await db.prepare("SELECT name FROM schema_migrations WHERE name = '005_sleep.sql'").get()));
  const uid = (await db.prepare("SELECT id FROM users WHERE email = ?").get(emailA)).id;
  await db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  check("deleting the account removes its nights", Number((await db.prepare("SELECT COUNT(*) n FROM daily_sleep WHERE user_id = ?").get(uid)).n) === 0);
});
