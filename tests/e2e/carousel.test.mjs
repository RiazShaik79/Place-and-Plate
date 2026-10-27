// Dashboard layout for food, steps, water and weight. Weekly / monthly: four equal chart cards in a
// carousel (two in view on desktop, one on a phone). Daily: today's numbers as cards, no carousel.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";

const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAROUSEL = `document.querySelector("[aria-roledescription=carousel]")`;
const state = (page) =>
  page.eval(`const c=${CAROUSEL}; const track=c.firstElementChild; const box=track.getBoundingClientRect();
    const slides=[...track.children];
    return {
      titles: slides.map(s=>s.querySelector("h2")?.textContent),
      labels: slides.map(s=>s.getAttribute("aria-label")),
      inView: slides.filter(s=>{const r=s.getBoundingClientRect(); return r.left>=box.left-4 && r.right<=box.right+4}).map(s=>s.querySelector("h2").textContent),
      heights: slides.map(s=>Math.round(s.firstElementChild.getBoundingClientRect().height)),
      prev: c.querySelector("[aria-label='Previous chart']").disabled,
      next: c.querySelector("[aria-label='Next chart']").disabled,
      dots: [...c.querySelectorAll("[aria-label^='Show ']")].map(d=>d.getAttribute("aria-current")==="true"),
      live: c.querySelector(":scope > [aria-live]").textContent, // the carousel's own, not a card's
    }`);
const setPeriod = async (page, p) => {
  await page.eval(`localStorage.setItem("ct:dashboard-period", ${JSON.stringify(p)})`);
  await page.goto(`${B}/dashboard`);
  await sleep(1200);
};

async function run(page) {
  for (const [vp, w, h, mobile, perView] of [["desk", 1440, 900, false, 2], ["mob", 390, 844, true, 1]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    await page.eval(`
      await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Cara Carousel",email:"cara.${vp}.${Date.now()}@example.com",password:"a good password"})});
      const iso=(n)=>{const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
      const put=(u,b,m="POST")=>fetch(u,{method:m,headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
      await put("/api/account/body",{calorieGoal:2000,stepsTarget:8000},"PUT");
      for (let n=1;n<=10;n++){ await put("/api/log",{foodId:"oatmeal",servings:3+n%3,date:iso(n),meal:"breakfast"}); await put("/api/steps",{date:iso(n),steps:5000+n*400},"PUT"); await put("/api/water",{date:iso(n),add:1500}); await put("/api/weight",{date:iso(n),kg:80+n*0.1},"PUT"); }
      // Today: 1,826 kcal (91%: near the goal), 9,000 steps (target reached), 0.75 L
      await put("/api/log",{foodId:"oatmeal",servings:11,date:iso(0),meal:"breakfast"});
      await put("/api/steps",{date:iso(0),steps:9000},"PUT");
      await put("/api/water",{date:iso(0),add:750});`);

    // --- Weekly: the carousel
    await setPeriod(page, "week");
    await page.eval(`${CAROUSEL}.scrollIntoView({block:"center"})`);
    await sleep(300);
    let s = await state(page);
    ok(`${vp}: five slides in order`, JSON.stringify(s.titles) === JSON.stringify(["Calories eaten", "Steps", "Water", "Weight", "Sleep"]), JSON.stringify(s.titles));
    ok(`${vp}: slides are labelled "n of 5"`, s.labels[4] === "5 of 5: Sleep", s.labels[4]);
    ok(`${vp}: ${perView} in view at the start`, s.inView.length === perView && s.inView[0] === "Calories eaten", JSON.stringify(s.inView));
    // Two in view on desktop: the row lines up. One at a time on phones: each card keeps its own height.
    if (perView === 2) ok(`${vp}: cards are the same height`, new Set(s.heights).size === 1, JSON.stringify(s.heights));
    ok(`${vp}: Previous disabled at the start, Next enabled`, s.prev && !s.next, JSON.stringify([s.prev, s.next]));
    if (perView === 2) {
      const edges = await page.eval(`const r=(t)=>document.querySelector("[aria-label='"+t+"']").getBoundingClientRect(); return [r("Calories burned").left, r("Calories eaten").left, r("Active minutes").right, r("Steps").right].map(Math.round)`);
      ok(`${vp}: carousel cards align with the exercise cards above`, Math.abs(edges[0] - edges[1]) <= 1 && Math.abs(edges[2] - edges[3]) <= 1, JSON.stringify(edges));
    }
    await page.shot(`carousel-${vp}-01-start`);

    await page.click("[aria-label='Next chart']");
    await sleep(700);
    s = await state(page);
    ok(`${vp}: Next moves one card (Steps first in view)`, s.inView[0] === "Steps", JSON.stringify(s.inView));
    ok(`${vp}: the live text says where you are`, perView === 1 ? s.live === "Steps, 2 of 5" : s.live === "Steps and Water, 2 to 3 of 5", s.live);
    ok(`${vp}: dots follow`, perView === 1 ? JSON.stringify(s.dots) === "[false,true,false,false,false]" : JSON.stringify(s.dots) === "[false,true,true,false,false]", JSON.stringify(s.dots));

    await page.click("[aria-label='Show Weight']");
    await sleep(800);
    s = await state(page);
    ok(`${vp}: the Weight dot brings Weight into view`, s.inView.includes("Weight"), JSON.stringify(s));
    const weight = await page.eval(`return document.querySelector("section[aria-label=Weight]").innerText`);
    const dots = await page.eval(`return document.querySelectorAll("section[aria-label=Weight] circle[role=button]").length`);
    ok(`${vp}: the Weight card has its chart, view only (logging is on the exercise page)`, dots === 10 && weight.includes("Show the weigh-ins") && !(await page.eval(`return !!document.querySelector("section[aria-label=Weight] input")`)), `${dots} ${weight.slice(0, 80)}`);
    await page.shot(`carousel-${vp}-02-weight`);
    await page.click("[aria-label='Show Sleep']");
    await sleep(800);
    s = await state(page);
    ok(`${vp}: the Sleep dot reaches the end; Next is disabled`, s.inView.includes("Sleep") && s.next, JSON.stringify(s));

    await page.eval(`${CAROUSEL}.querySelector("[aria-label='Previous chart']").focus()`);
    await page.key("Enter", "Enter", 13);
    await sleep(700);
    s = await state(page);
    ok(`${vp}: keyboard Enter on Previous moves back one`, s.inView[0] === (perView === 1 ? "Weight" : "Water"), JSON.stringify(s.inView));

    const eatenCols = await page.eval(`return document.querySelectorAll("[aria-label='Calories eaten'] rect[role=button]").length`);
    ok(`${vp}: the eaten chart has its 12 weekly columns`, eatenCols === 12, String(eatenCols));
    let o = await page.overflow();
    ok(`${vp}: weekly has no horizontal page overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
    await page.shot(`carousel-${vp}-03-weekly-page`, true);

    // --- Daily: today's cards, no carousel
    await setPeriod(page, "day");
    ok(`${vp}: daily has no carousel`, !(await page.eval(`return !!${CAROUSEL}`)));
    const card = (name) => page.eval(`return document.querySelector("section[aria-label='${name}']")?.innerText ?? ""`);
    const eaten = await card("Calories eaten");
    ok(`${vp}: Calories eaten today: 1,826 of 2,000, "Almost at your goal"`, eaten.includes("1,826") && eaten.includes("of 2,000 kcal goal") && eaten.includes("Almost at your goal"), eaten);
    const steps = await card("Steps");
    ok(`${vp}: Steps today: 9,000 of 8,000, "Target reached"`, steps.includes("9,000") && steps.includes("of 8,000") && steps.includes("Target reached"), steps);
    const water = await card("Water");
    ok(`${vp}: Water today: 0.75 of 2 L`, water.includes("0.75") && water.includes("of 2 L"), water);
    const wcard = await card("Weight");
    ok(`${vp}: Weight shows the latest weigh-in (yesterday's) and no chart`, /80\.1\s*kg\s*on /.test(wcard) && (await page.eval(`return document.querySelectorAll("section[aria-label=Weight] svg").length`)) === 0, wcard.slice(0, 160));
    const bars = await page.eval(`return [...document.querySelectorAll("[role=progressbar]")].map(b=>b.getAttribute("aria-valuenow"))`);
    ok(`${vp}: progress bars for eaten, active minutes, steps, water and sleep (91, 0, 100, 38, 0)`, JSON.stringify(bars) === JSON.stringify(["91", "0", "100", "38", "0"]), JSON.stringify(bars));
    if (perView === 2) {
      const tops = await page.eval(`return ["Calories eaten","Calories burned","Active minutes","Steps","Water","Weight"].map(t=>Math.round(document.querySelector("section[aria-label='"+t+"']").getBoundingClientRect().top))`);
      ok(`${vp}: daily cards sit two to a row`, tops[0] === tops[1] && tops[2] === tops[3] && tops[4] === tops[5] && tops[0] < tops[2] && tops[2] < tops[4], JSON.stringify(tops));
    }
    o = await page.overflow();
    ok(`${vp}: daily has no horizontal page overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
    await page.eval(`document.querySelector("section[aria-label='Calories eaten']").scrollIntoView({block:"start"}); window.scrollBy(0,-90)`);
    await page.shot(`carousel-${vp}-04-daily`);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Dashboard: today cards (daily) and chart carousel (weekly, monthly)", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
