// Server-only auth: password hashing, database sessions in an httpOnly cookie, sign-in throttling.
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteSession, extendSession, findSession, findSessionUser, insertSession } from "./db";
import type { User } from "./types";

export const SESSION_COOKIE = "ct_session";
// "Keep me signed in" ticked: a persistent cookie for 30 days, renewed while the app is in use.
// Unticked: a browser-session cookie (gone when the browser closes) and a 12-hour idle limit.
const DAY_MS = 24 * 60 * 60 * 1000;
const REMEMBER_MS = 30 * DAY_MS;
const SHORT_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Passwords: scrypt with a per-user random salt, stored as "scrypt$N$r$p$salt$hash" (base64url).
// ---------------------------------------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keyLength } = SCRYPT;
  const key = await scryptAsync(password.normalize("NFKC"), salt, keyLength, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scryptAsync(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(key, expected);
}

/** A real hash of a random password: verifying against it keeps "unknown email" as slow as "wrong password". */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  return (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));
}

// ---------------------------------------------------------------------------------------------
// Sessions: the cookie holds a random token; the database holds only its SHA-256 hash.
// ---------------------------------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function setSessionCookie(token: string, remember: boolean, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No `expires` = a browser-session cookie that disappears when the browser closes.
    ...(remember ? { expires } : {}),
  });
}

/** Start a session for this user and set the cookie (route handlers / server functions only). */
export async function startSession(userId: number, remember = true) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + (remember ? REMEMBER_MS : SHORT_MS));
  await insertSession(hashToken(token), userId, expires, remember);
  await setSessionCookie(token, remember, expires);
}

// ---------------------------------------------------------------------------------------------
// "Remembered on this device": after a sign-in with "Keep me signed in" ticked, the sign-in page
// greets the person by name with their email filled in, even after they sign out. Only the email
// and name are kept (never the password), in an httpOnly cookie; unticking, or "Not you?", clears it.
// ---------------------------------------------------------------------------------------------

export const DEVICE_COOKIE = "ct_device_user";

export async function rememberOnDevice(user: Pick<User, "email" | "name">) {
  const value = Buffer.from(JSON.stringify({ email: user.email, name: user.name })).toString("base64url");
  (await cookies()).set(DEVICE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + 365 * DAY_MS),
  });
}

export async function forgetOnDevice() {
  (await cookies()).delete(DEVICE_COOKIE);
}

/** The person last remembered on this browser, if any (for the sign-in page). */
export async function getDeviceUser(): Promise<{ email: string; name: string } | null> {
  const raw = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return typeof v?.email === "string" && typeof v?.name === "string" ? { email: v.email.slice(0, 254), name: v.name.slice(0, 60) } : null;
  } catch {
    return null;
  }
}

/** End the current session (if any) and clear the cookie. */
export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Works in server components and route handlers. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? await findSessionUser(hashToken(token)) : null;
}

/** Hash of the current request's session token, e.g. to keep this session when signing out others. */
export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/**
 * For API routes: `const user = await requireUser(); if (user instanceof NextResponse) return user;`
 * Also renews the session once it's half used, so someone using the app regularly stays signed in
 * (a remembered session effectively never expires while it's in use; a short one idles out).
 */
export async function requireUser(): Promise<User | NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await findSession(hashToken(token)) : null;
  if (!token || !session) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const lifetime = session.remember ? REMEMBER_MS : SHORT_MS;
  if (session.expiresAt.getTime() - Date.now() < lifetime / 2) {
    const expires = new Date(Date.now() + lifetime);
    await extendSession(hashToken(token), expires);
    await setSessionCookie(token, session.remember, expires);
  }
  return session.user;
}

// ---------------------------------------------------------------------------------------------
// Throttling, in memory: enough for a single local server; a hosted deployment should use a
// shared store. Sign-in: 5 failures per email, then wait 15 minutes. Reset links: 3 per email
// per 15 minutes.
// ---------------------------------------------------------------------------------------------

export function createThrottle(name: string, max: number, windowMs: number) {
  const store = globalThis as unknown as Record<string, Map<string, { count: number; first: number }> | undefined>;
  const hits = (store[`throttle:${name}`] ??= new Map());
  return {
    /** Minutes until this key may try again, or 0 if it isn't blocked. */
    blockedMinutes(key: string): number {
      const h = hits.get(key);
      if (!h) return 0;
      const elapsed = Date.now() - h.first;
      if (elapsed > windowMs) {
        hits.delete(key);
        return 0;
      }
      return h.count >= max ? Math.ceil((windowMs - elapsed) / 60000) : 0;
    },
    record(key: string) {
      const h = hits.get(key);
      if (h && Date.now() - h.first <= windowMs) h.count += 1;
      else hits.set(key, { count: 1, first: Date.now() });
    },
    clear(key: string) {
      hits.delete(key);
    },
  };
}

const loginThrottle = createThrottle("login", 5, 15 * 60 * 1000);
export const lockoutMinutes = loginThrottle.blockedMinutes;
export const recordLoginFailure = loginThrottle.record;
export const clearLoginFailures = loginThrottle.clear;

export const resetThrottle = createThrottle("reset", 3, 15 * 60 * 1000);

// Address search costs money per Google request: cap each user (keyed by user id) so a stuck
// client or a script can't run up the bill. Typing an address takes ~5-10 debounced requests.
export const placesThrottle = createThrottle("places", 60, 10 * 60 * 1000);

// ---------------------------------------------------------------------------------------------
// Password reset tokens: 32 random bytes in the link; the database stores only the hash.
// ---------------------------------------------------------------------------------------------

export const RESET_TTL_MINUTES = 30;

export function newResetToken(): { token: string; tokenHash: string; expires: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expires: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000) };
}

export function resetTokenHash(token: string): string {
  return hashToken(token);
}

// Email verification links: same token scheme, valid for 24 hours; resends are throttled per user.
export const VERIFY_TTL_HOURS = 24;
export const verifyThrottle = createThrottle("verify", 3, 15 * 60 * 1000);

/** Hash of a token from an emailed link (verification links use the same scheme as reset links). */
export function linkTokenHash(token: string): string {
  return hashToken(token);
}

export function newVerifyToken(): { token: string; tokenHash: string; expires: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expires: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000) };
}
