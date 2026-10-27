// Today's steps / water / food appear in every period as the newest "so far" column; a walks-only
// account is told walks aren't steps.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = (page, name) => page.eval(`const s=[...document.querySelectorAll("section")].find(x=>x.getAttribute("aria-label")===${JSON.stringify(name)}); return s ? s.innerText : ""`);
const lastColumnLabel = (page, name) => page.eval(`const s=[...document.querySelectorAll("section")].find(x=>x.getAttribute("aria-label")===${JSON.stringify(name)}); const r=[...s.querySelectorAll("rect[role=button]")].at(-1); return r ? r.getAttribute("aria-label") : ""`);
async function choose(page, label) {
  await page.eval(`[...document.querySelectorAll("[role=radio]")].find(b=>b.textContent.trim()===${JSON.stringify(label)}).setAttribute("data-cdp","p")`);
  await page.click("[data-cdp='p']");
  await page.eval(`document.querySelectorAll("[data-cdp]").forEach(e=>e.removeAttribute("data-cdp"))`);
  await sleep(1000);
}
const TODAY = `const d=new Date(); const iso=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");`;

async function run(page) {
  await page.viewport(1440, 900, false);

  // A: steps, water and a meal logged today only
  await page.clearCookies();
  await page.goto(`${B}/login`);
  await page.eval(`${TODAY}
    const post=(u,b,m="POST")=>fetch(u,{method:m,headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    await post("/api/auth/register",{name:"Tia Today",email:"tia.${Date.now()}@example.com",password:"a good password"});
    await post("/api/account/body",{calorieGoal:2000,stepsTarget:12000},"PUT");
    await post("/api/steps",{date:iso,steps:6400},"PUT");
    await post("/api/water",{date:iso,add:500});
    await post("/api/log",{foodId:"oatmeal",servings:1,date:iso,meal:"breakfast"});`);
  await page.goto(`${B}/dashboard`);
  await sleep(1200);
  // Daily: today's numbers as cards (no charts)
  const card = (name) => panel(page, name);
  ok("Daily: Steps card shows today's 6,400 of 12,000", (await card("Steps")).includes("6,400") && (await card("Steps")).includes("of 12,000"), await card("Steps"));
  ok("Daily: Water card shows 0.5 L of 2 L", (await card("Water")).includes("0.5") && (await card("Water")).includes("of 2 L"), await card("Water"));
  ok("Daily: Calories eaten card shows 166 of the 2,000 goal", (await card("Calories eaten")).includes("166") && (await card("Calories eaten")).includes("of 2,000 kcal goal"), await card("Calories eaten"));
  ok("Daily: no carousel and no charts for these four", !(await page.eval(`return !!document.querySelector("[aria-roledescription=carousel]")`)) && (await page.eval(`return document.querySelectorAll("[aria-label='Steps'] svg").length`)) === 0);
  await page.shot("periods-daily", true);
  for (const [label, key] of [["Weekly", "This week so far"], ["Monthly", "This month so far"]]) {
    await choose(page, label);
    const steps = await panel(page, "Steps");
    ok(`${label}: Steps chart is not empty and keys "${key}"`, !steps.includes("No step counts") && steps.includes(key), steps);
    const col = await lastColumnLabel(page, "Steps");
    ok(`${label}: newest steps column = 6,400 so far`, col.includes("6,400 steps") && /so far/i.test(col), col);
    ok(`${label}: water and eaten show their so-far key too`, (await panel(page, "Water")).includes(key) && (await panel(page, "Calories eaten")).includes(key));
    await page.shot(`periods-${label.toLowerCase()}`, true);
  }
  const overview = await panel(page, "Overview");
  ok("overview still leaves today out of averages", overview.includes("Today counts once it"), overview);

  // B: only walks, no step count
  await page.clearCookies();
  await page.goto(`${B}/login`);
  await page.eval(`${TODAY}
    const post=(u,b,m="POST")=>fetch(u,{method:m,headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    await post("/api/auth/register",{name:"Walt Walker",email:"walt.${Date.now()}@example.com",password:"a good password"});
    await post("/api/exercise",{exerciseId:"walk-outdoor-easy",minutes:30,date:iso});`);
  await page.goto(`${B}/dashboard`);
  await sleep(1200);
  await choose(page, "Weekly"); // the view is remembered per browser; Monthly was picked above
  const s = await panel(page, "Steps");
  ok("walks-only: Steps chart explains walks aren't steps", s.includes("logged walks add minutes, not steps"), s);
  await choose(page, "Daily");
  ok("walks-only: today's Active minutes card shows the walk", (await panel(page, "Active minutes")).includes("30") && (await panel(page, "Calories burned")).includes("in 30 min of exercise"), await panel(page, "Calories burned"));
  ok("walks-only: the daily Steps card points to the exercise page", (await panel(page, "Steps")).includes("Add steps"));
  await page.shot("periods-walks-only", true);
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Today so far in daily, weekly and monthly views", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
