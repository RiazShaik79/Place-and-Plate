// Email verification: reads the real links from the server's console log (where the "mailer" prints).
import fs from "node:fs";
import { db } from "../helpers/db.mjs";
import { createHash, randomBytes } from "node:crypto";
import { check, suite } from "../helpers/checks.mjs";

suite("Email verification and email changes", async () => {

  const BASE = process.env.BASE ?? "http://localhost:3100";
  const LOG = process.env.LOG;
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function client() {
    let cookie = "";
    return async (path, { method = "GET", body, manual } = {}) => {
      const res = await fetch(BASE + path, { method, redirect: manual ? "manual" : "follow", headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("ct_session=")) cookie = c.split(";")[0];
      let json = null; try { json = await res.clone().json(); } catch {}
      return { status: res.status, json, location: res.headers.get("location") };
    };
  }
  /** The newest verification link printed for `to`. */
  async function linkFor(to) {
    for (let i = 0; i < 20; i++) {
      const log = fs.readFileSync(LOG, "utf8");
      const blocks = log.split("EMAIL to ").filter((b) => b.startsWith(to + "\n") || b.startsWith(to + "\r\n"));
      const last = blocks.at(-1);
      const m = last?.match(/(https?:\/\/\S+\/api\/auth\/verify-email\?token=[A-Za-z0-9_%-]+)/);
      if (m) return m[1];
      await sleep(150);
    }
    return null;
  }
  const open = async (c, link) => {
    const r = await c(new URL(link).pathname + new URL(link).search, { manual: true });
    return new URL(r.location ?? "http://x/?status=none").searchParams.get("status");
  };

  const stamp = Date.now();
  const emailA = `vera.${stamp}@example.com`, newA = `vera.new.${stamp}@example.com`, emailB = `bea.${stamp}@example.com`;
  const a = client(), b = client(), anon = client();

  check("anon resend → 401", (await anon("/api/account/verify-email", { method: "POST" })).status === 401);
  check("anon cancel change → 401", (await anon("/api/account/pending-email", { method: "DELETE" })).status === 401);

  // Sign-up sends a link; the account starts unconfirmed
  let r = await a("/api/auth/register", { method: "POST", body: { name: "Vera Test", email: emailA, password: "a good password" } });
  check("register → 201, emailVerified false", r.status === 201 && r.json.user.emailVerified === false, JSON.stringify(r.json));
  let link = await linkFor(emailA);
  check("sign-up email printed with a verify link", Boolean(link), "no link in log");
  check("link uses /api/auth/verify-email?token=", link?.includes("/api/auth/verify-email?token="));

  // Open it (signed out works too)
  check("open link → status=verified", (await open(anon, link)) === "verified");
  check("account now confirmed", (await a("/api/account")).json.user.emailVerified === true);
  check("same link again → status=used", (await open(anon, link)) === "used");
  check("garbage token → status=invalid", (await open(anon, `${BASE}/api/auth/verify-email?token=nope`)) === "invalid");
  check("missing token → status=invalid", (await open(anon, `${BASE}/api/auth/verify-email`)) === "invalid");
  r = await a("/api/account/verify-email", { method: "POST" });
  check("resend when confirmed and nothing pending → 400", r.status === 400, JSON.stringify(r.json));

  // Email change: pending until confirmed
  await b("/api/auth/register", { method: "POST", body: { name: "Bea", email: emailB, password: "a good password" } });
  r = await a("/api/account", { method: "PATCH", body: { name: "Vera Test", email: emailB } });
  check("change to another account's email → 409", r.status === 409 && r.json?.field === "email");
  r = await a("/api/account", { method: "PATCH", body: { name: "Vera T", email: newA } });
  check("change email → sign-in email unchanged, pending set, name saved", r.status === 200 && r.json.user.email === emailA && r.json.user.pendingEmail === newA && r.json.user.name === "Vera T", JSON.stringify(r.json));
  const changeLink = await linkFor(newA);
  check("confirmation sent to the NEW address", Boolean(changeLink));
  check("still signs in with the old email", (await client()("/api/auth/login", { method: "POST", body: { email: emailA, password: "a good password" } })).status === 200);
  check("can't sign in with the new email yet", (await client()("/api/auth/login", { method: "POST", body: { email: newA, password: "a good password" } })).status === 401);
  r = await a("/api/account/verify-email", { method: "POST" });
  check("resend goes to the pending address", r.status === 200 && r.json.sentTo === newA, JSON.stringify(r.json));
  const changeLink2 = await linkFor(newA);
  check("resend replaces the old link (old → invalid)", changeLink2 !== changeLink && (await open(anon, changeLink)) === "invalid");
  check("open new-address link → status=changed", (await open(anon, changeLink2)) === "changed");
  r = await a("/api/account");
  check("sign-in email is now the new one, confirmed, nothing pending", r.json.user.email === newA && r.json.user.emailVerified && r.json.user.pendingEmail === null, JSON.stringify(r.json.user));
  check("signs in with the new email", (await client()("/api/auth/login", { method: "POST", body: { email: newA, password: "a good password" } })).status === 200);
  check("old email no longer signs in", (await client()("/api/auth/login", { method: "POST", body: { email: emailA, password: "a good password" } })).status === 401);

  // Cancelled change: its link stops working
  const third = `vera.third.${stamp}@example.com`;
  await a("/api/account", { method: "PATCH", body: { name: "Vera T", email: third } });
  const thirdLink = await linkFor(third);
  r = await a("/api/account/pending-email", { method: "DELETE" });
  check("cancel change → pending cleared", r.status === 200 && r.json.user.pendingEmail === null);
  check("cancelled change's link → status=invalid", (await open(anon, thirdLink)) === "invalid");

  // Taken meanwhile: another account claims the address before the link is opened
  const contested = `contested.${stamp}@example.com`;
  await a("/api/account", { method: "PATCH", body: { name: "Vera T", email: contested } });
  const contestedLink = await linkFor(contested);
  await client()("/api/auth/register", { method: "POST", body: { name: "Quick", email: contested, password: "a good password" } });
  check("address taken before confirming → status=taken", (await open(anon, contestedLink)) === "taken");
  check("…and the sign-in email didn't change", (await a("/api/account")).json.user.email === newA);
  await a("/api/account/pending-email", { method: "DELETE" });

  // Expired link
  const ex = client();
  const exEmail = `old.${stamp}@example.com`;
  await ex("/api/auth/register", { method: "POST", body: { name: "Old Link", email: exEmail, password: "a good password" } });
  const exLink = await linkFor(exEmail);
  const exToken = new URL(exLink).searchParams.get("token");
  await db.prepare("UPDATE email_verifications SET expires_at = ? WHERE token_hash = ?").run(new Date(Date.now() - 1000).toISOString(), sha(exToken));
  check("expired link → status=expired", (await open(anon, exLink)) === "expired");
  check("…account still unconfirmed", (await ex("/api/account")).json.user.emailVerified === false);
  const ttl = await db.prepare("SELECT created_at, expires_at FROM email_verifications WHERE user_id = (SELECT id FROM users WHERE email = ?) ").get(newA);
  // Resend throttle: 3 per 15 min
  let last;
  for (let i = 0; i < 4; i++) last = await ex("/api/account/verify-email", { method: "POST" });
  check("4th resend in 15 min → 429", last.status === 429, JSON.stringify(last.json));
  const fresh = await db.prepare("SELECT created_at, expires_at FROM email_verifications WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY created_at DESC").get(exEmail);
  check("links last 24 hours", Math.round((new Date(fresh.expires_at) - new Date(fresh.created_at)) / 3600e3) === 24, JSON.stringify(fresh));

  // Password reset also confirms the email (the reset link went to that inbox)
  const rs = client();
  const rsEmail = `reset.${stamp}@example.com`;
  r = await rs("/api/auth/register", { method: "POST", body: { name: "Reset Person", email: rsEmail, password: "a good password" } });
  const token = randomBytes(32).toString("base64url");
  await db.prepare("INSERT INTO password_resets (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(sha(token), r.json.user.id, new Date().toISOString(), new Date(Date.now() + 1800e3).toISOString());
  const rc = client();
  await rc("/api/auth/reset", { method: "POST", body: { token, password: "a new good password" } });
  check("completing a password reset confirms the email", (await rc("/api/account")).json.user.emailVerified === true);

  // Pages
  const page = await (await fetch(`${BASE}/verify-email?status=verified`)).text();
  check("result page: verified", page.includes("Email confirmed"));
  const pageExp = await (await fetch(`${BASE}/verify-email?status=expired`)).text();
  check("result page: expired explains 24 hours", pageExp.includes("This link has expired") && pageExp.includes("24 hours"));
  const pageBad = await (await fetch(`${BASE}/verify-email?status=<script>`)).text();
  check("result page: unknown status → invalid copy", pageBad.includes("can&#x27;t be used") || pageBad.includes("can't be used"));
});
