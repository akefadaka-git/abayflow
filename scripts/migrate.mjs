import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required; no database connection was attempted.");
}

const migrationsDirectory = resolve(process.cwd(), "database/migrations");
const migrationNamePattern = /^\d{3,}_[a-z0-9_-]+\.sql$/;
const lockKey = "617961666c6f77"; // Stable advisory-lock key for AbayFlow migrations.

const client = new Client({
  connectionString: databaseUrl,
  application_name: "abayflow-migration-runner",
  connectionTimeoutMillis: 5_000
});

let connected = false;
let lockHeld = false;

try {
  await client.connect();
  connected = true;

  await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
  lockHeld = true;

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum_sha256 char(64) NOT NULL
        CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => migrationNamePattern.test(filename))
    .sort();

  if (filenames.length === 0) {
    throw new Error("No migration files matched the required numbered SQL filename pattern.");
  }

  for (const filename of filenames) {
    const sql = await readFile(join(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
    const existing = await client.query(
      "SELECT checksum_sha256 FROM schema_migrations WHERE filename = $1",
      [filename]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].checksum_sha256 !== checksum) {
        throw new Error(
          `Applied migration ${filename} has changed; refusing to continue. Create a new migration instead.`
        );
      }
      console.log(`Already applied: ${filename}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)",
        [filename, checksum]
      );
      await client.query("COMMIT");
      console.log(`Applied: ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error("Migration run failed. No success is implied for unapplied migrations.");
  console.error(error instanceof Error ? error.message : "Unknown migration error");
  process.exitCode = 1;
} finally {
  if (lockHeld) {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]);
    } catch {
      process.exitCode = 1;
    }
  }
  if (connected) {
    await client.end();
  }
}
