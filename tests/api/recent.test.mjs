// Recent foods, favourites, add-again (repeat) and edit-entry APIs.
import { db } from "../helpers/db.mjs";
import { check, suite } from "../helpers/checks.mjs";

suite("Recent foods, favourites, add again, edit entry", async () => {
  const BASE = process.env.BASE ?? "http://localhost:3100";
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  const today = daysAgo(0), yday = daysAgo(1);
  const near = (a, b) => Math.abs(a - b) < 0.01;

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
  const emailA = `recent.${Date.now()}@example.com`;
  await a("/api/auth/register", { method: "POST", body: { name: "Rae Recent", email: emailA, password: "a good password" } });
  await b("/api/auth/register", { method: "POST", body: { name: "Other", email: `recent.other.${Date.now()}@example.com`, password: "a good password" } });

  for (const [m, p, body] of [["GET", `/api/log/recent?today=${today}`], ["POST", "/api/log/repeat", {}], ["POST", "/api/favorites", {}], ["DELETE", "/api/favorites/1"], ["PATCH", "/api/log/1", {}]]) {
    const r = await anon(p, { method: m, body });
    check(`anon ${m} ${p.split("?")[0]} → 401`, r.status === 401, `got ${r.status}`);
  }

  let r = await a(`/api/log/recent?today=${today}`);
  check("recent: empty at first", r.status === 200 && r.json.recent.length === 0 && r.json.favorites.length === 0, JSON.stringify(r.json));
  check("recent: bad today → 400", (await a("/api/log/recent?today=x")).status === 400);

  // Log: oatmeal x1.5 yesterday and today, an AI item, banana
  const oat1 = (await a("/api/log", { method: "POST", body: { foodId: "oatmeal", servings: 1.5, date: yday, meal: "breakfast" } })).json.entry;
  await a("/api/log", { method: "POST", body: { foodId: "banana", servings: 1, date: yday, meal: "snack" } });
  const ai = (await a("/api/log/custom", { method: "POST", body: { date: yday, meal: "lunch", source: "text", items: [{ name: "Chicken Wrap", portion: "1 wrap", calories: 450, protein: 30, carbs: 40, fat: 15 }] } })).json.entries[0];
  const oat2 = (await a("/api/log", { method: "POST", body: { foodId: "oatmeal", servings: 1.5, date: today, meal: "breakfast" } })).json.entry;

  r = await a(`/api/log/recent?today=${today}`);
  const rec = r.json.recent;
  check("recent: 3 distinct foods, newest first", rec.length === 3 && rec[0].foodId === "oatmeal", JSON.stringify(rec.map((x) => x.name)));
  const oat = rec.find((x) => x.foodId === "oatmeal");
  check("recent: oatmeal uses 2, last 1.5 servings, newest entry", oat.uses === 2 && oat.lastServings === 1.5 && oat.entryId === oat2.id, JSON.stringify(oat));
  check("recent: per-serving kcal = 166", near(oat.calories, 166), String(oat.calories));
  const wrap = rec.find((x) => x.name === "Chicken Wrap");
  check("recent: AI item keyed by name + portion", wrap?.key === "ai:chicken wrap|1 wrap" && near(wrap.calories, 450), JSON.stringify(wrap));
  check("recent: other account sees nothing", (await b(`/api/log/recent?today=${today}`)).json.recent.length === 0);

  // Repeat
  r = await a("/api/log/repeat", { method: "POST", body: { date: today, meal: "lunch", items: [{ entryId: ai.id }, { entryId: oat1.id, servings: 3 }] } });
  check("repeat: 201 with 2 entries", r.status === 201 && r.json.entries.length === 2, JSON.stringify(r.json));
  const [w2, o3] = r.json.entries ?? [];
  check("repeat: AI copy keeps name, portion, kcal and meal", w2?.name === "Chicken Wrap" && w2?.servingSize === "1 wrap" && near(w2.calories, 450) && w2.meal === "lunch" && w2.foodId === "ai:text", JSON.stringify(w2));
  check("repeat: oatmeal at 3 servings = 498 kcal, macros scaled", near(o3?.calories, 498) && near(o3?.protein, 5.9 * 3), JSON.stringify(o3));
  for (const [label, body, code] of [
    ["another user's entry", { date: today, meal: "lunch", items: [{ entryId: ai.id }] }, 404],
    ["bad meal", { date: today, meal: "brunch", items: [{ entryId: ai.id }] }, 400],
    ["bad date", { date: "16/10", meal: "lunch", items: [{ entryId: ai.id }] }, 400],
    ["no items", { date: today, meal: "lunch", items: [] }, 400],
    ["31 items", { date: today, meal: "lunch", items: Array.from({ length: 31 }, () => ({ entryId: ai.id })) }, 400],
    ["servings 0", { date: today, meal: "lunch", items: [{ entryId: ai.id, servings: 0 }] }, 400],
    ["both ids", { date: today, meal: "lunch", items: [{ entryId: ai.id, favoriteId: 1 }] }, 400],
    ["nutrition from the client is ignored", null, null],
  ]) {
    if (!body) continue;
    r = await (label === "another user's entry" ? b : a)("/api/log/repeat", { method: "POST", body });
    check(`repeat: ${label} → ${code}`, r.status === code, `${r.status} ${JSON.stringify(r.json)}`);
  }
  // A mix with one foreign id adds nothing
  const before = (await a(`/api/log?date=${today}`)).json.entries.length;
  const foreign = (await b("/api/log", { method: "POST", body: { foodId: "apple", servings: 1, date: today, meal: "snack" } })).json.entry;
  r = await a("/api/log/repeat", { method: "POST", body: { date: today, meal: "snack", items: [{ entryId: oat1.id }, { entryId: foreign.id }] } });
  check("repeat: one foreign id → 404 and nothing added", r.status === 404 && (await a(`/api/log?date=${today}`)).json.entries.length === before);

  // Favourites
  r = await a("/api/favorites", { method: "POST", body: { entryId: oat1.id } });
  const fav = r.json?.favorite;
  check("favourite: star oatmeal → one serving (166 kcal)", r.status === 200 && near(fav.calories, 166) && fav.key === "oatmeal", JSON.stringify(r.json));
  r = await a("/api/favorites", { method: "POST", body: { entryId: oat2.id } });
  check("favourite: starring again is a no-op (same id)", r.json?.favorite?.id === fav.id);
  check("favourite: listed once, and recent marks it", (await a(`/api/log/recent?today=${today}`)).json.favorites.length === 1 && (await a(`/api/log/recent?today=${today}`)).json.recent.find((x) => x.foodId === "oatmeal").favoriteId === fav.id);
  check("favourite: another user's entry → 404", (await b("/api/favorites", { method: "POST", body: { entryId: oat1.id } })).status === 404);
  check("favourite: bad entryId → 400", (await a("/api/favorites", { method: "POST", body: { entryId: "x" } })).status === 400);
  r = await a("/api/log/repeat", { method: "POST", body: { date: today, meal: "dinner", items: [{ favoriteId: fav.id, servings: 2 }] } });
  check("repeat from a favourite at 2 servings = 332 kcal", r.status === 201 && near(r.json.entries[0].calories, 332), JSON.stringify(r.json));
  check("favourite: other user can't use it", (await b("/api/log/repeat", { method: "POST", body: { date: today, meal: "dinner", items: [{ favoriteId: fav.id }] } })).status === 404);
  check("favourite: other user can't delete it → 404", (await b(`/api/favorites/${fav.id}`, { method: "DELETE" })).status === 404);
  check("favourite: delete → 204", (await a(`/api/favorites/${fav.id}`, { method: "DELETE" })).status === 204);
  check("favourite: gone", (await a(`/api/log/recent?today=${today}`)).json.favorites.length === 0);

  // Edit
  r = await a(`/api/log/${oat2.id}`, { method: "PATCH", body: { servings: 3 } });
  check("edit: 1.5 → 3 servings doubles kcal (249 → 498) and macros", r.status === 200 && r.json.entry.servings === 3 && near(r.json.entry.calories, 498) && near(r.json.entry.fat, 3.6 * 3), JSON.stringify(r.json));
  r = await a(`/api/log/${oat2.id}`, { method: "PATCH", body: { meal: "dinner" } });
  check("edit: move to dinner keeps the numbers", r.json?.entry?.meal === "dinner" && near(r.json.entry.calories, 498));
  r = await a(`/api/log/${w2.id}`, { method: "PATCH", body: { servings: 2 } });
  check("edit: an AI entry scales too (2 x 1 wrap = 900)", near(r.json?.entry?.calories, 900) && r.json.entry.servingSize === "1 wrap");
  for (const [label, body, code, who] of [
    ["servings 0", { servings: 0 }, 400, a], ["servings 101", { servings: 101 }, 400, a], ["bad meal", { meal: "tea" }, 400, a],
    ["nothing to change", {}, 400, a], ["another user's entry", { servings: 2 }, 404, b],
  ]) {
    r = await who(`/api/log/${oat2.id}`, { method: "PATCH", body });
    check(`edit: ${label} → ${code}`, r.status === code, `${r.status}`);
  }
  check("edit: bad id → 400", (await a("/api/log/abc", { method: "PATCH", body: { servings: 2 } })).status === 400);

  // Migration + cascade
  check("migration 003_favorites.sql recorded", Boolean(await db.prepare("SELECT name FROM schema_migrations WHERE name = '003_favorites.sql'").get()));
  await a("/api/favorites", { method: "POST", body: { entryId: oat1.id } });
  const uid = (await db.prepare("SELECT id FROM users WHERE email = ?").get(emailA)).id;
  await db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  check("cascade: deleting the account removes its favourites", Number((await db.prepare("SELECT COUNT(*) n FROM favorite_foods WHERE user_id = ?").get(uid)).n) === 0);
});
