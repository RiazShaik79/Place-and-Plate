// Shared bits for the API suites: the base URL, dates in local time, a cookie-keeping client, and
// emailed links read back from the server log (the app's mailer prints mail to stdout).
import fs from "node:fs";

export const BASE = process.env.BASE ?? "http://localhost:3100";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
export const near = (a, b, tolerance = 0.01) => Math.abs(a - b) < tolerance;

/** fetch wrapper with its own session cookie: await call(path, { method, body }) → { status, json, headers }. */
export function client() {
  let cookie = "";
  const call = async (path, { method = "GET", body, headers = {} } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("ct_session=")) cookie = c.split(";")[0];
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json, headers: res.headers };
  };
  call.cookie = () => cookie;
  return call;
}

/** The newest link of `kind` ("verify-email" | "reset-password") emailed to `to`, from the server log. */
export async function linkFor(to, kind = "verify-email") {
  const pattern = kind === "verify-email" ? /(https?:\/\/\S+\/api\/auth\/verify-email\?token=[A-Za-z0-9_%-]+)/ : /(https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_%-]+)/;
  for (let i = 0; i < 30; i++) {
    const blocks = fs.readFileSync(process.env.LOG, "utf8").split("EMAIL to ").filter((b) => b.startsWith(to + "\n") || b.startsWith(to + "\r\n"));
    const m = blocks.at(-1)?.match(pattern);
    if (m) return m[1];
    await sleep(150);
  }
  return null;
}
