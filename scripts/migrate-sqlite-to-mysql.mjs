// `npm run db:copy-from-sqlite`: one-time copy of data/calorie-tracker.db into MySQL (DATABASE_URL).
// 1. backs up the SQLite file  2. applies the MySQL schema  3. refuses if MySQL already has data
// (unless --force)  4. copies every table in foreign-key order with the same ids, in one transaction
// 5. resets AUTO_INCREMENT  6. checks row counts and per-user totals, rolling back on any mismatch.
// SQLite is opened read-only and left untouched.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import mysql from "mysql2/promise";
import { migrate } from "../lib/db-migrate.ts";

const SRC = path.join(process.cwd(), "data", "calorie-tracker.db");
const force = process.argv.includes("--force");
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set (add it to .env).");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error(`No SQLite database at ${SRC}: nothing to copy.`);
  process.exit(1);
}

const src = new DatabaseSync(SRC, { readOnly: true });
const pool = mysql.createPool({ uri: url, connectionLimit: 2, decimalNumbers: true });
const hasColumn = (table, col) => src.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
const hasTable = (table) => Boolean(src.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table));

// Tables in foreign-key order, with the columns the MySQL schema has (missing SQLite columns → defaults).
const TABLES = [
  ["users", ["id", "email", "name", "password_hash", "calorie_goal", "weight_kg", "height_cm", "steps_target", "address", "email_verified_at", "pending_email", "created_at"]],
  ["sessions", ["token_hash", "user_id", "created_at", "expires_at", "remember"]],
  ["password_resets", ["token_hash", "user_id", "created_at", "expires_at", "used_at"]],
  ["email_verifications", ["token_hash", "user_id", "email", "created_at", "expires_at", "used_at"]],
  ["log_entries", ["id", "user_id", "date", "meal", "food_id", "name", "serving_size", "servings", "calories", "protein", "carbs", "fat", "created_at"]],
  ["exercise_entries", ["id", "user_id", "date", "source", "name", "category", "intensity", "minutes", "met", "calories", "created_at"]],
  ["daily_steps", ["user_id", "date", "steps", "updated_at"]],
];

const conn = await pool.getConnection();
try {
  // 2. Schema
  const applied = await migrate(pool);
  if (applied.length) console.log(`Applied MySQL migrations: ${applied.join(", ")}`);

  // 3. Refuse to double-copy
  for (const [t] of TABLES) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    if (n > 0 && !force) {
      throw new Error(`MySQL table ${t} already has ${n} rows. Nothing was copied. Re-run with --force to replace the MySQL data.`);
    }
  }

  // Entries without an owner (pre-accounts data) can't be copied: MySQL requires user_id.
  if (hasTable("log_entries") && hasColumn("log_entries", "user_id")) {
    const orphans = src.prepare("SELECT COUNT(*) n FROM log_entries WHERE user_id IS NULL").get().n;
    if (orphans) throw new Error(`${orphans} food entries in SQLite have no owner. Sign in once with the old app so the first account adopts them, then retry.`);
  }

  // 1. Backup (only once we know we're going to copy)
  const backup = path.join(path.dirname(SRC), `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`);
  fs.copyFileSync(SRC, backup);
  console.log(`Backed up SQLite to ${backup}`);

  await conn.beginTransaction();
  if (force) for (const [t] of [...TABLES].reverse()) await conn.query(`DELETE FROM \`${t}\``);

  // 4. Copy
  const report = [];
  for (const [table, cols] of TABLES) {
    if (!hasTable(table)) {
      report.push([table, 0, 0]);
      continue;
    }
    const present = cols.filter((c) => hasColumn(table, c));
    const rows = src.prepare(`SELECT ${present.join(", ")} FROM ${table}`).all();
    for (const r of rows) {
      await conn.query(`INSERT INTO \`${table}\` (${present.map((c) => `\`${c}\``).join(", ")}) VALUES (${present.map(() => "?").join(", ")})`, present.map((c) => r[c]));
    }
    // 5. Next ids continue after the copied ones
    if (cols.includes("id") && rows.length) {
      const max = Math.max(...rows.map((r) => Number(r.id)));
      await conn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ${max + 1}`);
    }
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    report.push([table, rows.length, n]);
  }

  // 6. Checks: counts, plus per-user totals of calories eaten, calories burned and minutes
  let ok = report.every(([, a, b]) => a === b);
  const totals = (db, sql) => new Map(db.map((r) => [Number(r.u), Math.round(Number(r.t) * 1000) / 1000]));
  const checks = [
    ["kcal eaten", "SELECT user_id u, SUM(calories) t FROM log_entries GROUP BY user_id"],
    ["kcal burned", "SELECT user_id u, SUM(calories) t FROM exercise_entries GROUP BY user_id"],
    ["active minutes", "SELECT user_id u, SUM(minutes) t FROM exercise_entries GROUP BY user_id"],
  ];
  const totalReport = [];
  for (const [label, sql] of checks) {
    const table = sql.match(/FROM (\w+)/)[1];
    const a = hasTable(table) ? totals(src.prepare(sql).all(), sql) : new Map();
    const [rowsB] = await conn.query(sql);
    const b = totals(rowsB, sql);
    const same = a.size === b.size && [...a].every(([u, t]) => b.get(u) === t);
    ok &&= same;
    totalReport.push(`${same ? "PASS" : "FAIL"}  per-user ${label}: ${[...a].map(([u, t]) => `user ${u} ${t}`).join(", ") || "none"}`);
  }

  console.log("\nTable                 SQLite  MySQL");
  for (const [t, a, b] of report) console.log(`${a === b ? "PASS" : "FAIL"}  ${t.padEnd(20)} ${String(a).padStart(5)}  ${String(b).padStart(5)}`);
  for (const line of totalReport) console.log(line);
  if (hasTable("settings")) {
    const legacy = src.prepare("SELECT key, value FROM settings").all();
    if (legacy.length) console.log(`\nNot copied (legacy, pre-accounts): settings ${JSON.stringify(legacy)}`);
  }

  if (!ok) throw new Error("Checks failed: the MySQL copy was rolled back. SQLite is unchanged.");
  await conn.commit();
  console.log("\nCopy complete. SQLite was not modified; the backup above is your rollback.");
} catch (err) {
  try {
    await conn.rollback();
  } catch {
    // nothing to roll back
  }
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
  src.close();
}
