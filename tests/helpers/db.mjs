// Direct database access for tests that set up state the API can't (expired links, other users' rows).
// db.prepare(sql).get/all/run, async, one short-lived connection per call so nothing keeps the process alive.
import mysql from "mysql2/promise";

async function run(sql, params) {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, decimalNumbers: true, dateStrings: true });
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

export const db = {
  prepare: (sql) => ({
    get: async (...p) => (await run(sql, p))[0],
    all: async (...p) => run(sql, p),
    run: async (...p) => run(sql, p),
  }),
};

/** Delete every test account (emails ending @example.com); their rows cascade. Returns how many. */
export async function deleteTestUsers() {
  return (await run("DELETE FROM users WHERE email LIKE '%@example.com'", [])).affectedRows;
}
