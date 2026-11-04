import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
export function createDatabase(databaseUrl) {
    return new Pool({ connectionString: databaseUrl, max: 5 });
}
export async function initializeDatabase(pool) {
    const schema = await readFile(resolve(process.cwd(), "sql/schema.sql"), "utf8");
    await pool.query(schema);
}
