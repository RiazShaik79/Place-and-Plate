// Round 2 checks: welcome toast, keyboard menu, goal sync.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";

async function run(page) {
  for (const [vp, w, h, mobile] of [["mob", 390, 844, true], ["desk", 1440, 900, false]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/register`);
    await page.shot(`r2-${vp}-01-register`);
    await page.type("#name", "Priya Natarajan");
    await page.type("#email", `priya.${vp}.${Date.now()}@example.com`);
    await page.type("#password", "a good password");
    await page.clickText("Create account", "button");
    await page.waitForUrl(`${B}/`);
    await page.waitFor("[role=status]");
    const toast = await page.eval(`return document.querySelector("[aria-live] [role=status]")?.textContent ?? ""`);
    ok(`${vp} welcome toast`, toast.includes("Welcome, Priya"), toast);
    await page.shot(`r2-${vp}-02-welcome`);
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    const again = await page.eval(`return document.querySelector("[aria-live] [role=status]")?.textContent ?? ""`);
    ok(`${vp} welcome shown only once`, !again.includes("Welcome"), again);

    // Keyboard: focus button, Enter opens + focuses first item, ArrowDown moves, Escape closes + returns focus.
    await page.eval(`document.querySelector("[aria-haspopup=menu]").focus()`);
    await page.key("Enter", "Enter", 13);
    await new Promise((r) => setTimeout(r, 300));
    let active = await page.eval(`return document.activeElement?.textContent?.trim()`);
    ok(`${vp} Enter opens menu, focus on first item`, active === "Account settings", active);
    await page.key("ArrowDown", "ArrowDown", 40);
    active = await page.eval(`return document.activeElement?.textContent?.trim()`);
    ok(`${vp} ArrowDown → Sign out`, active === "Sign out", active);
    await page.shot(`r2-${vp}-03-menu-keyboard`);
    await page.key("ArrowDown", "ArrowDown", 40);
    active = await page.eval(`return document.activeElement?.textContent?.trim()`);
    ok(`${vp} ArrowDown wraps`, active === "Account settings", active);
    await page.key("Escape", "Escape", 27);
    const state = await page.eval(`const b=document.querySelector("[aria-haspopup=menu]"); return {expanded:b.getAttribute("aria-expanded"), focused: document.activeElement===b}`);
    ok(`${vp} Escape closes, focus back on button`, state.expanded === "false" && state.focused, JSON.stringify(state));

    // Goal sync: change on account page → tracker uses it; change on tracker → account shows it.
    await page.goto(`${B}/account`);
    await page.type("#body-goal", "1750");
    await page.click("section[aria-labelledby='section-body-and-goals'] button[type=submit]");
    await page.waitFor("[role=status]");
    await page.goto(`${B}/`);
    await page.waitFor("#food-log-heading");
    const summary = await page.eval(`return document.querySelector("[aria-label='Daily summary']").textContent`);
    ok(`${vp} tracker shows 1,750 goal`, summary.includes("1,750"), summary.slice(0, 120));
    await page.clickText("Edit goal", "button");
    await page.type("#goal-input", "2100");
    await page.clickText("Save goal", "button");
    await new Promise((r) => setTimeout(r, 600));
    await page.goto(`${B}/account`);
    const g = await page.eval(`return document.querySelector("#body-goal").value`);
    ok(`${vp} account shows tracker-edited goal 2100`, g === "2100", g);
  }
}

suite("Account settings", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
