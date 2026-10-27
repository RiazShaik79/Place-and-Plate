// MySQL concurrency: the same verification link (and reset link) used twice at the same moment, two
// step saves for one day, two sign-ups for one email.
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../helpers/db.mjs";
import { check, suite } from "../helpers/checks.mjs";

suite("Concurrency: double clicks and simultaneous writes", async () => {

  const BASE = process.env.BASE ?? "http://localhost:3100";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  async function linkFor(to) {
    for (let i = 0; i < 20; i++) {
      const blocks = fs.readFileSync(process.env.LOG, "utf8").split("EMAIL to ").filter((b) => b.startsWith(to + "\n") || b.startsWith(to + "\r\n"));
      const m = blocks.at(-1)?.match(/(https?:\/\/\S+\/api\/auth\/verify-email\?token=[A-Za-z0-9_%-]+)/);
      if (m) return m[1];
      await sleep(150);
    }
    return null;
  }
  const post = (path, body, cookie) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const stamp = Date.now();

  // Two sign-ups for the same email at once: exactly one account
  const twin = `twin.${stamp}@example.com`;
  const signups = await Promise.all([1, 2, 3].map(() => post("/api/auth/register", { name: "Twin", email: twin, password: "a good password" })));
  const codes = signups.map((r) => r.status).sort();
  check("3 simultaneous sign-ups for one email → one 201, the rest 409", JSON.stringify(codes) === "[201,409,409]", JSON.stringify(codes));
  check("…and only one user row", Number((await db.prepare("SELECT COUNT(*) n FROM users WHERE email = ?").get(twin)).n) === 1);
  const cookie = signups.find((r) => r.status === 201).headers.getSetCookie()[0].split(";")[0];

  // Same verification link opened twice at once
  const link = await linkFor(twin);
  const statuses = (await Promise.all([1, 2].map(() => fetch(link, { redirect: "manual" }))))
    .map((r) => new URL(r.headers.get("location")).searchParams.get("status"))
    .sort();
  check("same verification link twice at once → one verified, one used", JSON.stringify(statuses) === '["used","verified"]', JSON.stringify(statuses));

  // Same reset link submitted twice at once
  const userId = (await db.prepare("SELECT id FROM users WHERE email = ?").get(twin)).id;
  const token = randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO password_resets (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(sha(token), userId, new Date().toISOString(), new Date(Date.now() + 1800e3).toISOString());
  const resets = await Promise.all(["first new password", "second new password"].map((password) => post("/api/auth/reset", { token, password })));
  const resetCodes = resets.map((r) => r.status).sort();
  check("same reset link twice at once → one 200, one 400", JSON.stringify(resetCodes) === "[200,400]", JSON.stringify(resetCodes));
  const winner = resets.find((r) => r.status === 200) ? (resets[0].status === 200 ? "first new password" : "second new password") : null;
  check("…and the winning password is the one that works", (await post("/api/auth/login", { email: twin, password: winner })).status === 200);

  // Two step saves for the same day at once: one row, a valid value
  const fresh = await post("/api/auth/login", { email: twin, password: winner });
  const c2 = fresh.headers.getSetCookie()[0].split(";")[0];
  const day = "2026-10-16";
  await Promise.all([4000, 9000].map((steps) => fetch(BASE + "/api/steps", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: c2 }, body: JSON.stringify({ date: day, steps }) })));
  const rows = await db.prepare("SELECT steps FROM daily_steps WHERE user_id = ? AND date = ?").all(userId, day);
  check("two step saves for one day at once → one row with one of the values", rows.length === 1 && [4000, 9000].includes(Number(rows[0].steps)), JSON.stringify(rows));
  void cookie;
});
