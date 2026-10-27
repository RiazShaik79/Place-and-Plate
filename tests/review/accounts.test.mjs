// Screenshots of every account state at desktop and mobile.
import { suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "r1";

async function overflow(page, label) {
  const o = await page.overflow();
  console.log(`overflow ${label}: scrollWidth=${o.scrollWidth} innerWidth=${o.innerWidth}${o.scrollWidth > o.innerWidth ? "  <-- OVERFLOW" : ""}`);
}

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);

    // Sign in: empty, inline errors, wrong password
    await page.goto(`${B}/login`);
    await page.shot(`${p}-01-login`);
    await overflow(page, `${vp} login`);
    await page.clickText("Sign in", "button");
    await page.shot(`${p}-02-login-empty-errors`);
    await page.type("#email", "nobody@example.com");
    await page.type("#password", "wrong-password");
    await page.clickText("Sign in", "button");
    await page.waitFor("[role=alert]");
    await page.shot(`${p}-03-login-wrong-password`);

    // Create account: validation errors, then success
    await page.goto(`${B}/register`);
    await page.shot(`${p}-04-register`);
    await page.type("#email", "not-an-email");
    await page.type("#password", "short");
    await page.clickText("Create account", "button");
    await page.shot(`${p}-05-register-errors`);
    const email = `jordan.${vp}.${Date.now()}@example.com`;
    await page.type("#name", "Jordan Rivera");
    await page.type("#email", email);
    await page.type("#password", "a good password");
    await page.clickText("Create account", "button");
    await page.waitForUrl(`${B}/`);
    await page.waitFor("#food-log-heading");
    // Log two catalogue foods so the tracker isn't empty (no AI calls).
    await page.eval(`
      const today = new Date(); const d = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
      for (const [foodId, meal] of [["oatmeal","breakfast"],["chicken-breast","lunch"]]) {
        await fetch("/api/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({foodId,servings:1,date:d,meal})});
      }`);
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    await page.shot(`${p}-06-tracker`);
    await overflow(page, `${vp} tracker`);
    await page.click("[aria-haspopup=menu]");
    await page.shot(`${p}-07-account-menu`);
    await page.key("Escape", "Escape", 27);

    // Account page: default, saved, errors
    await page.goto(`${B}/account`);
    await page.shot(`${p}-08-account`, true);
    await overflow(page, `${vp} account`);
    await page.type("#profile-name", "Jordan R. Rivera");
    await page.type("#body-goal", "1900");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await page.waitFor("[role=status]");
    await page.shot(`${p}-09-account-saved`);
    await page.type("#profile-email", "bad");
    await page.type("#body-goal", "50");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await page.shot(`${p}-10-account-profile-errors`);
    await page.type("#current-password", "not my password");
    await page.type("#new-password", "another good one");
    await page.clickText("Change password", "button");
    await page.waitFor("#current-password-error");
    await page.eval(`document.querySelector("#current-password").scrollIntoView({block:"center"})`);
    await page.shot(`${p}-11-account-password-error`);

    // Sign out from the menu → signed-out notice on the sign-in page
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    await page.click("[aria-haspopup=menu]");
    await page.clickText("Sign out", "button");
    await page.waitForUrl("/login");
    await page.shot(`${p}-12-signed-out`);
  }
  // Expired session notice
  await page.viewport(1440, 900, false);
  await page.goto(`${B}/login?expired=1&next=%2F`);
  await page.shot(`${round}-desk-13-expired`);
}

suite("Account pages screenshots", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
