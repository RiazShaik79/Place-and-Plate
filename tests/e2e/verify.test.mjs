// Email verification UI at 1440 and 390: banner, Profile states, resend, result pages.
import fs from "node:fs";
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const LOG = process.env.LOG;
const round = process.env.ROUND ?? "v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)} && e.offsetParent!==null); if(!el) throw new Error("no ${tag} ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
  await page.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
}
async function linkFor(to) {
  for (let i = 0; i < 20; i++) {
    const blocks = fs.readFileSync(LOG, "utf8").split("EMAIL to ").filter((b) => b.startsWith(to + "\n") || b.startsWith(to + "\r\n"));
    const m = blocks.at(-1)?.match(/(https?:\/\/\S+\/api\/auth\/verify-email\?token=[A-Za-z0-9_%-]+)/);
    if (m) return m[1];
    await sleep(150);
  }
  return null;
}
async function overflow(page, label) {
  const o = await page.overflow();
  ok(`${label}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
}

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    const email = `ivy.${vp}.${Date.now()}@example.com`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);

    // Sign up → food page with the banner
    await page.goto(`${B}/register`);
    await page.type("#name", "Ivy Moreno");
    await page.type("#email", email);
    await page.type("#password", "a good password");
    await clickContains(page, "Create account");
    await page.waitForUrl(B + "/");
    await page.waitFor("#food-log-heading");
    const banner = await page.eval(`return document.body.innerText.includes("Confirm your email address")`);
    ok(`${vp} banner shows after sign-up`, banner);
    await page.shot(`${p}-01-banner`);
    await overflow(page, `${vp} banner`);

    // Resend from the banner
    await clickContains(page, "Resend link");
    await page.waitFor("[role=status]");
    const sent = await page.eval(`return [...document.querySelectorAll("[role=status]")].map(e=>e.textContent).join(" | ")`);
    ok(`${vp} resend confirms it was sent`, sent.includes("New link sent."), sent);
    await page.shot(`${p}-02-banner-resent`);

    // Account page: not confirmed, then an email change waiting
    await page.goto(`${B}/account`);
    await page.eval(`document.querySelector("#profile-email").scrollIntoView({block:"center"})`);
    await page.shot(`${p}-03-profile-unconfirmed`);
    const newEmail = `ivy.new.${vp}.${Date.now()}@example.com`;
    await page.type("#profile-email", newEmail);
    await page.click("section[aria-labelledby='section-profile'] button[type=submit]");
    await sleep(900);
    const pendingTxt = await page.eval(`return document.querySelector("section[aria-labelledby='section-profile']").innerText`);
    ok(`${vp} pending change explained`, pendingTxt.includes(`Waiting for you to confirm ${newEmail}`) && pendingTxt.includes(`signing in with ${email}`), pendingTxt.slice(0, 300));
    ok(`${vp} email field still shows the sign-in email`, (await page.eval(`return document.querySelector("#profile-email").value`)) === email);
    await page.eval(`document.querySelector("#profile-email").scrollIntoView({block:"center"})`);
    await page.shot(`${p}-04-profile-pending`);

    // Confirm the change by opening the link in the same browser
    const link = await linkFor(newEmail);
    await page.goto(link);
    await page.waitForUrl("/verify-email");
    const h1 = await page.eval(`return document.querySelector("h1").textContent`);
    ok(`${vp} change link → "Email address updated"`, h1 === "Email address updated", h1);
    await page.shot(`${p}-05-changed`);
    await page.goto(`${B}/account`);
    const afterTxt = await page.eval(`return document.querySelector("section[aria-labelledby='section-profile']").innerText`);
    ok(`${vp} account shows the new email, confirmed`, (await page.eval(`return document.querySelector("#profile-email").value`)) === newEmail && afterTxt.includes("Confirmed"), afterTxt.slice(0, 200));
    ok(`${vp} banner gone once confirmed`, !(await page.eval(`return document.body.innerText.includes("Confirm your email address")`)));

    // Result pages signed out
    await page.clearCookies();
    for (const s of ["verified", "expired", "taken"]) {
      await page.goto(`${B}/verify-email?status=${s}`);
      await page.shot(`${p}-06-result-${s}`);
    }
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Email verification pages and banner", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
