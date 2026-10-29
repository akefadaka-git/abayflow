import type {
  AccountStatus,
  AuthenticatedPrincipal,
  IdentityRepository,
  SessionRecord,
  TenantMembership
} from "./contracts.js";

/**
 * Minimal structural contract implemented by a PostgreSQL Pool or PoolClient.
 * Inject the driver at the composition root; this package does not silently
 * create connections or read ambient credentials.
 */
export interface PostgreSqlQueryable {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid database row: expected string column ${key}`);
  }
  return value;
}

function dateString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid database row: expected timestamp column ${key}`);
  }
  return date.toISOString();
}

function nullableDateString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  return dateString(row, key);
}

function stringArray(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Invalid database row: expected string-array column ${key}`);
  }
  return value;
}

/**
 * PostgreSQL-backed implementation of the read/revoke identity contract.
 * Account creation, session issuance, membership changes, and recovery flows
 * intentionally live outside this adapter until their governing contracts
 * and transactional services are approved.
 */
export class PostgreSqlIdentityRepository implements IdentityRepository {
  constructor(private readonly database: PostgreSqlQueryable) {}

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;

    const result = await this.database.query(
      `SELECT id, account_id AS "userId", token_hash AS "tokenHash",
              created_at AS "createdAt", last_seen_at AS "lastSeenAt",
              absolute_expires_at AS "absoluteExpiresAt", revoked_at AS "revokedAt"
         FROM sessions
        WHERE token_hash = $1
        LIMIT 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: requiredString(row, "id"),
      userId: requiredString(row, "userId"),
      tokenHash: requiredString(row, "tokenHash").trim(),
      createdAt: dateString(row, "createdAt"),
      lastSeenAt: dateString(row, "lastSeenAt"),
      absoluteExpiresAt: dateString(row, "absoluteExpiresAt"),
      revokedAt: nullableDateString(row, "revokedAt")
    };
  }

  async findPrincipalById(userId: string): Promise<AuthenticatedPrincipal | null> {
    const result = await this.database.query(
      `SELECT id AS "userId", status
         FROM accounts
        WHERE id = $1
        LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;

    const status = requiredString(row, "status");
    if (status !== "active" && status !== "suspended" && status !== "recovery_pending") {
      throw new Error("Invalid account status in persistence");
    }

    return {
      userId: requiredString(row, "userId"),
      accountStatus: status as AccountStatus
    };
  }

  async findActiveMembership(userId: string, tenantId: string): Promise<TenantMembership | null> {
    const result = await this.database.query(
      `SELECT m.id AS "membershipId", m.account_id AS "userId", m.tenant_id AS "tenantId",
              m.status, m.roles
         FROM tenant_memberships AS m
         INNER JOIN tenants AS t ON t.id = m.tenant_id AND t.status = 'active'
        WHERE m.account_id = $1
          AND m.tenant_id = $2
          AND m.status = 'active'
        LIMIT 1`,
      [userId, tenantId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      membershipId: requiredString(row, "membershipId"),
      userId: requiredString(row, "userId"),
      tenantId: requiredString(row, "tenantId"),
      status: "active",
      roles: stringArray(row, "roles")
    };
  }

  async touchSession(sessionId: string, seenAt: string): Promise<boolean> {
    const timestamp = new Date(seenAt);
    if (!Number.isFinite(timestamp.getTime())) {
      throw new Error("seenAt must be a valid timestamp");
    }

    const result = await this.database.query(
      `UPDATE sessions
          SET last_seen_at = GREATEST(last_seen_at, $2)
        WHERE id = $1
          AND revoked_at IS NULL
          AND absolute_expires_at > $2
        RETURNING id`,
      [sessionId, timestamp.toISOString()]
    );
    return result.rows.length === 1;
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
    const timestamp = new Date(revokedAt);
    if (!Number.isFinite(timestamp.getTime())) {
      throw new Error("revokedAt must be a valid timestamp");
    }

    await this.database.query(
      `UPDATE sessions
          SET revoked_at = $2
        WHERE id = $1
          AND revoked_at IS NULL
          AND created_at <= $2`,
      [sessionId, timestamp.toISOString()]
    );
  }
}
