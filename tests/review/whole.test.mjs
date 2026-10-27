// Whole-app review screenshots.
import { suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const round = process.env.ROUND ?? "w1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function overflow(page, label) {
  const o = await page.overflow();
  if (o.scrollWidth > o.innerWidth) console.log(`OVERFLOW ${label}: ${o.scrollWidth}/${o.innerWidth}`);
}
const SEED = `
  let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const post = (u, b, m="POST") => fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  await post("/api/account/body", { calorieGoal: 2000, stepsTarget: 8000, heightCm: 170, weightKg: 68 }, "PUT");
  const foods = [["oatmeal","breakfast",1.5],["banana","breakfast",1],["chicken-breast","lunch",2],["white-rice","lunch",1.5],["brown-rice","dinner",1.5],["chicken-breast","dinner",1.5],["peanut-butter","snack",1]];
  const jobs = [];
  for (let d = 1; d < 70; d++) {
    if (rnd() < 0.15) continue;
    for (const [id, meal, sv] of foods.slice(0, 5 + (rnd() < 0.3 ? 2 : 0))) jobs.push(post("/api/log", { foodId: id, servings: Math.round(sv * (0.7 + rnd() * 0.8) * 4) / 4, date: iso(d), meal }));
    if (rnd() < 0.55) jobs.push(post("/api/exercise", { exerciseId: ["run-steady","walk-outdoor-brisk","cycle-moderate","yoga","weights-moderate"][Math.floor(rnd()*5)], minutes: [20,30,45,60][Math.floor(rnd()*4)], date: iso(d) }));
    if (rnd() < 0.85) jobs.push(post("/api/steps", { date: iso(d), steps: Math.round(4000 + rnd() * 8000) }, "PUT"));
    if (jobs.length > 40) await Promise.all(jobs.splice(0));
  }
  // Today: breakfast + lunch, one walk, steps
  for (const [id, meal, sv] of [["oatmeal","breakfast",1],["banana","breakfast",1],["chicken-breast","lunch",1.5],["white-rice","lunch",1]]) jobs.push(post("/api/log", { foodId: id, servings: sv, date: iso(0), meal }));
  jobs.push(post("/api/exercise", { exerciseId: "walk-outdoor-brisk", minutes: 30, date: iso(0) }));
  jobs.push(post("/api/steps", { date: iso(0), steps: 6420 }, "PUT"));
  await Promise.all(jobs);`;

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    const p = `${round}-${vp}`;
    await page.clearCookies();
    await page.viewport(w, h, mobile);

    // Auth pages
    await page.goto(`${B}/login`);
    await page.shot(`${p}-01-login`);
    await overflow(page, `${vp} login`);
    await page.goto(`${B}/register`);
    await page.shot(`${p}-02-register`);

    // Brand-new account: empty states
    await page.goto(`${B}/login`);
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Nina Empty",email:"nina.${vp}.${Date.now()}@example.com",password:"a good password"})})`);
    for (const [path, name] of [["/dashboard", "03-empty-dashboard"], ["/", "04-empty-food"], ["/exercise", "05-empty-exercise"]]) {
      await page.goto(B + path);
      await sleep(900);
      await page.shot(`${p}-${name}`, true);
      await overflow(page, `${vp} ${name}`);
    }

    // Seeded, confirmed account
    await page.clearCookies();
    await page.goto(`${B}/login`);
    const email = `sam.whole.${vp}.${Date.now()}@example.com`;
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Sam Rivera",email:${JSON.stringify(email)},password:"a good password"})})`);
    await page.eval(SEED);
    // Mark confirmed so the review isn't dominated by the banner (that state is covered above).
    await page.eval(`window.__email=${JSON.stringify(email)}`);
    if (process.env.CONFIRM_SQL) await process.env.CONFIRM_SQL;
    for (const [path, name] of [["/dashboard", "06-dashboard"], ["/", "07-food"], ["/exercise", "08-exercise"], ["/account", "09-account"]]) {
      await page.goto(B + path);
      await sleep(1100);
      await page.shot(`${p}-${name}`, true);
      await overflow(page, `${vp} ${name}`);
    }
    await page.goto(`${B}/dashboard`);
    await sleep(900);
    await page.click("[aria-haspopup=menu]");
    await page.shot(`${p}-10-menu`);
    await page.key("Escape", "Escape", 27);

    // Error state: the day's log fails to load
    await page.goto(`${B}/`);
    await page.eval(`
      const orig = window.fetch;
      window.fetch = (u, i) => String(u).includes("/api/log?date") ? Promise.reject(new TypeError("offline")) : orig(u, i);`);
    await page.click("button[aria-label='Previous day']");
    await sleep(900);
    await page.shot(`${p}-11-food-load-error`);
  }
  console.log(page.consoleErrors.length ? `console errors: ${page.consoleErrors.join(" | ")}` : "no console errors");
}

suite("Whole-app screenshots", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
