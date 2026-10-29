// The only database access in the app: a MySQL pool (mysql2) plus every query.
// Dates stay 'YYYY-MM-DD' strings and timestamps ISO-8601 UTC strings, as they were in SQLite.
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";
import { migrate } from "./db-migrate";
import { log } from "./log";
import { DAILY_WATER_MAX } from "./account";
import { FOOD_KEY_SQL, foodKey } from "./foods";
import { isActivity, isSex, type WeighIn } from "./goals";
import {
  isCategory,
  isIntensity,
  isMeal,
  type AiSource,
  type ExerciseCategory,
  type ExerciseDay,
  type ExerciseEntry,
  type FavoriteFood,
  type Food,
  type Intensity,
  type LogEntry,
  type Meal,
  type NutritionItem,
  type RecentFood,
  type Address,
  type HistoryBucket,
  type Settings,
  type User,
} from "./types";

export const DEFAULT_SETTINGS: Settings = { calorieGoal: 2000 };

// ---------------------------------------------------------------------------------------------
// Connection, migrations, helpers
// ---------------------------------------------------------------------------------------------

// `ssl-mode` values (MySQL client style) that require an encrypted, verified connection.
const TLS_SSL_MODES = new Set(["REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"]);

function createPool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add DATABASE_URL=mysql://user:password@127.0.0.1:3306/plate_and_pace to .env and restart.",
    );
  }
  // Hosted MySQL (e.g. Aiven) adds `?ssl-mode=REQUIRED`. mysql2 doesn't understand that option, so
  // remove it from the URL and turn it into mysql2's `ssl` setting instead. A local URL without it
  // connects exactly as before (no TLS).
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("ssl-mode")?.toUpperCase();
  parsed.searchParams.delete("ssl-mode");
  let ssl: { ca: string; rejectUnauthorized: true } | undefined;
  if (sslMode && TLS_SSL_MODES.has(sslMode)) {
    // The provider's CA certificate (PEM). Escaped "\n" are accepted for single-line env values.
    const ca = process.env.DATABASE_CA_CERT?.trim().replace(/\\n/g, "\n");
    if (!ca) {
      throw new Error(
        `DATABASE_URL asks for TLS (ssl-mode=${sslMode}) but DATABASE_CA_CERT is not set. Set DATABASE_CA_CERT to your database provider's CA certificate (PEM) and restart.`,
      );
    }
    ssl = { ca, rejectUnauthorized: true }; // verify the server certificate against that CA
  }
  return mysql.createPool({
    uri: parsed.toString(),
    connectionLimit: 10,
    waitForConnections: true,
    decimalNumbers: true, // SUM() etc. come back as numbers, not strings
    dateStrings: true,
    timezone: "Z",
    ...(ssl ? { ssl } : {}),
  });
}

// One pool and one migration run per server, reused across dev hot reloads.
const globalForDb = globalThis as unknown as { mysqlPool?: Pool; mysqlReady?: Promise<Pool> };

/** The pool, after pending migrations have run (once per process). */
function ready(): Promise<Pool> {
  globalForDb.mysqlReady ??= (async () => {
    const pool = (globalForDb.mysqlPool ??= createPool());
    const applied = await migrate(pool);
    if (applied.length) log.info("db_migrations_applied", { names: applied });
    return pool;
  })().catch((err) => {
    globalForDb.mysqlReady = undefined; // let the next request retry (e.g. MySQL was still starting)
    log.error("db_connect_failed", { code: (err as { code?: string })?.code, err });
    throw err;
  });
  return globalForDb.mysqlReady;
}

type Executor = Pool | PoolConnection;
type Param = string | number | null;

// Queries slower than this are logged (SQL text only, never the parameters).
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS) || 1000;
const sqlSnippet = (sql: string) => sql.replace(/\s+/g, " ").trim().slice(0, 200);

/** Run one statement, logging slow ones and failures (the SQL text, never the values). */
async function timed<R>(sql: string, params: Param[], ex?: Executor): Promise<R> {
  const executor = ex ?? (await ready());
  const started = performance.now();
  try {
    const [result] = await executor.query(sql, params);
    const ms = Math.round(performance.now() - started);
    if (ms > SLOW_QUERY_MS) log.warn("slow_query", { ms, sql: sqlSnippet(sql) });
    return result as R;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // A duplicate key is an expected outcome callers handle (isDuplicate), not a failure.
    if (code !== "ER_DUP_ENTRY") log.error("db_query_failed", { code, sql: sqlSnippet(sql), err });
    throw err;
  }
}

async function query<T>(sql: string, params: Param[] = [], ex?: Executor): Promise<T[]> {
  return timed<T[]>(sql, params, ex);
}

async function one<T>(sql: string, params: Param[] = [], ex?: Executor): Promise<T | null> {
  return (await query<T>(sql, params, ex))[0] ?? null;
}

async function exec(sql: string, params: Param[] = [], ex?: Executor): Promise<ResultSetHeader> {
  return timed<ResultSetHeader>(sql, params, ex);
}

/** Health check: SELECT 1 within `timeoutMs` (includes connecting and pending migrations). */
export async function pingDb(timeoutMs: number): Promise<{ ok: true; ms: number } | { ok: false; ms: number; code: string }> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("Database ping timed out"), { code: "PING_TIMEOUT" })), timeoutMs);
  });
  try {
    await Promise.race([query("SELECT 1"), timeout]);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - started), code: String((err as { code?: string })?.code ?? "UNKNOWN") };
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` on one connection inside BEGIN/COMMIT; ROLLBACK and rethrow on any error. */
async function transaction<T>(fn: (tx: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await (await ready()).getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const isDuplicate = (err: unknown) => (err as { code?: string })?.code === "ER_DUP_ENTRY";

// ---------------------------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------------------------

interface Row {
  id: number;
  date: string;
  meal: string;
  food_id: string;
  name: string;
  serving_size: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
}

function toEntry(r: Row): LogEntry {
  return {
    id: r.id,
    date: r.date,
    meal: isMeal(r.meal) ? r.meal : "snack",
    foodId: r.food_id,
    name: r.name,
    servingSize: r.serving_size,
    servings: r.servings,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    createdAt: r.created_at,
  };
}

export async function listEntries(userId: number, date: string): Promise<LogEntry[]> {
  const rows = await query<Row>("SELECT * FROM log_entries WHERE user_id = ? AND date = ? ORDER BY created_at, id", [userId, date]);
  return rows.map(toEntry);
}

const INSERT_ENTRY = `INSERT INTO log_entries
    (user_id, date, meal, food_id, name, serving_size, servings, calories, protein, carbs, fat, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function entryById(id: number, ex?: Executor): Promise<LogEntry> {
  return toEntry((await one<Row>("SELECT * FROM log_entries WHERE id = ?", [id], ex))!);
}

export async function addEntry(userId: number, food: Food, servings: number, date: string, meal: Meal): Promise<LogEntry> {
  const { insertId } = await exec(INSERT_ENTRY, [
    userId,
    date,
    meal,
    food.id,
    food.name,
    food.servingSize,
    servings,
    food.calories * servings,
    food.protein * servings,
    food.carbs * servings,
    food.fat * servings,
    new Date().toISOString(),
  ]);
  return entryById(insertId);
}

/**
 * Log AI-estimated items (not in the catalogue) in one transaction.
 * Stored with food_id `ai:<source>`; servings is always 1 and the portion goes in serving_size.
 */
export async function addCustomEntries(userId: number, items: NutritionItem[], source: AiSource, date: string, meal: Meal): Promise<LogEntry[]> {
  const now = new Date().toISOString();
  return transaction(async (tx) => {
    const out: LogEntry[] = [];
    for (const i of items) {
      const { insertId } = await exec(
        INSERT_ENTRY,
        [userId, date, meal, `ai:${source}`, i.name, i.portion || "1 serving", 1, i.calories, i.protein, i.carbs, i.fat, now],
        tx,
      );
      out.push(await entryById(insertId, tx));
    }
    return out;
  });
}

/** Whether the user has ever logged food (the add panel then opens on Recent). */
export async function hasLoggedFood(userId: number): Promise<boolean> {
  return Boolean(await one("SELECT 1 AS x FROM log_entries WHERE user_id = ? LIMIT 1", [userId]));
}

/** Change an entry's servings (every number rescales in proportion) and/or meal. Null if not theirs. */
export async function updateEntry(userId: number, id: number, change: { servings?: number; meal?: Meal }): Promise<LogEntry | null> {
  return transaction(async (tx) => {
    const row = await one<Row>("SELECT * FROM log_entries WHERE id = ? AND user_id = ? FOR UPDATE", [id, userId], tx);
    if (!row) return null;
    const k = change.servings === undefined ? 1 : change.servings / row.servings;
    await exec(
      "UPDATE log_entries SET servings = ?, calories = ?, protein = ?, carbs = ?, fat = ?, meal = ? WHERE id = ?",
      [row.servings * k, row.calories * k, row.protein * k, row.carbs * k, row.fat * k, change.meal ?? row.meal, id],
      tx,
    );
    return entryById(id, tx);
  });
}

/** One source for "add again": a past entry or a favourite, at `servings` (default: as before / 1). */
export type RepeatItem = { entryId: number; servings?: number } | { favoriteId: number; servings?: number };

/**
 * Copy past entries or favourites into a day and meal, in one transaction. Nutrition comes from the
 * stored rows (per serving x servings), never from the client. Null if any source isn't the user's.
 */
export async function repeatEntries(userId: number, items: RepeatItem[], date: string, meal: Meal): Promise<LogEntry[] | null> {
  const now = new Date().toISOString();
  type Source = Pick<Row, "food_id" | "name" | "serving_size" | "servings" | "calories" | "protein" | "carbs" | "fat">;
  return transaction(async (tx) => {
    // Look every source up first, so one that isn't theirs means nothing is added.
    const sources: Source[] = [];
    for (const item of items) {
      let src: Source | null;
      if ("entryId" in item) {
        src = await one<Row>("SELECT * FROM log_entries WHERE id = ? AND user_id = ?", [item.entryId, userId], tx);
      } else {
        const f = await one<FavoriteRow>("SELECT * FROM favorite_foods WHERE id = ? AND user_id = ?", [item.favoriteId, userId], tx);
        src = f && { ...f, servings: 1 };
      }
      if (!src) return null;
      sources.push(src);
    }
    const out: LogEntry[] = [];
    for (const [i, item] of items.entries()) {
      const src = sources[i];
      const servings = item.servings ?? src.servings;
      const per = (v: number) => (v / src.servings) * servings;
      const { insertId } = await exec(
        INSERT_ENTRY,
        [userId, date, meal, src.food_id, src.name, src.serving_size, servings, per(src.calories), per(src.protein), per(src.carbs), per(src.fat), now],
        tx,
      );
      out.push(await entryById(insertId, tx));
    }
    return out;
  });
}

/** The user's recent distinct foods (newest first), one serving each, with how they usually log it. */
export async function recentFoods(userId: number, since: string, limit: number): Promise<RecentFood[]> {
  const rows = await query<Row & { food_key: string; uses: number; favorite_id: number | null }>(
    `SELECT r.*, f.id AS favorite_id FROM (
       SELECT k.*, ROW_NUMBER() OVER (PARTITION BY food_key ORDER BY created_at DESC, id DESC) AS rn,
              COUNT(*) OVER (PARTITION BY food_key) AS uses
       FROM (SELECT *, ${FOOD_KEY_SQL} AS food_key FROM log_entries WHERE user_id = ? AND date >= ?) k
     ) r
     LEFT JOIN favorite_foods f ON f.user_id = ? AND f.food_key = r.food_key
     WHERE r.rn = 1
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ?`,
    [userId, since, userId, limit],
  );
  return rows.map((r) => {
    const per = (v: number) => (r.servings > 0 ? v / r.servings : v);
    return {
      key: r.food_key,
      entryId: r.id,
      foodId: r.food_id,
      name: r.name,
      servingSize: r.serving_size,
      calories: per(r.calories),
      protein: per(r.protein),
      carbs: per(r.carbs),
      fat: per(r.fat),
      lastServings: r.servings,
      lastMeal: isMeal(r.meal) ? r.meal : "snack",
      lastDate: r.date,
      uses: Number(r.uses),
      favoriteId: r.favorite_id ?? null,
    };
  });
}

interface FavoriteRow {
  id: number;
  food_key: string;
  food_id: string;
  name: string;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const toFavorite = (f: FavoriteRow): FavoriteFood => ({
  id: f.id,
  key: f.food_key,
  foodId: f.food_id,
  name: f.name,
  servingSize: f.serving_size,
  calories: f.calories,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
});

export async function listFavorites(userId: number): Promise<FavoriteFood[]> {
  return (await query<FavoriteRow>("SELECT * FROM favorite_foods WHERE user_id = ? ORDER BY name", [userId])).map(toFavorite);
}

/** Star the food of one of the user's entries (one serving snapshotted). Starring twice is a no-op. */
export async function addFavorite(userId: number, entryId: number): Promise<FavoriteFood | null> {
  const e = await one<Row>("SELECT * FROM log_entries WHERE id = ? AND user_id = ?", [entryId, userId]);
  if (!e) return null;
  const key = foodKey(e.food_id, e.name, e.serving_size);
  const per = (v: number) => (e.servings > 0 ? v / e.servings : v);
  await exec(
    `INSERT INTO favorite_foods (user_id, food_key, food_id, name, serving_size, calories, protein, carbs, fat, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
    [userId, key, e.food_id, e.name, e.serving_size, per(e.calories), per(e.protein), per(e.carbs), per(e.fat), new Date().toISOString()],
  );
  const f = await one<FavoriteRow>("SELECT * FROM favorite_foods WHERE user_id = ? AND food_key = ?", [userId, key]);
  return f && toFavorite(f);
}

export async function removeFavorite(userId: number, id: number): Promise<boolean> {
  return (await exec("DELETE FROM favorite_foods WHERE id = ? AND user_id = ?", [id, userId])).affectedRows > 0;
}

/** Deletes only if the entry belongs to this user, so ids from other accounts look like "not found". */
export async function deleteEntry(userId: number, id: number): Promise<boolean> {
  return (await exec("DELETE FROM log_entries WHERE id = ? AND user_id = ?", [id, userId])).affectedRows > 0;
}

// ---------------------------------------------------------------------------------------------
// Users and settings
// ---------------------------------------------------------------------------------------------

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  calorie_goal: number;
  weight_kg: number | null;
  height_cm: number | null;
  steps_target: number | null;
  water_target_ml: number | null;
  birth_year: number | null;
  sex: string | null;
  activity: string | null;
  goal_weight_kg: number | null;
  weekly_change_kg: number | null;
  sleep_target_min: number | null;
  address: string | null;
  email_verified_at: string | null;
  pending_email: string | null;
  created_at: string;
}

function parseAddress(raw: string | null): Address | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    const f = (k: string) => (typeof a?.[k] === "string" ? a[k] : "");
    return { line1: f("line1"), line2: f("line2"), city: f("city"), region: f("region"), postalCode: f("postalCode"), country: f("country") };
  } catch {
    return null;
  }
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    weightKg: r.weight_kg ?? null,
    heightCm: r.height_cm ?? null,
    stepsTarget: r.steps_target ?? null,
    waterTargetMl: r.water_target_ml ?? null,
    birthYear: r.birth_year ?? null,
    sex: isSex(r.sex) ? r.sex : null,
    activity: isActivity(r.activity) ? r.activity : null,
    goalWeightKg: r.goal_weight_kg ?? null,
    weeklyChangeKg: r.weekly_change_kg ?? null,
    sleepTargetMin: r.sleep_target_min ?? null,
    address: parseAddress(r.address ?? null),
    emailVerified: Boolean(r.email_verified_at),
    pendingEmail: r.pending_email ?? null,
    createdAt: r.created_at,
  };
}

async function userById(id: number, ex?: Executor): Promise<User | null> {
  const row = await one<UserRow>("SELECT * FROM users WHERE id = ?", [id], ex);
  return row ? toUser(row) : null;
}

/** Create an account. Returns null if the email is already registered. */
export async function createUser(email: string, name: string, passwordHash: string): Promise<User | null> {
  try {
    const { insertId } = await exec("INSERT INTO users (email, name, password_hash, calorie_goal, created_at) VALUES (?, ?, ?, ?, ?)", [
      email,
      name,
      passwordHash,
      DEFAULT_SETTINGS.calorieGoal,
      new Date().toISOString(),
    ]);
    return userById(insertId);
  } catch (err) {
    if (isDuplicate(err)) return null; // the UNIQUE email index decides, so two sign-ups can't race
    throw err;
  }
}

/** For sign-in: the user plus their password hash. */
export async function findUserForLogin(email: string): Promise<{ user: User; passwordHash: string } | null> {
  const row = await one<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
  return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
}

export async function getPasswordHash(userId: number): Promise<string | null> {
  return (await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [userId]))?.password_hash ?? null;
}

export async function isEmailTaken(email: string, exceptUserId: number): Promise<boolean> {
  return Boolean(await one("SELECT 1 FROM users WHERE email = ? AND id != ?", [email, exceptUserId]));
}

/** Name and weight change at once; a new email goes through `setPendingEmail` + verification. */
export async function updateProfile(userId: number, name: string, weightKg: number | null): Promise<User | null> {
  await exec("UPDATE users SET name = ?, weight_kg = ? WHERE id = ?", [name, weightKg, userId]);
  return userById(userId);
}

/** Start (or cancel, with null) an email change. Cancelling also voids its outstanding links. */
export async function setPendingEmail(userId: number, email: string | null): Promise<User | null> {
  return transaction(async (tx) => {
    await exec("UPDATE users SET pending_email = ? WHERE id = ?", [email, userId], tx);
    await exec("DELETE FROM email_verifications WHERE user_id = ? AND email != (SELECT email FROM users WHERE id = ?)", [userId, userId], tx);
    return userById(userId, tx);
  });
}

export async function findUserIdByEmail(email: string): Promise<number | null> {
  return (await one<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]))?.id ?? null;
}

export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  await exec("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
}

export async function getSettings(userId: number): Promise<Settings> {
  const goal = Number((await one<{ calorie_goal: number }>("SELECT calorie_goal FROM users WHERE id = ?", [userId]))?.calorie_goal);
  return { calorieGoal: Number.isFinite(goal) && goal > 0 ? goal : DEFAULT_SETTINGS.calorieGoal };
}

export async function saveSettings(userId: number, settings: Settings): Promise<Settings> {
  await exec("UPDATE users SET calorie_goal = ? WHERE id = ?", [settings.calorieGoal, userId]);
  return getSettings(userId);
}

// ---------------------------------------------------------------------------------------------
// Sessions (only a SHA-256 hash of the cookie token is stored)
// ---------------------------------------------------------------------------------------------

export async function insertSession(tokenHash: string, userId: number, expiresAt: Date, remember: boolean): Promise<void> {
  const now = new Date().toISOString();
  // Tidy up while we're here: expired sessions are never valid again.
  await exec("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  await exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, remember) VALUES (?, ?, ?, ?, ?)", [
    tokenHash,
    userId,
    now,
    expiresAt.toISOString(),
    remember ? 1 : 0,
  ]);
}

/** The live session for a token: its user, whether it's remembered, and when it expires. */
export async function findSession(tokenHash: string): Promise<{ user: User; remember: boolean; expiresAt: Date } | null> {
  const row = await one<UserRow & { s_remember: number; s_expires: string }>(
    `SELECT users.*, sessions.remember AS s_remember, sessions.expires_at AS s_expires FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    [tokenHash, new Date().toISOString()],
  );
  return row ? { user: toUser(row), remember: Number(row.s_remember) === 1, expiresAt: new Date(row.s_expires) } : null;
}

export async function extendSession(tokenHash: string, expiresAt: Date): Promise<void> {
  await exec("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", [expiresAt.toISOString(), tokenHash]);
}

export async function findSessionUser(tokenHash: string): Promise<User | null> {
  const row = await one<UserRow>(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    [tokenHash, new Date().toISOString()],
  );
  return row ? toUser(row) : null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await exec("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

/** Sign out every other device, e.g. after a password change. */
export async function deleteOtherSessions(userId: number, keepTokenHash: string): Promise<void> {
  await exec("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", [userId, keepTokenHash]);
}

/** Sign out every device, e.g. after a password reset. */
export async function deleteAllSessions(userId: number): Promise<void> {
  await exec("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

// ---------------------------------------------------------------------------------------------
// Password resets (only a SHA-256 hash of the emailed token is stored; single use)
// ---------------------------------------------------------------------------------------------

/** Replace any outstanding reset links for this user with a new one. */
export async function insertPasswordReset(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
  const now = new Date().toISOString();
  await transaction(async (tx) => {
    await exec("DELETE FROM password_resets WHERE user_id = ? OR expires_at <= ?", [userId, now], tx);
    await exec("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [tokenHash, userId, now, expiresAt.toISOString()], tx);
  });
}

export type ResetLookup = { status: "valid"; userId: number } | { status: "expired" | "used" | "invalid" };

type ResetRow = { user_id: number; expires_at: string; used_at: string | null };

function resetStatus(row: ResetRow | null): ResetLookup {
  if (!row) return { status: "invalid" };
  if (row.used_at) return { status: "used" };
  if (row.expires_at <= new Date().toISOString()) return { status: "expired" };
  return { status: "valid", userId: row.user_id };
}

export async function findPasswordReset(tokenHash: string): Promise<ResetLookup> {
  return resetStatus(await one<ResetRow>("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?", [tokenHash]));
}

/**
 * Set the new password, burn the token and sign out every device, all at once. The token row is
 * locked and re-checked inside the transaction, so two submits of the same link can't both win.
 * Returns false if the link stopped being valid in the meantime.
 */
export async function completePasswordReset(tokenHash: string, userId: number, passwordHash: string): Promise<boolean> {
  return transaction(async (tx) => {
    const lookup = resetStatus(await one<ResetRow>("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ? FOR UPDATE", [tokenHash], tx));
    if (lookup.status !== "valid" || lookup.userId !== userId) return false;
    const now = new Date().toISOString();
    // The reset link went to this inbox, so it also proves the email address.
    await exec("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [passwordHash, now, userId], tx);
    await exec("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", [now, tokenHash], tx);
    await exec("DELETE FROM sessions WHERE user_id = ?", [userId], tx);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Exercise entries
// ---------------------------------------------------------------------------------------------

interface ExerciseRow {
  id: number;
  date: string;
  source: string;
  name: string;
  category: string;
  intensity: string;
  minutes: number;
  met: number;
  calories: number;
  created_at: string;
}

function toExercise(r: ExerciseRow): ExerciseEntry {
  return {
    id: r.id,
    date: r.date,
    source: r.source,
    name: r.name,
    category: isCategory(r.category) ? r.category : "cardio",
    intensity: isIntensity(r.intensity) ? r.intensity : "moderate",
    minutes: r.minutes,
    met: r.met,
    calories: r.calories,
    createdAt: r.created_at,
  };
}

export async function listExercise(userId: number, date: string): Promise<ExerciseEntry[]> {
  const rows = await query<ExerciseRow>("SELECT * FROM exercise_entries WHERE user_id = ? AND date = ? ORDER BY created_at, id", [userId, date]);
  return rows.map(toExercise);
}

/** Per-day totals for an inclusive date range (days with nothing logged are omitted). */
export async function exerciseTotalsByDay(userId: number, from: string, to: string): Promise<ExerciseDay[]> {
  return query<ExerciseDay>(
    `SELECT date, SUM(minutes) AS minutes, SUM(calories) AS calories FROM exercise_entries
     WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
    [userId, from, to],
  );
}

export interface NewExercise {
  source: string;
  name: string;
  category: ExerciseCategory;
  intensity: Intensity;
  minutes: number;
  met: number;
  calories: number;
}

/** Insert one or more sessions in a single transaction. */
export async function addExercises(userId: number, date: string, items: NewExercise[]): Promise<ExerciseEntry[]> {
  const now = new Date().toISOString();
  return transaction(async (tx) => {
    const out: ExerciseEntry[] = [];
    for (const i of items) {
      const { insertId } = await exec(
        `INSERT INTO exercise_entries (user_id, date, source, name, category, intensity, minutes, met, calories, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, date, i.source, i.name, i.category, i.intensity, i.minutes, i.met, i.calories, now],
        tx,
      );
      out.push(toExercise((await one<ExerciseRow>("SELECT * FROM exercise_entries WHERE id = ?", [insertId], tx))!));
    }
    return out;
  });
}

export async function deleteExercise(userId: number, id: number): Promise<boolean> {
  return (await exec("DELETE FROM exercise_entries WHERE id = ? AND user_id = ?", [id, userId])).affectedRows > 0;
}

// ---------------------------------------------------------------------------------------------
// Body & goals, address, steps, water
// ---------------------------------------------------------------------------------------------

export interface BodyGoals {
  calorieGoal: number;
  heightCm: number | null;
  weightKg: number | null;
  stepsTarget: number | null;
  waterTargetMl: number | null;
  birthYear: number | null;
  sex: User["sex"];
  activity: User["activity"];
  goalWeightKg: number | null;
  weeklyChangeKg: number | null;
  sleepTargetMin: number | null;
}

/** Save body and goals. A changed weight is also logged as today's weigh-in (`today`, the user's day). */
export async function updateBodyGoals(userId: number, b: BodyGoals, today: string): Promise<User | null> {
  const before = await userById(userId);
  await exec(
    `UPDATE users SET calorie_goal = ?, height_cm = ?, weight_kg = ?, steps_target = ?, water_target_ml = ?,
       birth_year = ?, sex = ?, activity = ?, goal_weight_kg = ?, weekly_change_kg = ?, sleep_target_min = ? WHERE id = ?`,
    [b.calorieGoal, b.heightCm, b.weightKg, b.stepsTarget, b.waterTargetMl, b.birthYear, b.sex, b.activity, b.goalWeightKg, b.weeklyChangeKg, b.sleepTargetMin, userId],
  );
  if (b.weightKg !== null && b.weightKg !== before?.weightKg) await logWeight(userId, today, b.weightKg);
  return userById(userId);
}

// ---------------------------------------------------------------------------------------------
// Weigh-ins (one per day). The newest one is also the user's current weight (users.weight_kg),
// which exercise calories use.
// ---------------------------------------------------------------------------------------------

export async function listWeights(userId: number, from: string, to: string): Promise<WeighIn[]> {
  const rows = await query<{ date: string; weight_kg: number }>(
    "SELECT date, weight_kg FROM weight_entries WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date",
    [userId, from, to],
  );
  return rows.map((r) => ({ date: r.date, kg: r.weight_kg }));
}

/** The weigh-in just before `date` (to start the trend from), if any. */
export async function weightBefore(userId: number, date: string): Promise<WeighIn | null> {
  const r = await one<{ date: string; weight_kg: number }>(
    "SELECT date, weight_kg FROM weight_entries WHERE user_id = ? AND date < ? ORDER BY date DESC LIMIT 1",
    [userId, date],
  );
  return r && { date: r.date, kg: r.weight_kg };
}

/** Log (or replace) a day's weigh-in; if it's the newest, it becomes the current weight. */
export async function logWeight(userId: number, date: string, kg: number): Promise<void> {
  await transaction(async (tx) => {
    await exec(
      `INSERT INTO weight_entries (user_id, date, weight_kg, created_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE weight_kg = VALUES(weight_kg)`,
      [userId, date, kg, new Date().toISOString()],
      tx,
    );
    await syncCurrentWeight(userId, tx);
  });
}

export async function deleteWeight(userId: number, date: string): Promise<boolean> {
  return transaction(async (tx) => {
    const { affectedRows } = await exec("DELETE FROM weight_entries WHERE user_id = ? AND date = ?", [userId, date], tx);
    if (affectedRows) await syncCurrentWeight(userId, tx);
    return affectedRows > 0;
  });
}

/** users.weight_kg follows the newest weigh-in (unchanged when there are none). */
async function syncCurrentWeight(userId: number, tx: Executor): Promise<void> {
  const newest = await one<{ weight_kg: number }>("SELECT weight_kg FROM weight_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1", [userId], tx);
  if (newest) await exec("UPDATE users SET weight_kg = ? WHERE id = ?", [newest.weight_kg, userId], tx);
}

export async function updateAddress(userId: number, address: Address | null): Promise<User | null> {
  await exec("UPDATE users SET address = ? WHERE id = ?", [address ? JSON.stringify(address) : null, userId]);
  return userById(userId);
}

export async function getSteps(userId: number, date: string): Promise<number | null> {
  return (await one<{ steps: number }>("SELECT steps FROM daily_steps WHERE user_id = ? AND date = ?", [userId, date]))?.steps ?? null;
}

/** Set a day's step count, or clear it with null. */
export async function setSteps(userId: number, date: string, steps: number | null): Promise<void> {
  if (steps === null) {
    await exec("DELETE FROM daily_steps WHERE user_id = ? AND date = ?", [userId, date]);
    return;
  }
  await exec(
    `INSERT INTO daily_steps (user_id, date, steps, updated_at) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE steps = VALUES(steps), updated_at = VALUES(updated_at)`,
    [userId, date, steps, new Date().toISOString()],
  );
}

export async function getWater(userId: number, date: string): Promise<number | null> {
  return (await one<{ ml: number }>("SELECT ml FROM daily_water WHERE user_id = ? AND date = ?", [userId, date]))?.ml ?? null;
}

/**
 * Add (or, for undo, subtract) millilitres to a day's total in one statement, so quick taps sent
 * at the same moment all count. The total stays within 0..DAILY_WATER_MAX. Returns the new total.
 */
export async function addWater(userId: number, date: string, deltaMl: number): Promise<number> {
  const now = new Date().toISOString();
  await exec(
    `INSERT INTO daily_water (user_id, date, ml, updated_at) VALUES (?, ?, LEAST(GREATEST(?, 0), ?), ?)
     ON DUPLICATE KEY UPDATE ml = LEAST(GREATEST(CAST(ml AS SIGNED) + ?, 0), ?), updated_at = VALUES(updated_at)`,
    [userId, date, deltaMl, DAILY_WATER_MAX, now, deltaMl, DAILY_WATER_MAX],
  );
  return (await getWater(userId, date)) ?? 0;
}

/** Set a day's water total exactly, or clear it with null. */
export async function setWater(userId: number, date: string, ml: number | null): Promise<void> {
  if (ml === null) {
    await exec("DELETE FROM daily_water WHERE user_id = ? AND date = ?", [userId, date]);
    return;
  }
  await exec(
    `INSERT INTO daily_water (user_id, date, ml, updated_at) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE ml = VALUES(ml), updated_at = VALUES(updated_at)`,
    [userId, date, ml, new Date().toISOString()],
  );
}

export interface SleepEntry {
  bed: string; // "HH:MM"
  wake: string;
  minutes: number;
  quality: number | null; // 1-5
}

/** The night that ended on `date` (the day the user woke up), if logged. */
export async function getSleep(userId: number, date: string): Promise<SleepEntry | null> {
  const r = await one<{ bed_time: string; wake_time: string; minutes: number; quality: number | null }>(
    "SELECT bed_time, wake_time, minutes, quality FROM daily_sleep WHERE user_id = ? AND date = ?",
    [userId, date],
  );
  return r && { bed: r.bed_time, wake: r.wake_time, minutes: r.minutes, quality: r.quality ?? null };
}

/** Save (or replace) a night, or clear it with null. Minutes are computed by the caller (lib/sleep.ts). */
export async function setSleep(userId: number, date: string, night: SleepEntry | null): Promise<void> {
  if (night === null) {
    await exec("DELETE FROM daily_sleep WHERE user_id = ? AND date = ?", [userId, date]);
    return;
  }
  await exec(
    `INSERT INTO daily_sleep (user_id, date, bed_time, wake_time, minutes, quality, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE bed_time = VALUES(bed_time), wake_time = VALUES(wake_time), minutes = VALUES(minutes),
       quality = VALUES(quality), updated_at = VALUES(updated_at)`,
    [userId, date, night.bed, night.wake, night.minutes, night.quality, new Date().toISOString()],
  );
}

// ---------------------------------------------------------------------------------------------
// History: per-day totals across food, exercise, steps and water, for the dashboard
// ---------------------------------------------------------------------------------------------

export type DayTotals = Omit<HistoryBucket, "start" | "end" | "days" | "daysOnTarget">;

/** Totals for every day in [from, to] that has anything logged, keyed by date. */
export async function dailyTotals(userId: number, from: string, to: string): Promise<Map<string, DayTotals>> {
  const out = new Map<string, DayTotals>();
  const day = (date: string) => {
    let d = out.get(date);
    if (!d) {
      d = { foodDays: 0, eaten: 0, protein: 0, carbs: 0, fat: 0, burned: 0, minutes: 0, steps: 0, stepDays: 0, water: 0, waterDays: 0, sleep: 0, sleepDays: 0 };
      out.set(date, d);
    }
    return d;
  };
  const [food, ex, steps, water, sleep] = await Promise.all([
    query<{ date: string; c: number; p: number; cb: number; f: number }>(
      `SELECT date, SUM(calories) c, SUM(protein) p, SUM(carbs) cb, SUM(fat) f FROM log_entries
       WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date`,
      [userId, from, to],
    ),
    query<{ date: string; c: number; m: number }>(
      `SELECT date, SUM(calories) c, SUM(minutes) m FROM exercise_entries
       WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date`,
      [userId, from, to],
    ),
    query<{ date: string; steps: number }>("SELECT date, steps FROM daily_steps WHERE user_id = ? AND date BETWEEN ? AND ?", [userId, from, to]),
    query<{ date: string; ml: number }>("SELECT date, ml FROM daily_water WHERE user_id = ? AND date BETWEEN ? AND ? AND ml > 0", [userId, from, to]),
    query<{ date: string; minutes: number }>("SELECT date, minutes FROM daily_sleep WHERE user_id = ? AND date BETWEEN ? AND ?", [userId, from, to]),
  ]);
  for (const r of food) Object.assign(day(r.date), { foodDays: 1, eaten: r.c, protein: r.p, carbs: r.cb, fat: r.f });
  for (const r of ex) Object.assign(day(r.date), { burned: r.c, minutes: r.m });
  for (const r of steps) Object.assign(day(r.date), { steps: r.steps, stepDays: 1 });
  for (const r of water) Object.assign(day(r.date), { water: r.ml, waterDays: 1 });
  for (const r of sleep) Object.assign(day(r.date), { sleep: r.minutes, sleepDays: 1 });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Email verification (only a SHA-256 hash of the emailed token is stored; single use, 24 hours)
// ---------------------------------------------------------------------------------------------

/** A new link for `email` (the sign-in email or a pending one) replaces that address's older links. */
export async function insertEmailVerification(tokenHash: string, userId: number, email: string, expiresAt: Date): Promise<void> {
  const now = new Date().toISOString();
  await transaction(async (tx) => {
    await exec("DELETE FROM email_verifications WHERE (user_id = ? AND email = ?) OR expires_at <= ?", [userId, email, now], tx);
    await exec("INSERT INTO email_verifications (token_hash, user_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", [
      tokenHash,
      userId,
      email,
      now,
      expiresAt.toISOString(),
    ], tx);
  });
}

export type VerifyResult =
  | { status: "verified" | "changed"; user: User; previousEmail: string }
  | { status: "expired" | "used" | "invalid" | "taken" };

/**
 * Confirm a link. For the sign-in email it marks it verified; for a pending email it becomes the
 * sign-in email (unless another account took it meanwhile). One transaction with the token row
 * locked (FOR UPDATE), so opening the same link twice at once gives one success and one "used".
 */
export async function completeEmailVerification(tokenHash: string): Promise<VerifyResult> {
  return transaction(async (tx): Promise<VerifyResult> => {
    const v = await one<{ user_id: number; email: string; expires_at: string; used_at: string | null }>(
      "SELECT user_id, email, expires_at, used_at FROM email_verifications WHERE token_hash = ? FOR UPDATE",
      [tokenHash],
      tx,
    );
    if (!v) return { status: "invalid" };
    if (v.used_at) return { status: "used" };
    const now = new Date().toISOString();
    if (v.expires_at <= now) return { status: "expired" };
    const u = await one<UserRow>("SELECT * FROM users WHERE id = ? FOR UPDATE", [v.user_id], tx);
    if (!u) return { status: "invalid" };

    let status: "verified" | "changed";
    if (v.email === u.email) {
      await exec("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [now, u.id], tx);
      status = "verified";
    } else if (v.email === u.pending_email) {
      if (await one("SELECT 1 FROM users WHERE email = ? AND id != ?", [v.email, u.id], tx)) return { status: "taken" };
      try {
        await exec("UPDATE users SET email = ?, pending_email = NULL, email_verified_at = ? WHERE id = ?", [v.email, now, u.id], tx);
      } catch (err) {
        if (isDuplicate(err)) return { status: "taken" }; // another account claimed it this instant
        throw err;
      }
      status = "changed";
    } else {
      return { status: "invalid" }; // a link for an email change that was cancelled or replaced
    }
    await exec("UPDATE email_verifications SET used_at = ? WHERE token_hash = ?", [now, tokenHash], tx);
    return { status, user: (await userById(u.id, tx))!, previousEmail: u.email };
  });
}
