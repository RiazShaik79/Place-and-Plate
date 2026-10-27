// A brand-new account that has logged only today: the dashboard shows "so far", not the empty state.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`
      await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Fay First",email:"fay.${vp}.${Date.now()}@example.com",password:"a good password"})});
      const d = new Date(); const iso = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
      await fetch("/api/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({foodId:"oatmeal",servings:1,date:iso,meal:"breakfast"})});`);
    // Daily: today's card shows the meal
    await page.goto(`${B}/dashboard`);
    await sleep(1000);
    const eaten = await page.eval(`return document.querySelector("section[aria-label='Calories eaten']")?.innerText ?? ""`);
    ok(`${vp}: daily card shows today's 166 kcal`, eaten.includes("166") && eaten.includes("of 2,000 kcal goal"), eaten);
    // Weekly: the overview explains that averages start once today is over
    await page.eval(`localStorage.setItem("ct:dashboard-period","week")`);
    await page.goto(`${B}/dashboard`);
    await sleep(1000);
    const text = await page.eval(`return document.querySelector("[aria-label=Overview]")?.innerText ?? ""`);
    ok(`${vp}: not the empty state`, !text.includes("No meals, workouts or steps in the"), text.slice(0, 80));
    ok(`${vp}: hero says eaten today so far (166)`, text.includes("Eaten today so far") && text.includes("166"), text.slice(0, 120));
    ok(`${vp}: days within goal explains today`, text.includes("Today counts once it"), text);
    await page.shot(`firstday-${vp}`, true);
    await page.eval(`localStorage.removeItem("ct:dashboard-period")`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Dashboard for an account's first day", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
