// Sleep end to end: the Activity tab, logging last night (across midnight, with quality), editing,
// clearing, the dashboard's daily card and weekly chart, and the account's sleep target.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";

const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// React listens for the native value setter + an input event.
const setValue = (page, sel, value) =>
  page.eval(`const el=document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input",{bubbles:true}));`);
const bodyText = (page) => page.eval(`return document.body.innerText`);
const card = (page, name) => page.eval(`return document.querySelector("section[aria-label='${name}']")?.innerText ?? ""`);

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`
      await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Sol Sleeper",email:"sol.${vp}.${Date.now()}@example.com",password:"a good password"})});
      const iso=(n)=>{const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
      for (let n=1;n<=10;n++) await fetch("/api/sleep",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:iso(n),bed:"23:00",wake:n%2?"06:30":"07:00",quality:3})});
      localStorage.removeItem("ct:dashboard-period");`);

    // Activity page
    await page.goto(`${B}/exercise`);
    await sleep(1200);
    const tabs = await page.eval(`return [...document.querySelectorAll("nav[aria-label=Sections] a")].map(a=>a.textContent.trim())`);
    ok(`${vp}: the third tab is Activity`, tabs.includes("Activity") && !tabs.includes("Exercise"), JSON.stringify(tabs));
    ok(`${vp}: Sleep card says last night isn't logged`, (await bodyText(page)).includes("not logged for this night"));
    await page.clickText("Add sleep");
    await setValue(page, "#sleep-bed", "23:15");
    await setValue(page, "#sleep-wake", "06:35");
    await sleep(150);
    ok(`${vp}: live preview = 7 h 20 min`, (await bodyText(page)).includes("= 7 h 20 min"));
    await page.click("[role=radio][aria-label='4, Rested']");
    ok(`${vp}: quality picker says Rested`, (await page.eval(`return document.querySelector("[role=radio][aria-checked=true]")?.getAttribute("aria-label")`)) === "4, Rested");
    await page.shot(`sleep-${vp}-01-edit`);
    await page.clickText("Save sleep");
    await sleep(900);
    ok(`${vp}: toast confirms`, (await page.eval(`return document.querySelector("[aria-live] [role=status]")?.innerText ?? ""`)).includes("Sleep saved"));
    let t = await bodyText(page);
    ok(`${vp}: card shows 7 h 20 min, 23:15 to 06:35, rested (4 of 5)`, t.includes("7 h 20 min") && t.includes("23:15 to 06:35") && t.includes("rested (4 of 5)"), t.match(/Sleep[^\n]*/)?.[0]);

    // An impossible night is caught before saving
    await page.clickText("Edit");
    await setValue(page, "#sleep-bed", "06:00");
    await setValue(page, "#sleep-wake", "00:00");
    await page.clickText("Save sleep");
    await sleep(200);
    ok(`${vp}: 18 hours shows an inline error`, (await bodyText(page)).includes("That's 18 hours. Check the times."));
    await page.clickText("Cancel");

    await page.goto(`${B}/exercise`);
    await sleep(1200);
    ok(`${vp}: a reload keeps the night`, (await bodyText(page)).includes("23:15 to 06:35"));
    await page.shot(`sleep-${vp}-02-activity`);

    // Dashboard, daily: last night's card
    await page.goto(`${B}/dashboard`);
    await sleep(1300);
    t = await card(page, "Sleep");
    ok(`${vp}: daily Sleep card: 7h 20m of 8 h, Rested, the times`, t.includes("7h 20m") && t.includes("of 8 h") && t.includes("Rested") && t.includes("23:15 to 06:35"), t);
    const bar = await page.eval(`return document.querySelector("section[aria-label=Sleep] [role=progressbar]")?.getAttribute("aria-valuenow")`);
    ok(`${vp}: its bar is at 92% (440 of 480)`, bar === "92", String(bar));
    await page.eval(`document.querySelector("section[aria-label=Sleep]").scrollIntoView({block:"center"})`);
    await page.shot(`sleep-${vp}-03-daily`);

    // Dashboard, weekly: the chart card in the carousel
    await page.eval(`localStorage.setItem("ct:dashboard-period","week")`);
    await page.goto(`${B}/dashboard`);
    await sleep(1300);
    await page.click("[aria-label='Show Sleep']");
    await sleep(800);
    t = await card(page, "Sleep");
    ok(`${vp}: weekly Sleep chart with the 8 h target line`, t.includes("Target, 8 h a night") && t.includes("Last 12 weeks"), t.slice(0, 200));
    const ticks = await page.eval(`return [...document.querySelectorAll("section[aria-label=Sleep] svg text")].map(x=>x.textContent).filter(x=>x.endsWith(" h"))`);
    ok(`${vp}: the axis is in hours`, ticks.length >= 2, JSON.stringify(ticks));
    await page.shot(`sleep-${vp}-04-weekly`);
    await page.clickText("Show the numbers as a table");
    await sleep(300);
    const table = await page.eval(`return document.querySelector("table")?.innerText ?? ""`);
    ok(`${vp}: the table has a Sleep (h) column`, table.includes("Sleep (h)") && /\b(6\.\d|7(\.\d)?)\b/.test(table), table.slice(0, 200));

    // Account: the sleep target
    await page.goto(`${B}/account`);
    await sleep(900);
    await page.type("#body-sleep", "13");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await sleep(300);
    ok(`${vp}: a 13 h target is rejected`, (await page.eval(`return document.querySelector("#body-sleep-error")?.innerText ?? ""`)).includes("4 to 12 hours"));
    await page.type("#body-sleep", "7.5");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await sleep(900);
    ok(`${vp}: 7.5 h saves as 450 minutes`, (await page.eval(`return (await (await fetch("/api/account")).json()).user.sleepTargetMin`)) === 450);

    // Clear the night
    await page.goto(`${B}/exercise`);
    await sleep(1200);
    await page.clickText("Edit");
    await page.clickText("Clear");
    await sleep(800);
    ok(`${vp}: Clear removes the night`, (await bodyText(page)).includes("not logged for this night"));
    const o = await page.overflow();
    ok(`${vp}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Sleep: log on Activity, see it on the dashboard", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
