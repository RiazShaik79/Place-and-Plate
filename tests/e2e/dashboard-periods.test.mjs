// The whole dashboard across Daily / Weekly / Monthly, with data shaped like a real new account
// (a few recent days only). Every card must follow the period switch, say which period it shows,
// and not leave empty space at the bottom.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";

const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PERIOD = { Daily: "day", Weekly: "week", Monthly: "month" };

// Everything visible on the dashboard, per card.
const snapshot = (page) =>
  page.eval(`
    const sections = [...document.querySelectorAll("main section[aria-label]")].filter(s => s.offsetParent !== null && !s.closest("[aria-label] section[aria-label] section"));
    return sections.map(s => {
      const r = s.getBoundingClientRect();
      // Empty space under the last piece of content, inside the card.
      const kids = [...s.querySelectorAll("*")].filter(e => e.offsetParent !== null && e.getBoundingClientRect().height > 0 && !e.querySelector("*"));
      const lastBottom = Math.max(...kids.map(e => e.getBoundingClientRect().bottom));
      return {
        label: s.getAttribute("aria-label"),
        text: s.innerText.replace(/\\s+/g, " ").slice(0, 400),
        columns: s.querySelectorAll("rect[role=button]").length,
        firstX: s.querySelector("svg text.fill-muted")?.textContent ?? null,
        gapBelow: Math.round(r.bottom - lastBottom),
      };
    });`);

async function choose(page, label) {
  await page.eval(`[...document.querySelectorAll("[role=radio]")].find(b=>b.textContent.trim()===${JSON.stringify(label)}).setAttribute("data-cdp","p")`);
  await page.click("[data-cdp='p']");
  await page.eval(`document.querySelectorAll("[data-cdp]").forEach(e=>e.removeAttribute("data-cdp"))`);
  await sleep(1500);
}

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    // Like a real new account: food 3 days ago, exercise yesterday, steps and weight today, water yesterday.
    await page.eval(`
      await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Dee Periods",email:"dee.${vp}.${Date.now()}@example.com",password:"a good password"})});
      const iso=(n)=>{const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
      const put=(u,b,m="POST")=>fetch(u,{method:m,headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
      await put("/api/account/body",{calorieGoal:2000,stepsTarget:8000},"PUT");
      for (const [f,s] of [["oatmeal",2],["chicken-breast",3],["white-rice",2]]) await put("/api/log",{foodId:f,servings:s,date:iso(3),meal:"lunch"});
      await put("/api/exercise",{exerciseId:"walk-outdoor-brisk",minutes:44,date:iso(1)});
      await put("/api/exercise",{exerciseId:"run-steady",minutes:30,date:iso(1)});
      await put("/api/steps",{date:iso(0),steps:6400},"PUT");
      await put("/api/water",{date:iso(1),add:1000});
      await put("/api/weight",{date:iso(0),kg:85},"PUT");
      localStorage.removeItem("ct:dashboard-period");`);
    await page.goto(`${B}/dashboard`);
    await sleep(1500);
    ok(`${vp}: Daily is selected by default`, (await page.eval(`return document.querySelector("[role=radio][aria-checked=true]").textContent`)) === "Daily");

    const seen = {};
    for (const label of ["Daily", "Weekly", "Monthly", "Daily"]) {
      if (!(label === "Daily" && !seen.Daily)) await choose(page, label);
      const snap = await snapshot(page);
      const key = seen[label] ? `${label} again` : label;
      seen[key] = snap;
      const by = Object.fromEntries(snap.map((c) => [c.label, c]));
      const period = PERIOD[label];

      const badge = { day: "Today", week: "Last 12 weeks", month: "Last 12 months" }[period];
      if (period === "day") {
        // Daily is today for every card: numbers, no charts, no averages.
        const want = ["Calories eaten", "Calories burned", "Active minutes", "Steps", "Water", "Weight", "Sleep", "Where your calories came from"];
        ok(`${vp} ${key}: today's cards, in order`, JSON.stringify(snap.map((c) => c.label)) === JSON.stringify(want), JSON.stringify(snap.map((c) => c.label)));
        ok(`${vp} ${key}: no charts in the daily view`, snap.every((c) => c.columns === 0) && (await page.eval(`return document.querySelectorAll("main svg[role=img]").length`)) === 0);
        ok(`${vp} ${key}: steps today 6,400 of 8,000`, by.Steps?.text.includes("6,400") && by.Steps.text.includes("of 8,000"), by.Steps?.text);
        ok(`${vp} ${key}: no exercise today, with a link to log it`, by["Calories burned"]?.text.includes("No exercise logged yet") && by["Active minutes"]?.text.includes("of 21 min a day"), by["Calories burned"]?.text);
        ok(`${vp} ${key}: nothing eaten today shows 0 and Log food`, by["Calories eaten"]?.text.includes("0 kcal") && by["Calories eaten"].text.includes("Log food"), by["Calories eaten"]?.text);
        ok(`${vp} ${key}: weight shows today's 85 kg, view only`, /85\s*kg\s*today/.test(by.Weight?.text ?? "") && !(await page.eval(`return !!document.querySelector("section[aria-label=Weight] input, section[aria-label=Weight] form")`)), by.Weight?.text);
      } else {
        // The exercise pair follows the switch: 12 weekly or 12 monthly columns.
        for (const name of ["Calories burned", "Active minutes"]) ok(`${vp} ${key}: ${name} has 12 columns`, by[name]?.columns === 12, JSON.stringify(by[name]));
        ok(`${vp} ${key}: Overview is shown`, Boolean(by.Overview));
      }
      // Every card says which period it shows.
      for (const c of snap) if (c.label !== "Food, steps, water, weight and sleep") ok(`${vp} ${key}: "${c.label}" is labelled "${badge}"`, c.text.includes(badge), c.text.slice(0, 120));
      // No big empty band at the bottom of any card (padding is 20–24px).
      for (const c of snap) if (c.label !== "Food, steps, water, weight and sleep") ok(`${vp} ${key}: "${c.label}" has no large empty space at the bottom`, c.gapBelow <= 56, `${c.gapBelow}px`);
      await page.shot(`dash-periods-${vp}-${key.replace(" ", "-").toLowerCase()}`, true);
    }
    // 4. The views really differ: the exercise charts' first labels change between periods.
    const firstX = (snap, name) => snap.find((c) => c.label === name)?.firstX;
    ok(`${vp}: exercise chart x-axis changes Weekly → Monthly`, firstX(seen.Weekly, "Calories burned") !== firstX(seen.Monthly, "Calories burned"), JSON.stringify([firstX(seen.Weekly, "Calories burned"), firstX(seen.Monthly, "Calories burned")]));
    ok(`${vp}: going back to Daily shows today's cards again`, JSON.stringify(seen.Daily.map((c) => c.label)) === JSON.stringify(seen["Daily again"].map((c) => c.label)));
    const o = await page.overflow();
    ok(`${vp}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Dashboard: every card follows Daily / Weekly / Monthly", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
