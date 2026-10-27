// Build the app into .next-test and serve it on a test port, logging to a file the tests can read
// (the console mailer prints verification and reset links there).
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const DIST_DIR = ".next-test";
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

/**
 * Start each test build from an empty folder. OneDrive marks build output read-only / as cloud
 * placeholders (anywhere in the tree), which makes `next build` fail with EPERM when it cleans up.
 */
function clearBuildFolder() {
  const dir = path.join(ROOT, DIST_DIR);
  if (!fs.existsSync(dir)) return;
  if (process.platform === "win32") {
    const ps = `attrib -R "${dir}\\*" /S /D 2>$null | Out-Null; Remove-Item -LiteralPath "${dir}" -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue`;
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
    } catch {
      // fall through to the Node removal below
    }
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // best effort: next build reports anything that's still locked
  }
}

export function build(env) {
  clearBuildFolder();
  execFileSync(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, env: { ...env, NEXT_DIST_DIR: DIST_DIR }, stdio: ["ignore", "pipe", "inherit"] });
}

async function isUp(base) {
  try {
    return (await fetch(`${base}/login`, { redirect: "manual" })).status < 500;
  } catch {
    return false;
  }
}

/** Start `next start` on `port`; resolves once /login answers. Returns { base, log, stop() }. */
export async function start(env, port, logPath) {
  const base = `http://localhost:${port}`;
  if (await isUp(base)) throw new Error(`Port ${port} is already in use. Stop whatever runs there (or set TEST_PORT) and try again.`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, "w");
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...env, NEXT_DIST_DIR: DIST_DIR },
    stdio: ["ignore", out, out],
  });
  let exited = false;
  child.on("exit", () => (exited = true));
  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error(`The test server exited early. See ${logPath}`);
    if (await isUp(base)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await isUp(base))) throw new Error(`The test server didn't start within 60 s. See ${logPath}`);
  // Warm up: the first database query opens the pool and checks migrations, and each page's first
  // render is slower. Do that here, so the first test doesn't race it.
  await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "warmup@example.com", password: "x" }) }).catch(() => {});
  for (const page of ["/login", "/", "/dashboard", "/exercise", "/account"]) await fetch(base + page, { redirect: "manual" }).catch(() => {});
  return {
    base,
    log: logPath,
    async stop() {
      if (!exited) child.kill();
      await new Promise((r) => setTimeout(r, 500));
      fs.closeSync(out);
    },
  };
}
