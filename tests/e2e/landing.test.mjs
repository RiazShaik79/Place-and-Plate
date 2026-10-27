// Where people land: sign in → dashboard, create account → food, reset → dashboard (+ toast),
// ?next= respected, signed-in visit to /login → dashboard, Dashboard is the first tab.
import { db } from "../helpers/db.mjs";
import { createHash, randomBytes } from "node:crypto";
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const path = (page) => page.eval("return location.pathname");
async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)} && e.offsetParent!==null); if(!el) throw new Error("no ${tag} ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
}

async function run(page) {
  await page.viewport(1440, 900, false);
  const email = `land.${Date.now()}@example.com`;

  // Create account → food page with the welcome toast
  await page.clearCookies();
  await page.goto(`${B}/register`);
  await page.type("#name", "Lee Land");
  await page.type("#email", email);
  await page.type("#password", "a good password");
  await clickContains(page, "Create account");
  await page.waitForUrl(B + "/");
  ok("create account → Food", (await path(page)) === "/");

  // Sign out, sign in → dashboard
  await page.clearCookies();
  await page.goto(`${B}/login`);
  await page.type("#email", email);
  await page.type("#password", "a good password");
  await clickContains(page, "Sign in");
  await page.waitForUrl("/dashboard");
  ok("sign in → Dashboard", (await path(page)) === "/dashboard");
  await page.waitFor("main section[aria-label]");
  const tabs = await page.eval(`return [...document.querySelectorAll("nav[aria-label=Sections] a")].map(a=>a.textContent.trim()).slice(0,3)`);
  ok("Dashboard is the first tab", JSON.stringify(tabs) === JSON.stringify(["Dashboard", "Food", "Activity"]), JSON.stringify(tabs));
  const current = await page.eval(`return document.querySelector("nav[aria-label=Sections] a[aria-current=page]")?.textContent.trim()`);
  ok("Dashboard tab is marked current", current === "Dashboard", current);
  const logo = await page.eval(`return document.querySelector("header a").getAttribute("href")`);
  ok("logo links to the dashboard", logo === "/dashboard", logo);
  await page.shot("land-dashboard-after-login");

  // Already signed in → /login bounces to the dashboard
  await page.goto(`${B}/login`);
  ok("signed-in visit to /login → Dashboard", (await path(page)) === "/dashboard");

  // ?next= still wins (e.g. after an expired session on the exercise page)
  await page.clearCookies();
  await page.goto(`${B}/login?next=%2Fexercise`);
  await page.type("#email", email);
  await page.type("#password", "a good password");
  await clickContains(page, "Sign in");
  await page.waitForUrl("/exercise");
  ok("sign in with ?next=/exercise → Exercise", (await path(page)) === "/exercise");

  // Password reset → dashboard with the "Password updated" toast
  await page.clearCookies();
  const userId = (await db.prepare("SELECT id FROM users WHERE email = ?").get(email)).id;
  const token = randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO password_resets (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(createHash("sha256").update(token).digest("hex"), userId, new Date().toISOString(), new Date(Date.now() + 1800e3).toISOString());
  await page.goto(`${B}/reset-password?token=${token}`);
  await page.type("#new-password", "another good password");
  await clickContains(page, "Save password and sign in");
  await page.waitForUrl("/dashboard");
  await page.waitFor("[aria-live] [role=status]");
  const toast = await page.eval(`return document.querySelector("[aria-live] [role=status]")?.textContent ?? ""`);
  ok("reset → Dashboard with 'Password updated'", (await path(page)) === "/dashboard" && toast.includes("Password updated"), toast);
  await page.shot("land-dashboard-after-reset");

  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Where people land after sign-in, sign-up and reset", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
