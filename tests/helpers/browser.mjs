// A small headless-Chrome driver over the DevTools protocol (Node's global WebSocket), so browser
// tests need no Playwright download. openBrowser() → page; always `await page.close()`.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".output", "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export function chromePath() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Chrome found for browser tests. Install Chrome or set CHROME_PATH in .env.");
  return found;
}

export async function openBrowser() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pp-chrome-"));
  // Port 0: Chrome picks a free port and writes it to DevToolsActivePort in the profile.
  const chrome = spawn(
    chromePath(),
    ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank"],
    { stdio: "ignore" },
  );
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try {
      port = Number(fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
    } catch {
      await sleep(100);
    }
  }
  if (!port) throw new Error("Chrome didn't start");
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(100);
    }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  const consoleErrors = [];
  listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  });

  return {
    consoleErrors,
    async viewport(width, height, mobile = false) {
      await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
      await s("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    },
    async goto(url) {
      const loaded = new Promise((r) => {
        const l = (m) => {
          if (m.method === "Page.loadEventFired" && m.sessionId === sessionId) {
            listeners.splice(listeners.indexOf(l), 1);
            r();
          }
        };
        listeners.push(l);
      });
      await s("Page.navigate", { url });
      await loaded;
      await sleep(600);
    },
    async eval(expr) {
      const r = await s("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(selector, timeout = 10000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await this.eval(`return !!document.querySelector(${JSON.stringify(selector)})`)) return;
        await sleep(100);
      }
      throw new Error("timeout waiting for " + selector);
    },
    async waitForUrl(part, timeout = 10000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const href = await this.eval("return location.href").catch(() => "");
        if (href.includes(part)) {
          await sleep(700);
          return href;
        }
        await sleep(150);
      }
      throw new Error("timeout waiting for url " + part);
    },
    async click(selector) {
      const box = await this.eval(
        `const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("no element ${selector.replace(/"/g, "'")}"); el.scrollIntoView({block:"center"}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`,
      );
      await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      await s("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
      await s("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
      await sleep(250);
    },
    async clickText(text, tag = "button,a") {
      await this.eval(
        `const els=[...document.querySelectorAll(${JSON.stringify(tag)})].filter(e=>e.textContent.trim()===${JSON.stringify(text)} && e.offsetParent!==null); if(!els.length) throw new Error("no ${tag} with text ${text}"); els[0].setAttribute("data-cdp","1"); return true;`,
      );
      await this.click("[data-cdp='1']");
      await this.eval(`document.querySelector("[data-cdp='1']")?.removeAttribute("data-cdp")`);
    },
    async type(selector, text, clear = true) {
      await this.eval(`const el=document.querySelector(${JSON.stringify(selector)}); el.focus(); ${clear ? "el.select?.();" : ""}`);
      if (clear) {
        await s("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await s("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
      await s("Input.insertText", { text });
      await sleep(80);
    },
    async key(key, code = key, vk = 0) {
      await s("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, ...(key === "Enter" ? { text: "\r" } : {}) });
      await s("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
      await sleep(120);
    },
    async shot(name, fullPage = false) {
      await sleep(350);
      const params = { format: "png", captureBeyondViewport: fullPage };
      if (fullPage) {
        const { cssContentSize } = await s("Page.getLayoutMetrics");
        params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
      }
      const { data } = await s("Page.captureScreenshot", params);
      fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
    },
    async clearCookies() {
      await s("Network.clearBrowserCookies");
    },
    /** All cookies, including httpOnly ones (a session cookie has session: true / expires: -1). */
    async allCookies() {
      return (await s("Network.getAllCookies")).cookies;
    },
    async overflow() {
      return this.eval("return {scrollWidth: document.documentElement.scrollWidth, innerWidth}");
    },
    async close() {
      try {
        ws.close();
      } catch {}
      chrome.kill();
      await sleep(400);
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {}
    },
  };
}
