// Rename + Keep me signed in + exercise panel without Photo.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "n1";

async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.includes(${JSON.stringify(text)}) && e.offsetParent!==null); if(!el) throw new Error("no ${tag} containing ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
  await page.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
}
const session = async (page) => (await page.allCookies()).find((c) => c.name === "ct_session");

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    const email = `pat.${vp}.${Date.now()}@example.com`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Pat Rivera",email:${JSON.stringify(email)},password:"a good password"})})`);
    await page.clearCookies();

    // Sign-in page: name, default ticked
    await page.goto(`${B}/login`);
    const title = await page.eval(`return document.title`);
    ok(`${vp} title uses the new name`, title === "Sign in to Plate & Pace", title);
    const checked = await page.eval(`return document.querySelector("input[type=checkbox]").checked`);
    ok(`${vp} Keep me signed in ticked by default`, checked === true);
    await page.type("#email", email);
    await page.type("#password", "a good password");
    await page.shot(`${p}-01-login-ticked`);
    await overflow(page, `${vp} login`);

    // Keyboard: Tab from password lands on the checkbox (after the show-password button), Space toggles
    await page.eval(`document.querySelector("input[type=checkbox]").focus()`);
    await page.key(" ", "Space", 32);
    const afterSpace = await page.eval(`return document.querySelector("input[type=checkbox]").checked`);
    ok(`${vp} Space toggles the checkbox`, afterSpace === false);
    const hint = await page.eval(`return document.querySelector("#remember-hint").textContent`);
    ok(`${vp} hint explains the unticked choice`, hint.includes("close the browser"), hint);
    await page.shot(`${p}-02-login-unticked-focus`);

    // Unticked → browser-session cookie
    await clickContains(page, "Sign in");
    await page.waitForUrl("/dashboard");
    let c = await session(page);
    ok(`${vp} unticked → session cookie`, c && c.session === true, JSON.stringify(c && { session: c.session, expires: c.expires }));
    await page.waitFor("main section[aria-label]");
    await page.shot(`${p}-03-dashboard-header`);

    // Ticked → persistent cookie (~30 days)
    await page.clearCookies();
    await page.goto(`${B}/login`);
    await page.type("#email", email);
    await page.type("#password", "a good password");
    await clickContains(page, "Sign in");
    await page.waitForUrl("/dashboard");
    c = await session(page);
    const days = c ? (c.expires * 1000 - Date.now()) / 86400e3 : 0;
    ok(`${vp} ticked → persistent cookie ~30 days`, c && c.session === false && days > 29.9 && days <= 30, JSON.stringify(c && { session: c.session, days }));
    ok(`${vp} cookie is httpOnly + SameSite=Lax`, c?.httpOnly === true && c?.sameSite === "Lax", JSON.stringify(c));

    // Exercise panel: two tabs, no Photo
    await page.goto(`${B}/exercise`);
    await page.waitFor("#exercise-log-heading");
    const tabs = await page.eval(`return [...document.querySelectorAll("[aria-label='How to add exercise'] [role=tab]")].map(t=>t.textContent.trim())`);
    ok(`${vp} exercise tabs are Search + Describe only`, JSON.stringify(tabs) === JSON.stringify(["Search", "Describe"]), JSON.stringify(tabs));
    await page.eval(`document.querySelector("#add-exercise-heading").scrollIntoView({block:"start"}); window.scrollBy(0,-130)`);
    await page.shot(`${p}-04-exercise-panel`);
    await clickContains(page, "Describe", "[role=tab]");
    await page.shot(`${p}-05-exercise-describe`);

    // Food panel still has its Photo tab
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    const foodTabs = await page.eval(`return [...document.querySelectorAll("[aria-label='How to add food'] [role=tab]")].map(t=>t.textContent.trim())`);
    ok(`${vp} food tabs keep Photo (Recent, Search, Describe, Photo)`, JSON.stringify(foodTabs) === JSON.stringify(["Recent", "Search", "Describe", "Photo"]), JSON.stringify(foodTabs));
    await page.eval(`document.querySelector("#add-food-heading").scrollIntoView({block:"start"}); window.scrollBy(0,-130)`);
    await page.shot(`${p}-06-food-panel`);

    await page.goto(`${B}/account`);
    await page.shot(`${p}-07-account`);
    await page.clearCookies();
    await page.goto(`${B}/register`);
    await page.shot(`${p}-08-register`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

async function overflow(page, label) {
  const o = await page.overflow();
  ok(`${label}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
}

suite("Keep me signed in, exercise panel without Photo", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
