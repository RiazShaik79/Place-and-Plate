// Round 2: AI error states (mocked), week-strip keyboard use, food → exercise date hand-off.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "e2";

async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.includes(${JSON.stringify(text)}) && e.offsetParent!==null); if(!el) throw new Error("no ${tag} containing ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
  await page.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
}
const mock = (page, status, body) =>
  page.eval(`
    window.__orig = window.__orig || window.fetch;
    window.fetch = async (url, init) => {
      if (String(url).includes("/api/ai/")) { await new Promise(r=>setTimeout(r,300)); return new Response(JSON.stringify(${JSON.stringify(body)}), {status:${status}, headers:{"Content-Type":"application/json"}}); }
      return window.__orig(url, init);
    };`);

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Kim Lee",email:"kim.${vp}.${Date.now()}@example.com",password:"a good password"})})`);

    // Food page, no exercise: link offers to log; previous day → link carries the date
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    await new Promise((r) => setTimeout(r, 600));
    const linkText = await page.eval(`return document.querySelector("a[href^='/exercise?date=']")?.textContent ?? "missing"`);
    ok(`${vp} food link with no exercise`, linkText.includes("No exercise logged") && linkText.includes("Log exercise"), linkText);
    await page.click("button[aria-label='Previous day']");
    await new Promise((r) => setTimeout(r, 600));
    const href = await page.eval(`return document.querySelector("a[href^='/exercise?date=']").getAttribute("href")`);
    await page.click("a[href^='/exercise?date=']");
    await page.waitForUrl("/exercise");
    await page.waitFor("#exercise-log-heading");
    const heading = await page.eval(`return document.querySelector("h1").textContent`);
    ok(`${vp} hand-off opens the same day (${href})`, heading === "Yesterday", heading);
    await page.shot(`${p}-01-handoff-yesterday`);

    // Week strip by keyboard: focus Monday's bar, Enter → that day
    await page.eval(`document.querySelectorAll("[aria-label='Exercise summary'] ol button")[2].focus()`);
    await page.shot(`${p}-02-week-focus`);
    await page.key("Enter", "Enter", 13);
    await new Promise((r) => setTimeout(r, 600));
    const h2 = await page.eval(`return document.querySelector("h1").textContent`);
    const cur = await page.eval(`return document.querySelector("[aria-label='Exercise summary'] ol button[aria-current=date]")?.getAttribute("aria-label")`);
    ok(`${vp} Enter on a bar opens that day`, h2 !== "Yesterday" && !!cur, `${h2} / ${cur}`);

    // AI errors: rate limit, then nothing found
    await page.goto(`${B}/exercise`);
    await page.waitFor("#exercise-log-heading");
    await mock(page, 429, { error: "Gemini rate limit reached, try again shortly" });
    await clickContains(page, "Describe", "[role=tab]");
    await page.type("#exercise-ai-text", "45 min spin class");
    await clickContains(page, "Estimate");
    await page.waitFor("#ex-panel-text [role=alert]");
    const err = await page.eval(`return document.querySelector("#ex-panel-text [role=alert]").textContent`);
    ok(`${vp} rate limit shows friendly message`, err.includes("busy"), err);
    await page.eval(`document.querySelector("#ex-panel-text").scrollIntoView({block:"center"})`);
    await page.shot(`${p}-03-ai-rate-limit`);
    await mock(page, 200, { items: [], totals: { minutes: 0, calories: 0 }, notes: "That describes a meal, not physical activity.", weightKg: 70, weightIsDefault: true });
    await page.type("#exercise-ai-text", "a cheese sandwich");
    await clickContains(page, "Estimate");
    await new Promise((r) => setTimeout(r, 700));
    const none = await page.eval(`return document.querySelector("#ex-panel-text [role=alert]").textContent`);
    ok(`${vp} non-exercise input explains itself`, none.includes("No exercise found") && none.includes("meal"), none);
    await page.shot(`${p}-04-ai-none-found`);

    // Search with no match → hand-off to Describe
    await clickContains(page, "Search", "[role=tab]");
    await page.type("#exercise-search", "underwater hockey");
    await page.shot(`${p}-05-search-no-match`);
    await clickContains(page, "Describe it and let AI estimate it instead");
    const tab = await page.eval(`return document.querySelector("[role=tab][aria-selected=true]").textContent`);
    ok(`${vp} no-match link switches to Describe`, tab.includes("Describe"), tab);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Exercise page states with mocked AI", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
