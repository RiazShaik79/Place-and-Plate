// Sign out and come back on the same browser: "Welcome back" + email filled + focus on password;
// "Not you?" clears it; an unticked sign-in isn't remembered.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "d1";
async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.includes(${JSON.stringify(text)}) && e.offsetParent!==null); if(!el) throw new Error("no ${tag} containing ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
  await page.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
}
const signIn = async (page, email, ticked) => {
  await page.type("#email", email);
  await page.type("#password", "a good password");
  const box = await page.eval(`return document.querySelector("input[type=checkbox]").checked`);
  if (box !== ticked) await page.click("input[type=checkbox] + span");
  await clickContains(page, "Sign in");
  await page.waitForUrl("/dashboard");
  await page.waitFor("main section[aria-label]");
};
const signOutViaMenu = async (page) => {
  await page.click("[aria-haspopup=menu]");
  await clickContains(page, "Sign out");
  await page.waitForUrl("/login");
};

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    const email = `riley.${vp}.${Date.now()}@example.com`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Riley Chen",email:${JSON.stringify(email)},password:"a good password"})})`);
    await page.clearCookies(); // a fresh browser: nobody remembered yet

    await page.goto(`${B}/login`);
    ok(`${vp} fresh browser: plain Sign in`, (await page.eval(`return document.querySelector("h1").textContent`)) === "Sign in");
    await signIn(page, email, true);
    await signOutViaMenu(page);

    const h1 = await page.eval(`return document.querySelector("h1").textContent`);
    const filled = await page.eval(`return document.querySelector("#email").value`);
    const focused = await page.eval(`return document.activeElement?.id`);
    const notice = await page.eval(`return document.querySelector("[role=status]")?.textContent ?? ""`);
    ok(`${vp} after sign-out: "Welcome back, Riley"`, h1 === "Welcome back, Riley", h1);
    ok(`${vp} email filled in`, filled === email, filled);
    ok(`${vp} cursor in the password field`, focused === "password", focused);
    ok(`${vp} signed-out notice explains how to stay signed in`, notice.includes("close the tab"), notice);
    await page.shot(`${p}-01-welcome-back`);
    await overflow(page, `${vp} welcome back`);

    // Only the password needed now
    await page.type("#password", "a good password");
    await clickContains(page, "Sign in");
    await page.waitForUrl("/dashboard");
    ok(`${vp} signed back in with just the password`, true);

    // "Not you?" forgets this browser
    await signOutViaMenu(page);
    await clickContains(page, "Not Riley?");
    await new Promise((r) => setTimeout(r, 400));
    ok(`${vp} "Not you?" → blank Sign in form`, (await page.eval(`return document.querySelector("h1").textContent`)) === "Sign in" && (await page.eval(`return document.querySelector("#email").value`)) === "");
    ok(`${vp} "Not you?" focuses email`, (await page.eval(`return document.activeElement?.id`)) === "email");
    await page.shot(`${p}-02-not-you`);
    await page.goto(`${B}/login`);
    ok(`${vp} "Not you?" is remembered after reload`, (await page.eval(`return document.querySelector("h1").textContent`)) === "Sign in");

    // Unticked (shared computer): not greeted next time
    await signIn(page, email, false);
    await signOutViaMenu(page);
    ok(`${vp} unticked sign-in isn't remembered`, (await page.eval(`return document.querySelector("h1").textContent`)) === "Sign in");
    const device = (await page.allCookies()).find((c) => c.name === "ct_device_user");
    ok(`${vp} no device cookie after unticked sign-in`, !device, JSON.stringify(device));
    await page.shot(`${p}-03-unticked-signed-out`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

async function overflow(page, label) {
  const o = await page.overflow();
  ok(`${label}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
}

suite("Welcome back on a remembered device", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
