import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const client = new Client({
  connectionString: databaseUrl,
  application_name: "abayflow-auth-rate-limit-cleanup",
  connectionTimeoutMillis: 5000
});
try {
  await client.connect();
  const result = await client.query(
    "DELETE FROM auth_rate_limit_events WHERE occurred_at < now() - interval '24 hours'"
  );
  console.log(JSON.stringify({ event: "auth_rate_limit_cleanup_finished", deleted: result.rowCount ?? 0 }));
} catch (error) {
  console.error("Rate-limit cleanup failed", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
