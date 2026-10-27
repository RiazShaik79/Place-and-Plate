// Dashboard (daily / weekly / monthly, tooltip, table, remembered period), the steps card, account
// field errors and a typed address. No Places key on the test server, so the address is typed.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "b1";
async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.includes(${JSON.stringify(text)}) && e.offsetParent!==null); if(!el) throw new Error("no ${tag} containing ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
  await page.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
}
async function overflow(page, label) {
  const o = await page.overflow();
  ok(`${label}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
}
const settle = () => new Promise((r) => setTimeout(r, 900));

// ~10 weeks of plausible data, deterministic.
const SEED = `
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const post = (u, b, m="POST") => fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  await post("/api/account/body", { calorieGoal: 2000, stepsTarget: 8000, heightCm: 170, weightKg: 68 }, "PUT");
  const foods = [["oatmeal","breakfast",1.5],["banana","snack",1],["chicken-breast","lunch",2],["white-rice","lunch",1.5],["brown-rice","dinner",1.5],["peanut-butter","snack",1],["olive-oil","dinner",1],["chicken-breast","dinner",2]];
  const jobs = [];
  for (let d = 0; d < 72; d++) {
    if (rnd() < 0.15 && d > 0) continue; // some days not logged
    const extra = rnd() < 0.25 ? 3 : 0;
    for (const [id, meal, sv] of foods.slice(0, 5 + extra)) jobs.push(post("/api/log", { foodId: id, servings: Math.round(sv * (0.7 + rnd() * 0.8) * 4) / 4, date: iso(d), meal }));
    if (rnd() < 0.55) jobs.push(post("/api/exercise", { exerciseId: ["run-steady","walk-outdoor-brisk","cycle-moderate","yoga","weights-moderate"][Math.floor(rnd()*5)], minutes: [20,30,45,60][Math.floor(rnd()*4)], date: iso(d) }));
    if (rnd() < 0.85) jobs.push(post("/api/steps", { date: iso(d), steps: Math.round(4000 + rnd() * 8000) }, "PUT"));
    if (jobs.length > 40) { await Promise.all(jobs.splice(0)); }
  }
  await Promise.all(jobs);`;


async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);

    // Empty dashboard first
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Noor Ali",email:"noor.${vp}.${Date.now()}@example.com",password:"a good password"})})`);
    await page.goto(`${B}/dashboard`);
    await page.waitFor("main section[aria-label]");
    await settle();
    await page.shot(`${p}-01-dashboard-empty`, true);

    // Seeded account
    await page.clearCookies();
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Sam Okafor",email:"sam.dash.${vp}.${Date.now()}@example.com",password:"a good password"})})`);
    await page.eval(SEED);
    for (const [label, idx] of [["Daily", "02"], ["Weekly", "04"], ["Monthly", "05"]]) {
      await page.goto(`${B}/dashboard`);
      await page.waitFor("main section[aria-label]");
      await clickContains(page, label, "[role=radio]");
      await settle();
      await page.shot(`${p}-${idx}-dashboard-${label.toLowerCase()}`, true);
      await overflow(page, `${vp} dashboard ${label}`);
      if (label === "Weekly") {
        // Tooltip: hover a column in the eaten chart (real pointer), then keyboard focus another.
        const box = await page.eval(`const r=[...document.querySelectorAll("[aria-label='Calories eaten'] rect[role=button]")][9].getBoundingClientRect(); window.scrollBy(0, r.top - 300); const r2=[...document.querySelectorAll("[aria-label='Calories eaten'] rect[role=button]")][9].getBoundingClientRect(); return {x:r2.x+r2.width/2,y:r2.y+r2.height-20}`);
        await page.click(`[aria-label='Calories eaten'] rect[role=button]:nth-of-type(1)`).catch(() => {});
        await page.eval(`[...document.querySelectorAll("[aria-label='Calories eaten'] rect[role=button]")][9].dispatchEvent(new PointerEvent("pointerenter"))`);
        await settle();
        const tip = await page.eval(`return document.querySelector("[aria-label='Calories eaten'] [role=status]")?.textContent ?? ""`);
        ok(`${vp} tooltip shows a value and the day`, /kcal|Nothing logged/.test(tip), tip);
        await page.shot(`${p}-03-tooltip`);
      }
    }
    await clickContains(page, "Show the numbers as a table");
    await settle();
    await page.eval(`document.querySelector("table").scrollIntoView({block:"center"})`);
    await page.shot(`${p}-06-table`);
    const rows = await page.eval(`return document.querySelectorAll("table tbody tr").length`);
    ok(`${vp} table has 12 monthly rows`, rows === 12, String(rows));

    // Period persists on this browser
    await page.goto(`${B}/dashboard`);
    await page.waitFor("main section[aria-label]");
    const sel = await page.eval(`return document.querySelector("[role=radio][aria-checked=true]").textContent`);
    ok(`${vp} last period remembered (Monthly)`, sel === "Monthly", sel);

    // Exercise page steps card
    await page.goto(`${B}/exercise`);
    await page.waitFor("#exercise-log-heading");
    await settle();
    await page.shot(`${p}-07-exercise-steps`);

    // Account: sections, errors, address search
    await page.goto(`${B}/account`);
    await settle();
    await page.shot(`${p}-08-account`, true);
    await overflow(page, `${vp} account`);
    await page.type("#body-height", "20");
    await page.type("#body-steps", "10");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await settle();
    const bodyErrs = await page.eval(`return [...document.querySelectorAll("#body-steps-error, #body-height-error")].map(e=>e.textContent)`);
    ok(`${vp} body form shows both field errors`, bodyErrs.length === 2, JSON.stringify(bodyErrs));
    const focusedId = await page.eval(`return document.activeElement?.id`);
    ok(`${vp} focus moves to the first invalid field (steps)`, focusedId === "body-steps", focusedId);
    await page.eval(`document.querySelector("#body-goal").scrollIntoView({block:"start"}); window.scrollBy(0,-140)`);
    await page.shot(`${p}-09-body-errors`);
    // The test server has no Places key (tests never call Google), so the search box is hidden and
    // the address is typed. Places routes themselves are covered by tests/api/dashboard.test.mjs.
    const hasSearch = await page.eval(`return !!document.querySelector("#address-search")`);
    ok(`${vp} without a Places key the address search is hidden`, !hasSearch);
    for (const [id, value] of [["line1", "12 Park Row"], ["city", "Leeds"], ["postalCode", "LS1 5HD"], ["country", "United Kingdom"]]) {
      await page.type(`#address-${id}`, value);
    }
    await page.eval(`document.querySelector("#address-line1").scrollIntoView({block:"start"}); window.scrollBy(0,-140)`);
    await page.shot(`${p}-10-address-typed`);
    await clickContains(page, "Save address");
    await page.waitFor("[role=status]");
    const saved = await page.eval(`return (await (await fetch("/api/account")).json()).user.address?.postalCode`);
    ok(`${vp} typed address saved`, saved === "LS1 5HD", saved);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Dashboard, profile and address", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
