// Dashboard / steps / body / address API checks.
import { check, suite } from "../helpers/checks.mjs";

suite("Dashboard history, steps, body goals, address", async () => {
  const BASE = process.env.BASE ?? "http://localhost:3100";
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  const today = daysAgo(0);

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
  const email = `dash.${Date.now()}@example.com`;
  await a("/api/auth/register", { method: "POST", body: { name: "Dana Park", email, password: "a good password" } });
  await b("/api/auth/register", { method: "POST", body: { name: "Other", email: `other.${Date.now()}@example.com`, password: "a good password" } });

  // Unauthenticated
  for (const [m, p] of [["GET", `/api/history?period=day&end=${today}`], ["GET", `/api/steps?date=${today}`], ["PUT", "/api/steps"], ["PUT", "/api/account/body"], ["PUT", "/api/account/address"], ["POST", "/api/places/autocomplete"], ["GET", "/api/places/details?placeId=abc"]]) {
    const r = await anon(p, { method: m, body: m === "GET" ? undefined : {} });
    check(`anon ${m} ${p.split("?")[0]} → 401`, r.status === 401, `got ${r.status}`);
  }

  // Body & goals
  let r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 1800, stepsTarget: 8000, heightCm: 172, weightKg: 70 } });
  check("body: save goal 1800, 8000 steps, 172 cm, 70 kg", r.status === 200 && r.json.user.stepsTarget === 8000 && r.json.user.heightCm === 172 && r.json.user.weightKg === 70, JSON.stringify(r.json));
  for (const [body, field] of [[{ calorieGoal: 50 }, "calorieGoal"], [{ calorieGoal: 1800, stepsTarget: 10 }, "stepsTarget"], [{ calorieGoal: 1800, stepsTarget: 8000.5 }, "stepsTarget"], [{ calorieGoal: 1800, heightCm: 20 }, "heightCm"], [{ calorieGoal: 1800, weightKg: 5 }, "weightKg"]]) {
    r = await a("/api/account/body", { method: "PUT", body });
    check(`body: invalid ${field} → 400 field=${field}`, r.status === 400 && r.json?.field === field, JSON.stringify(r.json));
  }
  r = await a("/api/account/body", { method: "PUT", body: { calorieGoal: 1800, stepsTarget: 8000, heightCm: "", weightKg: 70 } });
  check("body: empty height clears it", r.json?.user?.heightCm === null);
  await a("/api/account/body", { method: "PUT", body: { calorieGoal: 1800, stepsTarget: 8000, heightCm: 172, weightKg: 70 } });

  // Address
  r = await a("/api/account/address", { method: "PUT", body: { address: { line1: "", city: "Leeds", country: "UK" } } });
  check("address: missing street → 400 field=line1", r.status === 400 && r.json?.field === "line1");
  r = await a("/api/account/address", { method: "PUT", body: { address: { line1: "12 Park Row", line2: "Flat 3", city: "Leeds", region: "West Yorkshire", postalCode: "LS1 5HD", country: "United Kingdom" } } });
  check("address: saved", r.status === 200 && r.json.user.address?.postalCode === "LS1 5HD", JSON.stringify(r.json));
  r = await a("/api/account");
  check("address: returned with the account", r.json?.user?.address?.city === "Leeds");
  r = await a("/api/account/address", { method: "PUT", body: { address: { line1: "x".repeat(101), city: "Leeds", country: "UK" } } });
  check("address: field over 100 chars → 400", r.status === 400 && r.json?.field === "line1");

  // Places without a key
  r = await a("/api/places/autocomplete", { method: "POST", body: { input: "12 Park Row", sessionToken: "t" } });
  check("places: not configured → 503", r.status === 503, `got ${r.status}`);

  // Steps
  r = await a("/api/steps", { method: "PUT", body: { date: today, steps: 9200 } });
  check("steps: save 9,200 today", r.status === 200);
  r = await a(`/api/steps?date=${today}`);
  check("steps: read back with target", r.json?.steps === 9200 && r.json?.target === 8000, JSON.stringify(r.json));
  r = await a("/api/steps", { method: "PUT", body: { date: today, steps: -1 } });
  check("steps: negative → 400", r.status === 400);
  r = await a("/api/steps", { method: "PUT", body: { date: today, steps: 12.5 } });
  check("steps: fraction → 400", r.status === 400);
  await a("/api/steps", { method: "PUT", body: { date: daysAgo(1), steps: 5000 } });
  r = await a("/api/steps", { method: "PUT", body: { date: daysAgo(1), steps: null } });
  check("steps: null clears the day", r.status === 200 && (await a(`/api/steps?date=${daysAgo(1)}`)).json.steps === null);
  check("steps: isolated per user", (await b(`/api/steps?date=${today}`)).json?.steps === null);

  // Seed food + exercise: today 2 foods (165 + 205 = 370 kcal), 2 days ago oatmeal ×12 (1,992 kcal: over 1,800), 20 days ago 1 food.
  await a("/api/log", { method: "POST", body: { foodId: "chicken-breast", servings: 1, date: today, meal: "lunch" } });
  await a("/api/log", { method: "POST", body: { foodId: "white-rice", servings: 1, date: today, meal: "lunch" } });
  await a("/api/log", { method: "POST", body: { foodId: "oatmeal", servings: 12, date: daysAgo(2), meal: "breakfast" } });
  await a("/api/log", { method: "POST", body: { foodId: "oatmeal", servings: 1, date: daysAgo(20), meal: "breakfast" } });
  await a("/api/exercise", { method: "POST", body: { exerciseId: "run-steady", minutes: 30, date: today } }); // 9.8×70×0.5 = 343
  await a("/api/exercise", { method: "POST", body: { exerciseId: "yoga", minutes: 60, date: daysAgo(3) } }); // 2.5×70 = 175
  await a("/api/steps", { method: "PUT", body: { date: daysAgo(2), steps: 4000 } });

  // History: day
  r = await a(`/api/history?period=day&end=${today}`);
  const d = r.json;
  check("history day: 14 buckets ending today", r.status === 200 && d.buckets.length === 14 && d.buckets.at(-1).start === today && d.buckets[0].start === daysAgo(13), JSON.stringify(d?.buckets?.map((x) => x.start)));
  const t = d.buckets.at(-1);
  check("history day: today's exercise is in the bucket (343 kcal, 30 min)", Math.round(t.burned) === 343 && t.minutes === 30, JSON.stringify(t));
  check("history day: today's food and steps are not (the day isn't over)", t.eaten === 0 && t.foodDays === 0 && t.steps === 0 && t.stepDays === 0, JSON.stringify(t));
  check("history day: today so far comes back separately (370 kcal, 9,200 steps)", Math.round(d.today?.eaten) === 370 && d.today?.steps === 9200, JSON.stringify(d.today));
  check("history day: goal + steps target included", d.calorieGoal === 1800 && d.stepsTarget === 8000);
  const sumOn = d.buckets.reduce((s, x) => s + x.daysOnTarget, 0), sumFood = d.buckets.reduce((s, x) => s + x.foodDays, 0);
  check("history day: 1 finished logged day, 0 within goal (the 1,992 kcal day is over)", sumFood === 1 && sumOn === 0, `${sumFood} ${sumOn}`);
  check("history day: 20-days-ago entry is outside the range", d.buckets.every((x) => x.start !== daysAgo(20)));

  // History: week
  r = await a(`/api/history?period=week&end=${today}`);
  const w = r.json;
  check("history week: 12 buckets, each starting on Monday", w.buckets.length === 12 && w.buckets.every((x) => new Date(x.start + "T12:00").getDay() === 1), JSON.stringify(w.buckets.map((x) => x.start)));
  check("history week: last bucket stops at today", w.buckets.at(-1).end === today && w.buckets.at(-1).days >= 1 && w.buckets.at(-1).days <= 7);
  const weekEaten = w.buckets.reduce((s, x) => s + x.eaten, 0);
  check("history week: total eaten covers the finished days (1,992 + 166, not today's 370)", Math.round(weekEaten) === 1992 + 166, String(weekEaten));
  check("history week: today so far comes back separately", Math.round(w.today?.eaten) === 370, JSON.stringify(w.today));
  check("history week: full weeks have 7 days", w.buckets.slice(0, -1).every((x) => x.days === 7));

  // History: month
  r = await a(`/api/history?period=month&end=${today}`);
  const m = r.json;
  check("history month: 12 buckets on the 1st, oldest first", m.buckets.length === 12 && m.buckets.every((x) => x.start.endsWith("-01")) && m.buckets[0].start < m.buckets.at(-1).start, JSON.stringify(m.buckets.map((x) => x.start)));
  check("history month: last bucket = this month up to today", m.buckets.at(-1).start === today.slice(0, 8) + "01" && m.buckets.at(-1).end === today);

  // Validation + isolation
  check("history: bad period → 400", (await a(`/api/history?period=year&end=${today}`)).status === 400);
  check("history: bad end → 400", (await a(`/api/history?period=day&end=today`)).status === 400);
  r = await b(`/api/history?period=day&end=${today}`);
  check("history: other user sees none of it", r.json.buckets.every((x) => x.eaten === 0 && x.burned === 0 && x.steps === 0));
});
