// `npm test`: unit tests, then a production build served on a test port for the API and browser
// suites. AI and Places keys are blanked for the server, so a test run never spends quota.
//
//   npm test                      everything
//   npm run test:quick            unit + api
//   npm test -- --only e2e        one or more of unit,api,e2e
//   npm test -- water             only files whose name contains "water"
//   npm test -- --no-build        reuse the last test build
//   npm run test:screens          screenshot walkthroughs (tests/review), for design reviews
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build, ROOT, start } from "./helpers/server.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const onlyArg = args.find((a, i) => args[i - 1] === "--only");
const filters = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
const review = flag("--review");
const phases = review ? ["review"] : (onlyArg ?? "unit,api,e2e").split(",").map((s) => s.trim());

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // no .env: rely on the environment
}
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const port = Number(process.env.TEST_PORT || 3100);
const OUT = path.join(ROOT, "tests", ".output");
const LOG = path.join(OUT, "server.log");

const files = (dir, ext) => {
  const full = path.join(ROOT, "tests", dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(ext) && (filters.length === 0 || filters.some((x) => f.includes(x))))
    .sort()
    .map((f) => path.join("tests", dir, f));
};

function runNodeTest(list, extraArgs, env) {
  if (list.length === 0) return { ran: false, ok: true };
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...extraArgs, ...list], { cwd: ROOT, env, stdio: "inherit" });
  return { ran: true, ok: r.status === 0 };
}

const results = [];
const started = Date.now();

if (phases.includes("unit")) {
  // lib/*.ts have no package "type"; Node parses them as ES modules anyway, so skip its notice.
  const r = runNodeTest(files("unit", ".test.ts"), ["--import", "./tests/helpers/register.mjs", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"], process.env);
  if (r.ran) results.push(["unit", r.ok]);
}

const serverPhases = phases.filter((p) => p !== "unit");
const serverFiles = {
  api: files("api", ".test.mjs"),
  e2e: files("e2e", ".test.mjs"),
  review: files("review", ".test.mjs"),
};
if (serverPhases.some((p) => serverFiles[p]?.length)) {
  if (!databaseUrl) {
    console.error("\nDATABASE_URL (or TEST_DATABASE_URL) isn't set in .env, so the API and browser tests can't run.");
    process.exit(1);
  }
  // Fail fast with a readable message if MySQL won't accept the connection.
  process.env.DATABASE_URL = databaseUrl;
  const { db, deleteTestUsers } = await import("./helpers/db.mjs");
  try {
    await db.prepare("SELECT 1").get();
  } catch (e) {
    console.error(`\nCan't connect to the test database (${e.code ?? e.message}). Check DATABASE_URL / TEST_DATABASE_URL in .env.`);
    process.exit(1);
  }

  const serverEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    GEMINI_API_KEY: "", // never call Gemini from tests
    GOOGLE_MAPS_API_KEY: "", // never call Google Places from tests
    APP_URL: `http://localhost:${port}`,
    NODE_ENV: "production",
  };
  if (!flag("--no-build")) {
    console.log("\nBuilding the app for tests (.next-test)…");
    const t0 = Date.now();
    try {
      build(serverEnv);
    } catch {
      console.error("\nThe build failed (see above).");
      process.exit(1);
    }
    console.log(`Built in ${Math.round((Date.now() - t0) / 1000)} s.`);
  }
  let server;
  try {
    server = await start(serverEnv, port, LOG);
    console.log(`Test server on ${server.base} (log: ${path.relative(ROOT, LOG)})\n`);
    const testEnv = { ...process.env, BASE: server.base, LOG, DATABASE_URL: databaseUrl };
    for (const phase of serverPhases) {
      const r = runNodeTest(serverFiles[phase] ?? [], [], testEnv);
      if (r.ran) results.push([phase, r.ok]);
    }
  } catch (e) {
    console.error("\n" + e.message);
    results.push(["server", false]);
  } finally {
    await server?.stop();
    const removed = await deleteTestUsers().catch(() => 0);
    if (removed) console.log(`\nRemoved ${removed} test accounts (@example.com).`);
  }
}

const secs = Math.round((Date.now() - started) / 1000);
if (results.length === 0) {
  console.log("\nNo test files matched.");
  process.exit(1);
}
console.log(`\n${results.map(([p, ok]) => `${p}: ${ok ? "passed" : "FAILED"}`).join("   ")}   (${secs} s)`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
