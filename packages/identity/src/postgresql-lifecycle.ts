import { randomUUID } from "node:crypto";
import type { PostgreSqlQueryable } from "./postgresql-repository.js";

export interface PostgreSqlClient extends PostgreSqlQueryable {
  release(): void;
}

export interface PostgreSqlPool extends PostgreSqlQueryable {
  connect(): Promise<PostgreSqlClient>;
}

export interface LifecycleClock {
  now(): Date;
}

function validHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function validTimestamp(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid lifecycle timestamp");
  return parsed;
}

/**
 * Transactional identity lifecycle primitives. These are not HTTP handlers and
 * do not replace caller-side authentication, action permission checks, email
 * delivery, or a separately approved credential hashing/verification policy.
 * Raw bearer/recovery tokens must never be passed to persistence; pass SHA-256
 * hashes and return any newly generated secret only once from a reviewed caller.
 */
export class PostgreSqlIdentityLifecycle {
  constructor(
    private readonly pool: PostgreSqlPool,
    private readonly clock: LifecycleClock = { now: () => new Date() }
  ) {}

  async issueSession(input: {
    sessionId: string;
    accountId: string;
    tokenHash: string;
  }): Promise<{ readonly createdAt: string; readonly lastSeenAt: string; readonly absoluteExpiresAt: string }> {
    if (!validHash(input.tokenHash)) throw new Error("Session token hash must be lowercase SHA-256 hex");
    const client = await this.pool.connect();
    const now = this.clock.now();
    const createdAt = now.toISOString();
    const absoluteExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    try {
      await client.query("BEGIN");
      const account = await client.query(
        `SELECT id FROM accounts
          WHERE id = $1 AND status = 'active'
            AND email_verified_at IS NOT NULL
            AND credential_hash IS NOT NULL
          FOR UPDATE`,
        [input.accountId]
      );
      if (account.rows.length !== 1) throw new Error("Account is not eligible for session issuance");

      await client.query(
        `INSERT INTO sessions (id, account_id, token_hash, created_at, last_seen_at, absolute_expires_at)
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [input.sessionId, input.accountId, input.tokenHash, createdAt, absoluteExpiresAt]
      );
      await client.query("COMMIT");
      return { createdAt, lastSeenAt: createdAt, absoluteExpiresAt };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeAllSessions(input: {
    accountId: string;
    reason: "password_recovery" | "account_suspension" | "credential_compromise";
    actorAccountId?: string | null;
  }): Promise<number> {
    const client = await this.pool.connect();
    const occurredAt = this.clock.now().toISOString();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE sessions SET revoked_at = $2
          WHERE account_id = $1 AND revoked_at IS NULL AND created_at <= $2
          RETURNING id`,
        [input.accountId, occurredAt]
      );
      await client.query(
        `INSERT INTO identity_audit_events
          (id, actor_account_id, subject_account_id, event_type, occurred_at, reason, metadata)
         VALUES ($1, $2, $3, 'sessions_revoked', $4, $5, $6::jsonb)`,
        [
          randomUUID(),
          input.actorAccountId ?? null,
          input.accountId,
          occurredAt,
          input.reason,
          JSON.stringify({ revokedCount: result.rows.length })
        ]
      );
      await client.query("COMMIT");
      return result.rows.length;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeMembership(input: {
    tenantId: string;
    membershipId: string;
    actorAccountId: string;
    reason: string;
  }): Promise<boolean> {
    const reason = input.reason.trim();
    if (reason.length < 1 || reason.length > 1000) throw new Error("A bounded revocation reason is required");
    const client = await this.pool.connect();
    const occurredAt = this.clock.now().toISOString();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE tenant_memberships
            SET status = 'revoked', revoked_at = $3, updated_at = $3
          WHERE id = $1 AND tenant_id = $2 AND status = 'active'
          RETURNING account_id`,
        [input.membershipId, input.tenantId, occurredAt]
      );
      if (result.rows.length !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      const subjectAccountId = result.rows[0]?.account_id;
      if (typeof subjectAccountId !== "string") throw new Error("Membership row returned an invalid account id");

      await client.query(
        `INSERT INTO identity_audit_events
          (id, tenant_id, actor_account_id, subject_account_id, membership_id,
           event_type, occurred_at, reason, metadata)
         VALUES ($1, $2, $3, $4, $5, 'membership_revoked', $6, $7, '{}'::jsonb)`,
        [randomUUID(), input.tenantId, input.actorAccountId, subjectAccountId, input.membershipId, occurredAt, reason]
      );
      await client.query("COMMIT");
      // Revocation takes effect on the next request because tenant membership
      // is re-resolved from persistence. Task and file revocation hooks remain
      // unavailable until those domain tables and contracts exist.
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeRecoveryTokenAndReplaceCredential(input: {
    tokenHash: string;
    newCredentialHash: string;
  }): Promise<boolean> {
    if (!validHash(input.tokenHash)) return false;
    if (input.newCredentialHash.trim().length < 1 || input.newCredentialHash.length > 1024) {
      throw new Error("Credential hash is missing or exceeds storage limits");
    }
    const client = await this.pool.connect();
    const now = this.clock.now().toISOString();

    try {
      await client.query("BEGIN");
      const tokenResult = await client.query(
        `SELECT id, account_id, expires_at, consumed_at, invalidated_at, redemption_attempts
           FROM account_tokens
          WHERE token_hash = $1 AND purpose = 'password_recovery'
          FOR UPDATE`,
        [input.tokenHash]
      );
      const token = tokenResult.rows[0];
      if (!token) {
        await client.query("ROLLBACK");
        return false;
      }

      const tokenId = token.id;
      const accountId = token.account_id;
      const expiresAt = validTimestamp(String(token.expires_at)).getTime();
      const attempts = Number(token.redemption_attempts);
      const unavailable =
        token.consumed_at !== null ||
        token.invalidated_at !== null ||
        !Number.isInteger(attempts) ||
        attempts >= 5 ||
        expiresAt <= Date.parse(now);

      if (unavailable || typeof tokenId !== "string" || typeof accountId !== "string") {
        await client.query(
          `UPDATE account_tokens
              SET redemption_attempts = LEAST(redemption_attempts + 1, 5),
                  invalidated_at = CASE WHEN expires_at <= $2 OR redemption_attempts + 1 >= 5
                                        THEN $2 ELSE invalidated_at END
            WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
          [String(tokenId), now]
        );
        await client.query("COMMIT");
        return false;
      }

      const account = await client.query(
        `UPDATE accounts
            SET credential_hash = $2, updated_at = $3
          WHERE id = $1 AND status = 'active' AND email_verified_at IS NOT NULL
          RETURNING id`,
        [accountId, input.newCredentialHash, now]
      );
      if (account.rows.length !== 1) {
        await client.query("ROLLBACK");
        return false;
      }

      const consumed = await client.query(
        `UPDATE account_tokens SET consumed_at = $2
          WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
          RETURNING id`,
        [tokenId, now]
      );
      if (consumed.rows.length !== 1) throw new Error("Recovery token was not atomically consumable");

      await client.query(
        `UPDATE account_tokens SET invalidated_at = $2
          WHERE account_id = $1 AND purpose = 'password_recovery'
            AND id <> $3 AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [accountId, now, tokenId]
      );
      const revoked = await client.query(
        `UPDATE sessions SET revoked_at = $2
          WHERE account_id = $1 AND revoked_at IS NULL AND created_at <= $2
          RETURNING id`,
        [accountId, now]
      );
      await client.query(
        `INSERT INTO identity_audit_events
          (id, subject_account_id, event_type, occurred_at, reason, metadata)
         VALUES ($1, $2, 'credential_recovered', $3, 'password_recovery', $4::jsonb)`,
        [randomUUID(), accountId, now, JSON.stringify({ revokedSessions: revoked.rows.length })]
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async issueAccountToken(input: {
    tokenId: string;
    accountId: string;
    purpose: "email_verification" | "password_recovery";
    tokenHash: string;
  }): Promise<boolean> {
    if (!validHash(input.tokenHash)) throw new Error("Account token hash must be lowercase SHA-256 hex");
    const client = await this.pool.connect();
    const now = this.clock.now();
    const createdAt = now.toISOString();
    const lifetimeMs = input.purpose === "email_verification" ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + lifetimeMs).toISOString();

    try {
      await client.query("BEGIN");
      const account = await client.query(
        input.purpose === "email_verification"
          ? `SELECT id FROM accounts WHERE id = $1 AND status = 'active' AND email_normalized IS NOT NULL AND email_verified_at IS NULL FOR UPDATE`
          : `SELECT id FROM accounts WHERE id = $1 AND status = 'active' AND email_normalized IS NOT NULL AND email_verified_at IS NOT NULL FOR UPDATE`,
        [input.accountId]
      );
      if (account.rows.length !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `UPDATE account_tokens SET invalidated_at = $3
          WHERE account_id = $1 AND purpose = $2
            AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [input.accountId, input.purpose, createdAt]
      );
      await client.query(
        `INSERT INTO account_tokens
          (id, account_id, purpose, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.tokenId, input.accountId, input.purpose, input.tokenHash, createdAt, expiresAt]
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeEmailVerificationToken(tokenHash: string): Promise<boolean> {
    if (!validHash(tokenHash)) return false;
    const client = await this.pool.connect();
    const now = this.clock.now().toISOString();

    try {
      await client.query("BEGIN");
      const tokenResult = await client.query(
        `SELECT id, account_id, expires_at, consumed_at, invalidated_at
           FROM account_tokens
          WHERE token_hash = $1 AND purpose = 'email_verification'
          FOR UPDATE`,
        [tokenHash]
      );
      const token = tokenResult.rows[0];
      if (!token || token.consumed_at !== null || token.invalidated_at !== null ||
          validTimestamp(String(token.expires_at)).getTime() <= Date.parse(now) ||
          typeof token.id !== "string" || typeof token.account_id !== "string") {
        await client.query("ROLLBACK");
        return false;
      }
      const verified = await client.query(
        `UPDATE accounts SET email_verified_at = $2, updated_at = $2
          WHERE id = $1 AND status = 'active' AND email_normalized IS NOT NULL
            AND email_verified_at IS NULL
          RETURNING id`,
        [token.account_id, now]
      );
      if (verified.rows.length !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      const consumed = await client.query(
        `UPDATE account_tokens SET consumed_at = $2
          WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
          RETURNING id`,
        [token.id, now]
      );
      if (consumed.rows.length !== 1) throw new Error("Verification token was not atomically consumable");
      await client.query(
        `INSERT INTO identity_audit_events
          (id, subject_account_id, event_type, occurred_at, reason, metadata)
         VALUES ($1, $2, 'email_verified', $3, 'email_verification', '{}'::jsonb)`,
        [randomUUID(), token.account_id, now]
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

}
