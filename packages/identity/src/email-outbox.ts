import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import type { Pool, PoolClient } from "pg";

interface MailPayload {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

function encryptionKey(): Buffer {
  const value = process.env.ABAYFLOW_OUTBOX_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("ABAYFLOW_OUTBOX_ENCRYPTION_KEY must be a 32-byte lowercase hex key");
  }
  return Buffer.from(value, "hex");
}

function encryptPayload(payload: MailPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptPayload(value: string): MailPayload {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted mail payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[0]!, "base64url"));
  decipher.setAuthTag(Buffer.from(parts[1]!, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64url")), decipher.final()]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" ||
      typeof (parsed as MailPayload).to !== "string" ||
      typeof (parsed as MailPayload).subject !== "string" ||
      typeof (parsed as MailPayload).text !== "string") throw new Error("Malformed decrypted mail payload");
  return parsed as MailPayload;
}

export class PostgreSqlEmailOutbox {
  constructor(private readonly pool: Pool, private readonly now: () => Date = () => new Date()) {}

  /** Enqueue encrypted payload in the same caller transaction as token issuance when needed. */
  async enqueue(client: PoolClient, payload: MailPayload): Promise<void> {
    if (!payload.to.includes("@") || payload.to.length > 254 ||
        payload.subject.length < 1 || payload.subject.length > 200 ||
        payload.text.length < 1 || payload.text.length > 20_000) {
      throw new Error("Email payload is outside the allowed bounds");
    }
    await client.query(
      `INSERT INTO email_outbox (id, payload_ciphertext, status, attempts, available_at, created_at)
       VALUES (gen_random_uuid(), $1, 'pending', 0, $2, $2)`,
      [encryptPayload(payload), this.now().toISOString()]
    );
  }

  /** Drain a bounded batch. Multiple workers safely claim distinct rows with SKIP LOCKED. */
  async drainBatch(batchSize = 20): Promise<{ sent: number; failed: number }> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("batchSize must be 1..100");
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM;
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
      throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured");
    }
    const secure = process.env.SMTP_SECURE === "true";
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
    const client = await this.pool.connect();
    let sent = 0, failed = 0;
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        `WITH candidates AS (
           SELECT id FROM email_outbox
            WHERE status IN ('pending', 'retry') AND available_at <= $1
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE email_outbox AS e
            SET status = 'sending', attempts = attempts + 1, locked_at = $1
           FROM candidates c WHERE e.id = c.id
         RETURNING e.id, e.payload_ciphertext, e.attempts`,
        [this.now().toISOString(), batchSize]
      );
      await client.query("COMMIT");

      for (const row of claimed.rows) {
        try {
          const payload = decryptPayload(String(row.payload_ciphertext));
          await transporter.sendMail({ from, to: payload.to, subject: payload.subject, text: payload.text });
          await this.pool.query(
            "UPDATE email_outbox SET status = 'sent', sent_at = $2, locked_at = NULL, last_error_code = NULL WHERE id = $1",
            [row.id, this.now().toISOString()]
          );
          sent++;
        } catch (error) {
          const attempts = Number(row.attempts);
          const exhausted = attempts >= 5;
          const delayMs = Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 12)));
          const errorCode = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
          await this.pool.query(
            `UPDATE email_outbox
                SET status = $2, available_at = $3, locked_at = NULL, last_error_code = $4
              WHERE id = $1`,
            [row.id, exhausted ? "dead" : "retry", new Date(this.now().getTime() + delayMs).toISOString(), errorCode]
          );
          failed++;
        }
      }
      return { sent, failed };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
      transporter.close();
    }
  }
}
