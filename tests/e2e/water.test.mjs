// Water card on the food page, the account target, and the dashboard chart. Desktop + mobile.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cardText = (page) => page.eval(`return document.querySelector("[role=progressbar][aria-label^='Water']")?.closest(".rounded-card")?.innerText ?? ""`);
async function clickLabel(page, label) {
  await page.eval(`const el=document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}); if(!el) throw new Error("no ${label}"); el.scrollIntoView({block:"center"});`);
  await page.click(`[aria-label="${label}"]`);
}
async function clickText(page, text, tag = "button") {
  await page.eval(`document.querySelectorAll("[data-cdp]").forEach(e=>e.removeAttribute("data-cdp")); const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)} && e.offsetParent!==null); if(!el) throw new Error("no ${tag} ${text}"); el.scrollIntoView({block:"center"}); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
}
async function overflow(page, label) {
  const o = await page.overflow();
  ok(`${label}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
}

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Wren Water",email:"wren.${vp}.${Date.now()}@example.com",password:"a good password"})})`);

    await page.goto(`${B}/`);
    await sleep(1200);
    let t = await cardText(page);
    ok(`${vp}: card shows 0 L of 2 L`, t.includes("Water") && t.includes("0 L of 2 L"), t);
    await page.shot(`water-${vp}-01-empty`);

    await clickLabel(page, "Add a glass of water, 250 ml");
    await sleep(500);
    t = await cardText(page);
    ok(`${vp}: a glass → 0.25 L`, t.includes("0.25 L of 2 L"), t);
    const toast = await page.eval(`return document.querySelector("[aria-live] [role=status]")?.innerText ?? ""`);
    ok(`${vp}: toast says added with Undo`, toast.includes("Added 250 ml of water") && toast.includes("Undo"), toast);
    await page.shot(`water-${vp}-02-glass-toast`);
    await clickText(page, "Undo");
    await sleep(600);
    t = await cardText(page);
    ok(`${vp}: Undo → back to 0 L`, t.includes("0 L of 2 L"), t);

    // Three fast taps all count
    for (let i = 0; i < 3; i++) await clickLabel(page, "Add a bottle of water, 500 ml");
    await sleep(900);
    t = await cardText(page);
    ok(`${vp}: three quick bottles → 1.5 L`, t.includes("1.5 L of 2 L"), t);

    // Exact total
    await clickText(page, "Edit");
    await page.eval(`const i=document.querySelector("#water-input"); i.select();`);
    await page.type("#water-input", "2100");
    await clickText(page, "Save water");
    await sleep(600);
    t = await cardText(page);
    ok(`${vp}: Edit → 2100 → 2.1 L with Target reached`, t.includes("2.1 L of 2 L") && t.includes("Target reached"), t);
    await page.shot(`water-${vp}-03-reached`);

    // Invalid exact total
    await clickText(page, "Edit");
    await page.eval(`document.querySelector("#water-input").select();`);
    await page.type("#water-input", "lots");
    await clickText(page, "Save water");
    await sleep(200);
    const err = await page.eval(`return document.querySelector("#water-error")?.innerText ?? ""`);
    ok(`${vp}: invalid total shows an inline error`, err.includes("whole number of ml"), err);
    await page.key("Escape", "Escape", 27);

    // Persists; another day is separate
    await page.goto(`${B}/`);
    await sleep(1200);
    ok(`${vp}: reload keeps 2.1 L`, (await cardText(page)).includes("2.1 L"));
    await page.click("button[aria-label='Previous day']");
    await sleep(900);
    ok(`${vp}: previous day has its own total (0 L)`, (await cardText(page)).includes("0 L of 2 L"));
    await clickLabel(page, "Add a glass of water, 250 ml");
    await sleep(500);
    await overflow(page, `${vp} food`);

    // Account target
    await page.goto(`${B}/account`);
    await sleep(700);
    await page.eval(`document.querySelector("#body-water").scrollIntoView({block:"center"})`);
    await page.type("#body-water", "100");
    await page.eval(`document.querySelector("#body-water").closest("form").requestSubmit()`);
    await sleep(400);
    const aerr = await page.eval(`return document.querySelector("#body-water-error")?.innerText ?? ""`);
    ok(`${vp}: account rejects a 100 ml target`, aerr.includes("500"), aerr);
    await page.eval(`const i=document.querySelector("#body-water"); i.select();`);
    await page.type("#body-water", "2500");
    await page.eval(`document.querySelector("#body-water").closest("form").requestSubmit()`);
    await sleep(900);
    await page.shot(`water-${vp}-04-account`, true);
    await overflow(page, `${vp} account`);
    await page.goto(`${B}/`);
    await sleep(1200);
    t = await cardText(page);
    ok(`${vp}: food card uses the 2.5 L target`, t.includes("2.1 L of 2.5 L") && !t.includes("Target reached"), t);

    // Dashboard: Daily shows today's card; Weekly has the chart in the carousel
    await page.eval(`localStorage.setItem("ct:dashboard-period","day")`);
    await page.goto(`${B}/dashboard`);
    await sleep(1200);
    const todayCard = await page.eval(`return document.querySelector("section[aria-label=Water]")?.innerText ?? ""`);
    ok(`${vp}: daily Water card shows 2.1 L of 2.5 L`, todayCard.includes("2.1") && todayCard.includes("of 2.5 L"), todayCard);
    await page.eval(`localStorage.setItem("ct:dashboard-period","week")`);
    await page.goto(`${B}/dashboard`);
    await sleep(1200);
    const dash = await page.eval(`const s=[...document.querySelectorAll("section")].find(x=>x.getAttribute("aria-label")==="Water"); return s ? s.innerText : ""`);
    ok(`${vp}: dashboard has a Water chart with the 2.5 L target`, dash.includes("Target, 2.5 L") && dash.includes("This week so far"), dash);
    const ticks = await page.eval(`const s=[...document.querySelectorAll("section")].find(x=>x.getAttribute("aria-label")==="Water"); return [...s.querySelectorAll("svg text")].map(t=>t.textContent).filter(x=>x.endsWith(" L"))`);
    ok(`${vp}: water axis is labelled in litres`, ticks.length >= 2, JSON.stringify(ticks));
    await clickText(page, "Show the numbers as a table");
    await sleep(300);
    const table = await page.eval(`return document.querySelector("table")?.innerText ?? ""`);
    ok(`${vp}: table has a Water (L) column with this week so far`, table.includes("Water (L)") && /\d so far/.test(table), table.slice(0, 300));
    await page.shot(`water-${vp}-05-dashboard`, true);
    await overflow(page, `${vp} dashboard`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Water card, target and chart", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
