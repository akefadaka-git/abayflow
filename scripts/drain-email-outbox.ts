import { Pool } from "pg";
import { PostgreSqlEmailOutbox } from "../packages/identity/src/email-outbox.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({
  connectionString: databaseUrl,
  application_name: "abayflow-email-outbox-worker",
  connectionTimeoutMillis: 5000,
  max: 2
});
try {
  const result = await new PostgreSqlEmailOutbox(pool).drainBatch(20);
  console.log(JSON.stringify({ event: "email_outbox_batch_finished", sent: result.sent, failed: result.failed }));
  if (result.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error("Email outbox batch failed", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
} finally {
  await pool.end();
}
