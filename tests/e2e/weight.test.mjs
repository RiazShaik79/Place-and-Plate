// Weight panel on the dashboard (log, trend, goal progress, table) and the suggested calorie goal in
// Account → Body and goals, through to the Food page. Desktop + mobile.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";

const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = (page) => page.eval(`return document.querySelector("section[aria-label=Weight]")?.innerText ?? ""`);
// React listens for the native value setter + an input/change event.
const setValue = (page, sel, value) =>
  page.eval(`const el=document.querySelector(${JSON.stringify(sel)}); const proto=el.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,"value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName==="SELECT"?"change":"input",{bubbles:true}));`);

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    // Three weeks of weigh-ins, drifting down from 82 kg
    await page.eval(`
      await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Wes Weigh",email:"wes.${vp}.${Date.now()}@example.com",password:"a good password"})});
      const iso=(n)=>{const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
      for (let n=20; n>=1; n--) if (n % 3 !== 1) await fetch("/api/weight",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:iso(n), kg: Math.round((80 + n*0.1 + (n%2 ? 0.4 : -0.3))*10)/10})});`);

    // Dashboard (Weekly: the weight chart is in the carousel): no goal yet, then log today's weight
    await page.eval(`localStorage.setItem("ct:dashboard-period","week")`);
    await page.goto(`${B}/dashboard`);
    await sleep(1200);
    let t = await panel(page);
    ok(`${vp}: Weight panel shows the trend and asks for a goal`, t.includes("Trend") && t.includes("Set a goal weight"), t.slice(0, 200));
    const dots = await page.eval(`return document.querySelectorAll("section[aria-label=Weight] circle[role=button]").length`);
    ok(`${vp}: one point per weigh-in in the last 12 weeks`, dots === 13, String(dots));
    ok(`${vp}: the dashboard Weight card is view only`, !(await page.eval(`return !!document.querySelector("section[aria-label=Weight] input")`)));
    // Log today's weight on the exercise page, next to steps
    await page.goto(`${B}/exercise`);
    await sleep(1200);
    await page.clickText("Add weight");
    await page.type("#weight-input", "7");
    await page.clickText("Save weight");
    await sleep(200);
    ok(`${vp}: an out-of-range weight shows an inline error`, (await page.eval(`return document.querySelector("#weight-input-error")?.innerText ?? ""`)).includes("30 to 300"));
    await page.type("#weight-input", "79.6");
    await page.clickText("Save weight");
    await sleep(900);
    ok(`${vp}: toast confirms`, (await page.eval(`return document.querySelector("[aria-live] [role=status]")?.innerText ?? ""`)).includes("Weight saved"));
    ok(`${vp}: the exercise page shows today's 79.6 kg`, (await page.eval(`return document.body.innerText`)).includes("79.6 kg"));
    await page.shot(`weight-${vp}-00-exercise-card`);
    await page.goto(`${B}/dashboard`);
    await sleep(1200);
    const after = await page.eval(`return document.querySelectorAll("section[aria-label=Weight] circle[role=button]").length`);
    ok(`${vp}: today's weigh-in appears`, after === dots + 1, `${dots} → ${after}`);
    // Keyboard focus on the newest point opens its tooltip (the same state hover uses).
    await page.eval(`[...document.querySelectorAll("section[aria-label=Weight] circle[role=button]")].at(-1).focus()`);
    await sleep(200);
    const tip = await page.eval(`return document.querySelector("section[aria-label=Weight] [role=status]")?.innerText ?? ""`);
    ok(`${vp}: tooltip shows weight, day and trend`, tip.includes("79.6 kg") && tip.includes("Trend"), tip);
    await page.clickText("Show the weigh-ins");
    await sleep(200);
    const rows = await page.eval(`return document.querySelectorAll("section[aria-label=Weight] tbody tr").length`);
    ok(`${vp}: table lists every weigh-in`, rows === after, `${rows} vs ${after}`);
    await page.eval(`document.querySelector("section[aria-label=Weight]").scrollIntoView({block:"start"}); window.scrollBy(0,-100)`);
    await page.shot(`weight-${vp}-01-panel`);

    // Account: profile → suggested goal → use it → save
    await page.goto(`${B}/account`);
    await sleep(900);
    t = await page.eval(`return document.querySelector("section[aria-labelledby='section-body-and-goals']")?.innerText ?? ""`);
    ok(`${vp}: before details, the card says what's missing`, t.includes("Add your year of birth, height and activity level"), t.match(/Add your[^.]*/)?.[0] ?? t.slice(0, 300));
    await page.type("#body-birth-year", String(new Date().getFullYear() - 35));
    await page.type("#body-height", "178");
    await page.type("#body-weight", "80");
    await setValue(page, "#body-activity", "moderate");
    await setValue(page, "#body-sex", "male");
    await setValue(page, "#body-pace", "-0.5");
    await page.type("#body-goal-weight", "75");
    await sleep(200);
    t = await page.eval(`return document.querySelector("section[aria-labelledby='section-body-and-goals']")?.innerText ?? ""`);
    ok(`${vp}: suggests 2,150 kcal (maintenance about 2,700, minus 550)`, t.includes("Suggested goal") && t.includes("2,150 kcal") && t.includes("2,700") && t.includes("550"), t.match(/Suggested goal[\s\S]{0,220}/)?.[0]);
    await setValue(page, "#body-sex", "");
    await sleep(150);
    t = await page.eval(`return document.querySelector("section[aria-labelledby='section-body-and-goals']")?.innerText ?? ""`);
    ok(`${vp}: without sex it's lower and says it's rougher`, t.includes("2,020 kcal") && t.includes("rougher estimate"), t.match(/Suggested goal[\s\S]{0,260}/)?.[0]);
    await setValue(page, "#body-sex", "male");
    await page.eval(`document.querySelector("#body-goal-weight").scrollIntoView({block:"start"}); window.scrollBy(0,-120)`);
    await page.shot(`weight-${vp}-02-suggestion`);
    await page.clickText("Use 2,150 kcal");
    ok(`${vp}: Use fills the calorie goal`, (await page.eval(`return document.querySelector("#body-goal").value`)) === "2150");
    ok(`${vp}: …and the card says it's the goal`, (await page.eval(`return document.querySelector("section[aria-labelledby='section-body-and-goals']").innerText`)).includes("This is your goal"));
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await sleep(1000);
    const me = await page.eval(`return (await (await fetch("/api/account")).json()).user`);
    ok(`${vp}: profile saved`, me.activity === "moderate" && me.sex === "male" && me.goalWeightKg === 75 && me.weeklyChangeKg === -0.5, JSON.stringify(me));
    await page.shot(`weight-${vp}-03-account`, true);
    const o = await page.overflow();
    ok(`${vp}: account has no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);

    // The new goal reaches the Food page; the dashboard shows goal progress
    await page.goto(`${B}/`);
    await sleep(1200);
    const food = await page.eval(`return document.querySelector("[aria-label='Daily summary']")?.innerText ?? ""`);
    ok(`${vp}: Food page uses the 2,150 kcal goal`, food.includes("2,150"), food.slice(0, 120));
    await page.goto(`${B}/dashboard`);
    await sleep(1200);
    t = await panel(page);
    ok(`${vp}: dashboard shows kg to go, weeks at the pace and the goal line key`, /to go to 75 kg, about \d+ weeks at 0\.5 kg a week/.test(t) && t.includes("Goal, 75 kg"), t.slice(0, 260));
    const o2 = await page.overflow();
    ok(`${vp}: dashboard has no horizontal overflow`, o2.scrollWidth <= o2.innerWidth, `${o2.scrollWidth}/${o2.innerWidth}`);
    await page.eval(`document.querySelector("section[aria-label=Weight]").scrollIntoView({block:"start"}); window.scrollBy(0,-100)`);
    await page.shot(`weight-${vp}-04-goal`);
    // Daily: just the latest weigh-in, with the same progress line, and no chart
    await page.eval(`localStorage.setItem("ct:dashboard-period","day")`);
    await page.goto(`${B}/dashboard`);
    await sleep(1200);
    t = await panel(page);
    ok(`${vp}: daily Weight card shows today's 80 kg and progress, no chart`, /\b80\s*kg\s*today/.test(t) && t.includes("to go to 75 kg") && (await page.eval(`return document.querySelectorAll("section[aria-label=Weight] svg").length`)) === 0, t.slice(0, 200));
    await page.shot(`weight-${vp}-05-daily`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Weight panel and suggested calorie goal", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
