import { createHash } from "node:crypto";
import type { PostgreSqlClient, PostgreSqlPool } from "./postgresql-lifecycle.js";

export interface RateLimitRule {
  readonly dimension: "account_email" | "source_ip" | "token";
  readonly subject: string;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

function subjectHash(subject: string): string {
  return createHash("sha256").update(subject, "utf8").digest("hex");
}

/**
 * PostgreSQL-backed fixed-window event limiter. Each check serializes by
 * dimension+subject using transaction-scoped advisory locks, counts and records
 * in one transaction, so concurrent API instances share the same limit.
 * Use normalized email and a trusted proxy-derived client IP only.
 */
export class PostgreSqlRateLimiter {
  constructor(private readonly pool: PostgreSqlPool, private readonly now: () => Date = () => new Date()) {}

  async consume(rules: readonly RateLimitRule[]): Promise<RateLimitDecision> {
    if (rules.length === 0) return { allowed: true, retryAfterSeconds: 0 };
    for (const rule of rules) {
      if (!rule.subject || !Number.isSafeInteger(rule.limit) || rule.limit < 1 ||
          !Number.isSafeInteger(rule.windowMs) || rule.windowMs < 1) {
        throw new Error("Invalid rate-limit rule");
      }
    }
    const client = await this.pool.connect();
    const instant = this.now();
    if (!Number.isFinite(instant.getTime())) {
      client.release();
      throw new Error("Rate limiter clock returned an invalid date");
    }
    const now = instant.toISOString();
    const prepared = rules.map((rule) => ({ ...rule, hash: subjectHash(rule.subject) }))
      .sort((a, b) => a.dimension.localeCompare(b.dimension) || a.hash.localeCompare(b.hash));

    try {
      await client.query("BEGIN");
      for (const rule of prepared) {
        // Stable, deterministic advisory lock keys; only hashes enter the lock key.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [rule.dimension + ":" + rule.hash]
        );
      }

      let retryAfterSeconds = 0;
      const counts = new Map<string, number>();
      for (const rule of prepared) {
        const windowStart = new Date(instant.getTime() - rule.windowMs).toISOString();
        const count = await client.query(
          `SELECT count(*)::int AS count, min(occurred_at) AS oldest
             FROM auth_rate_limit_events
            WHERE dimension = $1 AND subject_hash = $2 AND occurred_at > $3`,
          [rule.dimension, rule.hash, windowStart]
        );
        const current = Number(count.rows[0]?.count ?? 0);
        counts.set(rule.dimension + ":" + rule.hash, current);
        if (current >= rule.limit) {
          const oldest = count.rows[0]?.oldest;
          const oldestMs = oldest instanceof Date ? oldest.getTime() : Date.parse(String(oldest));
          const remaining = Number.isFinite(oldestMs) ? Math.max(1, Math.ceil((oldestMs + rule.windowMs - instant.getTime()) / 1000)) : Math.ceil(rule.windowMs / 1000);
          retryAfterSeconds = Math.max(retryAfterSeconds, remaining);
        }
      }

      // Consume each still-available dimension even if another dimension is
      // exhausted, so rotating email addresses cannot bypass the source-IP cap.
      for (const rule of prepared) {
        if ((counts.get(rule.dimension + ":" + rule.hash) ?? rule.limit) < rule.limit) {
          await client.query(
            "INSERT INTO auth_rate_limit_events (id, dimension, subject_hash, occurred_at) VALUES (gen_random_uuid(), $1, $2, $3)",
            [rule.dimension, rule.hash, now]
          );
        }
      }
      await client.query("COMMIT");
      return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
