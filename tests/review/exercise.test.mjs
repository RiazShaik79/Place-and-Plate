// Screenshots for the exercise page + password reset. AI is mocked in the page; Gemini is never called.
//
import { db } from "../helpers/db.mjs";
import { createHash, randomBytes } from "node:crypto";
import { suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";

const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "e1";
const sha = (t) => createHash("sha256").update(t).digest("hex");

const MOCK_TEXT = {
  items: [
    { name: "Treadmill walk, 6% incline", category: "cardio", intensity: "moderate", minutes: 45, met: 5.3, calories: 278 },
    { name: "Stretching", category: "flexibility", intensity: "light", minutes: 10, met: 2.3, calories: 27 },
  ],
  totals: { minutes: 55, calories: 305 },
  notes: "Assumed a steady 5 km/h pace on the incline and a light cool-down stretch.",
  weightKg: 70,
  weightIsDefault: true,
};
const MOCK_PHOTO = {
  items: [{ name: "Outdoor run", category: "cardio", intensity: "vigorous", minutes: 32, met: 9.8, calories: 366 }],
  totals: { minutes: 32, calories: 366 },
  notes: "Read from the watch summary: 32 minutes, 5.1 km, average pace 6:16 per km.",
  weightKg: 70,
  weightIsDefault: true,
};

async function overflow(page, label) {
  const o = await page.overflow();
  console.log(`overflow ${label}: ${o.scrollWidth}/${o.innerWidth}${o.scrollWidth > o.innerWidth ? "  <-- OVERFLOW" : ""}`);
}
async function clickContains(page, text, tag = "button") {
  await page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.includes(${JSON.stringify(text)}) && e.offsetParent!==null); if(!el) throw new Error("no ${tag} containing ${text}"); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
  await page.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
}
const mockAi = (page) =>
  page.eval(`
    const orig = window.fetch;
    window.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/api/ai/exercise/text")) { await new Promise(r=>setTimeout(r,400)); return new Response(JSON.stringify(${JSON.stringify(MOCK_TEXT)}), {status:200, headers:{"Content-Type":"application/json"}}); }
      if (u.includes("/api/ai/exercise/image")) { await new Promise(r=>setTimeout(r,400)); return new Response(JSON.stringify(${JSON.stringify(MOCK_PHOTO)}), {status:200, headers:{"Content-Type":"application/json"}}); }
      if (u.includes("/api/ai/")) throw new Error("unmocked AI call " + u);
      return orig(url, init);
    };`);

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    const email = `sam.${vp}.${Date.now()}@example.com`;
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Sam Okafor",email:${JSON.stringify(email)},password:"a good password"})})`);

    // Exercise: empty
    await page.goto(`${B}/exercise`);
    await page.waitFor("#exercise-log-heading");
    await new Promise((r) => setTimeout(r, 500));
    await page.shot(`${p}-01-exercise-empty`);
    await overflow(page, `${vp} exercise empty`);

    // Search row expanded, then log it
    await clickContains(page, "Walking outdoors, brisk");
    await page.shot(`${p}-02-search-expanded`);
    await clickContains(page, "45 min");
    await clickContains(page, "Log session");
    await new Promise((r) => setTimeout(r, 400));
    await page.shot(`${p}-03-logged-toast`);

    // A few more days/sessions for the week strip
    await page.eval(`
      const d = (o) => { const t = new Date(); t.setDate(t.getDate()-o); return t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0"); };
      for (const [id, min, off] of [["yoga",30,0],["run-steady",35,1],["cycle-moderate",60,3],["weights-moderate",40,4],["walk-outdoor-easy",25,6]])
        await fetch("/api/exercise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({exerciseId:id,minutes:min,date:d(off)})});`);
    await page.goto(`${B}/exercise`);
    await page.waitFor("#exercise-log-heading");
    await new Promise((r) => setTimeout(r, 600));
    await page.shot(`${p}-04-with-sessions`);
    await page.shot(`${p}-04b-with-sessions-full`, true);
    await overflow(page, `${vp} exercise sessions`);

    // Describe → mocked review
    await mockAi(page);
    await clickContains(page, "Describe", "[role=tab]");
    await page.type("#exercise-ai-text", "45 minutes on the treadmill at 6% incline then a short stretch");
    await clickContains(page, "Estimate");
    await page.waitFor("input[type=checkbox]");
    await page.eval(`document.querySelector("#ex-panel-text").scrollIntoView({block:"start"})`);
    await page.shot(`${p}-05-describe-review`);

    // The exercise Photo tab was removed on purpose (2026-10-16): it must not come back.
    const hasPhoto = await page.eval(`return !!document.querySelector("#ex-tab-photo")`);
    console.log(`${vp} exercise photo tab present: ${hasPhoto}`);

    // Remove with undo
    await page.eval(`window.scrollTo(0,0)`);
    await page.click("button[aria-label^='Remove ']");
    await page.shot(`${p}-07-removed-undo`);
    await clickContains(page, "Undo");
    const back = await page.eval(`return document.querySelectorAll("button[aria-label^='Remove ']").length`);
    console.log(`${vp} undo restored: ${back} sessions listed`);

    // Food page with burned-calories link
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    await new Promise((r) => setTimeout(r, 600));
    await page.shot(`${p}-08-food-burned`);
    await overflow(page, `${vp} food`);

    // Account with weight
    await page.goto(`${B}/account`);
    await page.shot(`${p}-09-account`, true);
    await page.type("#body-weight", "12");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await page.eval(`document.querySelector("#body-weight").scrollIntoView({block:"center"})`);
    await page.shot(`${p}-10-account-weight-error`);
    const me = await page.eval(`return (await (await fetch("/api/account")).json()).user`);

    // Signed out: sign in → forgot → sent
    await page.clearCookies();
    await page.goto(`${B}/login`);
    await page.type("#email", email);
    await page.shot(`${p}-11-login-forgot-link`);
    await clickContains(page, "Forgot password?", "a");
    await page.waitForUrl("/forgot-password");
    await page.shot(`${p}-12-forgot`);
    await overflow(page, `${vp} forgot`);
    await clickContains(page, "Send reset link");
    await page.waitFor("h1");
    await new Promise((r) => setTimeout(r, 500));
    await page.shot(`${p}-13-forgot-sent`);

    // Reset: valid and expired links (tokens made here; the real one is printed in the server console)
    const good = randomBytes(32).toString("base64url");
    const old = randomBytes(32).toString("base64url");
    const now = Date.now();
    await db.prepare("INSERT INTO password_resets (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(sha(good), me.id, new Date(now).toISOString(), new Date(now + 1800e3).toISOString());
    await db.prepare("INSERT INTO password_resets (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(sha(old), me.id, new Date(now - 3600e3).toISOString(), new Date(now - 1800e3).toISOString());
    await page.goto(`${B}/reset-password?token=${good}`);
    await page.shot(`${p}-14-reset-valid`);
    await page.type("#new-password", "short");
    await clickContains(page, "Save password and sign in");
    await page.shot(`${p}-15-reset-error`);
    await page.type("#new-password", "a brand new password");
    await clickContains(page, "Save password and sign in");
    await page.waitForUrl("/dashboard");
    await page.waitFor("[aria-label=Overview]");
    await new Promise((r) => setTimeout(r, 500));
    await page.shot(`${p}-16-reset-done-toast`);
    await page.clearCookies();
    await page.goto(`${B}/reset-password?token=${old}`);
    await page.shot(`${p}-17-reset-expired`);
  }
  if (page.consoleErrors.length) console.log("console errors:", page.consoleErrors.length);
}

suite("Exercise page screenshots with mocked AI", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
