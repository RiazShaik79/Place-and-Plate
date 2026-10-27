// Weigh-ins (log, replace, delete, current weight), the new body-and-goals fields, and isolation.
import { db } from "../helpers/db.mjs";
import { check, suite } from "../helpers/checks.mjs";
import { client, daysAgo } from "../helpers/http.mjs";

suite("Weight log and goal profile", async () => {
  const today = daysAgo(0), yday = daysAgo(1), lastWeek = daysAgo(7), tomorrow2 = daysAgo(-3);
  const a = client(), b = client(), anon = client();
  const emailA = `weigh.${Date.now()}@example.com`;
  await a("/api/auth/register", { method: "POST", body: { name: "Wes Weigh", email: emailA, password: "a good password" } });
  await b("/api/auth/register", { method: "POST", body: { name: "Other", email: `weigh.other.${Date.now()}@example.com`, password: "a good password" } });

  for (const [m, p, body] of [["GET", `/api/weight?from=${lastWeek}&to=${today}`], ["PUT", "/api/weight", { date: today, kg: 70 }], ["DELETE", `/api/weight/${today}`]]) {
    const r = await anon(p, { method: m, body });
    check(`anon ${m} /api/weight → 401`, r.status === 401, `got ${r.status}`);
  }

  let r = await a(`/api/weight?from=${lastWeek}&to=${today}`);
  check("empty at first", r.status === 200 && r.json.entries.length === 0 && r.json.before === null && r.json.goalKg === null, JSON.stringify(r.json));

  // Log three days, out of order; the newest becomes the current weight
  await a("/api/weight", { method: "PUT", body: { date: yday, kg: 80.44 } });
  await a("/api/weight", { method: "PUT", body: { date: today, kg: 79.8 } });
  await a("/api/weight", { method: "PUT", body: { date: lastWeek, kg: 81.2 } });
  r = await a(`/api/weight?from=${yday}&to=${today}`);
  check("lists the range oldest first, rounded to 0.1", JSON.stringify(r.json.entries) === JSON.stringify([{ date: yday, kg: 80.4 }, { date: today, kg: 79.8 }]), JSON.stringify(r.json.entries));
  check("`before` is the weigh-in before the range", r.json.before?.date === lastWeek && r.json.before.kg === 81.2, JSON.stringify(r.json.before));
  let me = (await a("/api/account")).json.user;
  check("the newest weigh-in is the current weight (an older one logged later doesn't change it)", me.weightKg === 79.8, String(me.weightKg));

  r = await a("/api/weight", { method: "PUT", body: { date: today, kg: 79.5 } });
  check("logging the same day again replaces it", r.status === 200 && (await a(`/api/weight?from=${today}&to=${today}`)).json.entries.length === 1 && (await a("/api/account")).json.user.weightKg === 79.5);

  r = await a(`/api/weight/${today}`, { method: "DELETE" });
  check("delete today's → 204, current weight falls back to yesterday's", r.status === 204 && (await a("/api/account")).json.user.weightKg === 80.4);
  check("deleting a day with no weigh-in → 404", (await a(`/api/weight/${today}`, { method: "DELETE" })).status === 404);

  for (const [label, body] of [
    ["too light", { date: today, kg: 10 }],
    ["too heavy", { date: today, kg: 400 }],
    ["not a number", { date: today, kg: "80" }],
    ["bad date", { date: "17/10/2026", kg: 80 }],
    ["a future day", { date: tomorrow2, kg: 80 }],
  ]) {
    r = await a("/api/weight", { method: "PUT", body });
    check(`PUT ${label} → 400`, r.status === 400, `${r.status}`);
  }
  check("GET with from after to → 400", (await a(`/api/weight?from=${today}&to=${yday}`)).status === 400);

  // Isolation
  check("another account sees no weigh-ins", (await b(`/api/weight?from=${lastWeek}&to=${today}`)).json.entries.length === 0);
  check("another account can't delete them", (await b(`/api/weight/${yday}`, { method: "DELETE" })).status === 404);

  // Body and goals: the new fields
  const base = { calorieGoal: 2000, today };
  r = await a("/api/account/body", { method: "PUT", body: { ...base, birthYear: 1991, sex: "male", heightCm: 178, weightKg: 80.4, activity: "moderate", goalWeightKg: 75, weeklyChangeKg: -0.5 } });
  me = r.json?.user;
  check("body: saves year of birth, sex, activity, goal weight and pace", r.status === 200 && me.birthYear === 1991 && me.sex === "male" && me.activity === "moderate" && me.goalWeightKg === 75 && me.weeklyChangeKg === -0.5, JSON.stringify(me));
  r = await a(`/api/weight?from=${today}&to=${today}`);
  check("GET weight returns the goal and pace", r.json.goalKg === 75 && r.json.weeklyChangeKg === -0.5);
  check("body: an unchanged weight doesn't add a weigh-in", r.json.entries.length === 0, JSON.stringify(r.json.entries));
  await a("/api/account/body", { method: "PUT", body: { ...base, weightKg: 79.9 } });
  r = await a(`/api/weight?from=${today}&to=${today}`);
  check("body: a changed weight is logged as today's weigh-in", r.json.entries[0]?.kg === 79.9, JSON.stringify(r.json.entries));
  me = (await a("/api/account")).json.user;
  check("body: fields left out keep their saved values", me.birthYear === 1991 && me.sex === "male" && me.activity === "moderate" && me.goalWeightKg === 75, JSON.stringify(me));
  r = await a("/api/account/body", { method: "PUT", body: { ...base, sex: null, weeklyChangeKg: null } });
  check("body: sex and pace can be cleared", r.json?.user?.sex === null && r.json.user.weeklyChangeKg === null);
  const year = new Date().getFullYear();
  for (const [label, extra, field] of [
    ["birth year 1850", { birthYear: 1850 }, "birthYear"],
    ["birth year this year", { birthYear: year }, "birthYear"],
    ["sex 'x'", { sex: "x" }, "sex"],
    ["activity 'couch'", { activity: "couch" }, "activity"],
    ["goal weight 5", { goalWeightKg: 5 }, "goalWeightKg"],
    ["pace -3", { weeklyChangeKg: -3 }, "weeklyChangeKg"],
    ["pace 0.3 (not offered)", { weeklyChangeKg: 0.3 }, "weeklyChangeKg"],
  ]) {
    r = await a("/api/account/body", { method: "PUT", body: { ...base, ...extra } });
    check(`body: ${label} → 400 field=${field}`, r.status === 400 && r.json?.field === field, JSON.stringify(r.json));
  }

  // Migration + cascade
  check("migration 004_weight_goals.sql recorded", Boolean(await db.prepare("SELECT name FROM schema_migrations WHERE name = '004_weight_goals.sql'").get()));
  const uid = (await db.prepare("SELECT id FROM users WHERE email = ?").get(emailA)).id;
  await db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  check("deleting the account removes its weigh-ins", Number((await db.prepare("SELECT COUNT(*) n FROM weight_entries WHERE user_id = ?").get(uid)).n) === 0);
});
