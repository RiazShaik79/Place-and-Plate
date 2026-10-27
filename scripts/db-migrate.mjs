// `npm run db:migrate`: apply pending db/migrations/*.sql to the database in DATABASE_URL.
// The app also does this on its first query; this lets you do it (and see the result) up front.
import mysql from "mysql2/promise";
import { migrate } from "../lib/db-migrate.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set (add it to .env).");
  process.exit(1);
}
const pool = mysql.createPool({ uri: url, connectionLimit: 2 });
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
