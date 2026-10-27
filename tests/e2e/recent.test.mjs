// Recent tab, favourites, "Same as yesterday" (+ Undo) and editing an entry. Desktop + mobile.
import { check as ok, suite } from "../helpers/checks.mjs";
import { openBrowser } from "../helpers/browser.mjs";
const B = process.env.BASE ?? "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATES = `const f=(n)=>{const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}; const today=f(0), yday=f(1);`;
async function mark(page, js) {
  await page.eval(`document.querySelectorAll("[data-cdp]").forEach(e=>e.removeAttribute("data-cdp")); const el=(()=>{${js}})(); if(!el) throw new Error("not found: " + ${JSON.stringify(js)}); el.scrollIntoView({block:"center"}); el.setAttribute("data-cdp","1");`);
  await page.click("[data-cdp='1']");
}
const clickText = (page, text, scope = "document") => mark(page, `return [...${scope}.querySelectorAll("button")].find(e=>e.textContent.trim()===${JSON.stringify(text)} && e.offsetParent!==null)`);
const panelText = (page) => page.eval(`return document.querySelector("#panel-recent")?.innerText ?? ""`);
const mealText = (page, meal) => page.eval(`const h=[...document.querySelectorAll("h3")].find(x=>x.textContent.trim()===${JSON.stringify(meal)}); return h ? h.closest(".py-4").innerText : ""`);
const toastText = (page) => page.eval(`return document.querySelector("[aria-live] [role=status]")?.innerText ?? ""`);
const eaten = (page) => page.eval(`return document.querySelector("[aria-label='Daily summary']")?.innerText.match(/([\\d,]+) eaten/)?.[1] ?? ""`);

async function run(page) {
  for (const [vp, w, h, mobile] of [["desk", 1440, 900, false], ["mob", 390, 844, true]]) {
    await page.clearCookies();
    await page.viewport(w, h, mobile);
    await page.goto(`${B}/login`);
    // New account: nothing logged yet → the panel opens on Search
    await page.eval(`await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Rory Repeat",email:"rory.${vp}.${Date.now()}@example.com",password:"a good password"})})`);
    await page.goto(`${B}/`);
    await sleep(1000);
    const firstTab = await page.eval(`return document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim()`);
    ok(`${vp}: a brand-new account starts on Search`, firstTab === "Search", firstTab);
    const tabs = await page.eval(`const l=document.querySelector("[role=tablist][aria-label='How to add food']"); return {sw:l.scrollWidth, cw:l.clientWidth, labels:[...l.children].map(b=>b.textContent.trim())}`);
    ok(`${vp}: four tabs fit (Recent, Search, Describe, Photo)`, tabs.sw <= tabs.cw + 1 && tabs.labels.join() === "Recent,Search,Describe,Photo", JSON.stringify(tabs));

    // Yesterday: breakfast oatmeal x1.5 + banana; oatmeal again earlier (so "usually 1.5")
    await page.eval(`${DATES}
      const post=(u,b)=>fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
      await post("/api/log",{foodId:"oatmeal",servings:1.5,date:f(3),meal:"breakfast"});
      await post("/api/log",{foodId:"oatmeal",servings:1.5,date:f(2),meal:"breakfast"});
      await post("/api/log",{foodId:"oatmeal",servings:1.5,date:yday,meal:"breakfast"});
      await post("/api/log",{foodId:"banana",servings:1,date:yday,meal:"breakfast"});
      await post("/api/log/custom",{date:yday,meal:"lunch",source:"text",items:[{name:"Chicken wrap",portion:"1 wrap",calories:450,protein:30,carbs:40,fat:15}]});`);
    await page.goto(`${B}/`);
    await sleep(1300);
    const tabNow = await page.eval(`return document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim()`);
    ok(`${vp}: with history the panel opens on Recent`, tabNow === "Recent", tabNow);
    let t = await panelText(page);
    ok(`${vp}: Recent lists oatmeal (usually 1.5), banana, the AI wrap`, t.includes("Oatmeal (cooked)") && t.includes("usually 1.5") && t.includes("Banana") && t.includes("Chicken wrap"), t);
    await page.shot(`recent-${vp}-01-tab`);

    // Same as yesterday on empty Breakfast
    let b = await mealText(page, "Breakfast");
    ok(`${vp}: empty breakfast offers Same as yesterday (2 items, 354 kcal)`, b.includes("Same as yesterday") && b.includes("2 items, 354 kcal"), b);
    const dinner = await mealText(page, "Dinner");
    ok(`${vp}: dinner (nothing yesterday) doesn't offer it`, !dinner.includes("Same as"), dinner);
    await mark(page, `return [...document.querySelectorAll("button")].find(e=>e.textContent.includes("Same as yesterday"))`);
    await sleep(200);
    b = await mealText(page, "Breakfast");
    ok(`${vp}: confirm lists the foods`, b.includes("Breakfast from yesterday") && b.includes("Banana") && b.includes("Add 2 items"), b);
    await page.shot(`recent-${vp}-02-copy-confirm`);
    await clickText(page, "Add 2 items");
    await sleep(800);
    b = await mealText(page, "Breakfast");
    ok(`${vp}: breakfast now has 2 items, 354 kcal`, b.includes("2 items") && b.includes("354"), b);
    ok(`${vp}: toast offers Undo`, (await toastText(page)).includes("Added 2 items to breakfast"));
    await clickText(page, "Undo");
    await sleep(900);
    b = await mealText(page, "Breakfast");
    ok(`${vp}: Undo removes both copies`, b.includes("Nothing logged yet"), b);
    await page.goto(`${B}/`);
    await sleep(1300);
    ok(`${vp}: …and they stay gone after a reload`, (await mealText(page, "Breakfast")).includes("Nothing logged yet"));

    // Add again from Recent at the usual serving, into the selected meal (Lunch)
    await mark(page, `return [...document.querySelectorAll("label")].find(l=>l.textContent.trim()==="Lunch")`);
    await mark(page, `return [...document.querySelectorAll("#panel-recent button[aria-expanded]")].find(b=>b.textContent.includes("Oatmeal"))`);
    await sleep(200);
    const stepper = await page.eval(`return document.querySelector("#panel-recent input[type=number]")?.value`);
    ok(`${vp}: the stepper starts at the usual 1.5`, stepper === "1.5", stepper);
    await clickText(page, "Add to lunch", `document.querySelector("#panel-recent")`);
    await sleep(800);
    ok(`${vp}: oatmeal x1.5 added to lunch (249 kcal)`, (await mealText(page, "Lunch")).includes("249"), await mealText(page, "Lunch"));
    ok(`${vp}: toast says so`, (await toastText(page)).includes("Added Oatmeal (cooked) to lunch"));

    // Favourite
    await mark(page, `return document.querySelector("#panel-recent button[aria-label='Add Banana to favourites']")`);
    await sleep(900);
    t = await panelText(page);
    ok(`${vp}: banana moves under Favourites`, /Favourites\s+Banana/.test(t), t);
    await page.goto(`${B}/`);
    await sleep(1300);
    const pressed = await page.eval(`return document.querySelector("#panel-recent button[aria-label='Remove Banana from favourites']")?.getAttribute("aria-pressed")`);
    ok(`${vp}: the star survives a reload`, pressed === "true", String(pressed));
    await page.shot(`recent-${vp}-03-favourite`);

    // Edit an entry: lunch oatmeal 1.5 → 2.5 servings, then move it to dinner
    const before = await eaten(page);
    await mark(page, `return [...document.querySelectorAll("button[aria-expanded]")].find(b=>b.getAttribute("aria-label")?.startsWith("Oatmeal (cooked), 249 kcal"))`);
    await sleep(200);
    await page.shot(`recent-${vp}-04-edit`);
    await mark(page, `return [...document.querySelectorAll("li button[aria-label='More servings']")].find(b=>b.closest("li")?.innerText.includes("Save changes"))`);
    await mark(page, `return [...document.querySelectorAll("li button[aria-label='More servings']")].find(b=>b.closest("li")?.innerText.includes("Save changes"))`);
    await sleep(100);
    ok(`${vp}: editor previews 415 kcal for 2.5 servings`, (await page.eval(`return [...document.querySelectorAll("li")].find(l=>l.innerText.includes("Save changes"))?.innerText ?? ""`)).includes("415"));
    await clickText(page, "Save changes");
    await sleep(800);
    const lunch = await mealText(page, "Lunch");
    ok(`${vp}: entry now 2.5 × 1 cup, 415 kcal`, lunch.includes("2.5 ×") && lunch.includes("415"), lunch);
    ok(`${vp}: summary updated (+166 eaten)`, Number((await eaten(page)).replace(",", "")) === Number(before.replace(",", "")) + 166, `${before} → ${await eaten(page)}`);
    await mark(page, `return [...document.querySelectorAll("button[aria-expanded]")].find(b=>b.getAttribute("aria-label")?.startsWith("Oatmeal (cooked), 415 kcal"))`);
    await page.eval(`const s=[...document.querySelectorAll("select")].find(x=>x.closest("li")?.innerText.includes("Save changes")); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; set.call(s,"dinner"); s.dispatchEvent(new Event("change",{bubbles:true}));`);
    await clickText(page, "Save changes");
    await sleep(800);
    ok(`${vp}: moved to dinner`, (await mealText(page, "Dinner")).includes("415") && (await toastText(page)).includes("Moved Oatmeal (cooked) to dinner"));

    const o = await page.overflow();
    ok(`${vp}: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `${o.scrollWidth}/${o.innerWidth}`);
    await page.shot(`recent-${vp}-05-final`, true);
  }
  ok("no console errors", page.consoleErrors.length === 0, page.consoleErrors.join(" | "));
}

suite("Recent tab, favourites, same as yesterday, edit", async () => {
  const page = await openBrowser();
  try {
    await run(page);
  } finally {
    await page.close();
  }
});
