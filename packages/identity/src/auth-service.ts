import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PostgreSqlPool } from "./postgresql-lifecycle.js";
import { PostgreSqlIdentityLifecycle } from "./postgresql-lifecycle.js";
import { PostgreSqlRateLimiter } from "./postgresql-rate-limiter.js";
import { hashCredential, verifyCredential } from "./credential-hashing.js";

const HOUR = 60 * 60 * 1000;
const GENERIC_RECOVERY_RESPONSE = "If the account is eligible, instructions will be sent to its verified email address.";
const GENERIC_VERIFICATION_RESPONSE = "If the account is eligible, verification instructions will be sent.";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function publicAppUrl(): URL {
  const value = process.env.ABAYFLOW_PUBLIC_APP_URL;
  if (!value) throw new Error("ABAYFLOW_PUBLIC_APP_URL must be configured");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("ABAYFLOW_PUBLIC_APP_URL must use HTTPS outside localhost");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("ABAYFLOW_PUBLIC_APP_URL must be an origin/base path only");
  return url;
}

export interface AuthRequestResult {
  readonly accepted: true;
  readonly message: string;
}

export class IdentityAuthService {
  private readonly lifecycle: PostgreSqlIdentityLifecycle;
  private readonly limiter: PostgreSqlRateLimiter;

  constructor(private readonly pool: PostgreSqlPool, now: () => Date = () => new Date()) {
    this.lifecycle = new PostgreSqlIdentityLifecycle(pool, { now });
    this.limiter = new PostgreSqlRateLimiter(pool, now);
  }

  async requestVerification(emailInput: string, sourceIp: string): Promise<AuthRequestResult> {
    const email = normalizeEmail(emailInput);
    if (email.length < 3 || email.length > 254 || !email.includes("@") || !sourceIp) {
      return { accepted: true, message: GENERIC_VERIFICATION_RESPONSE };
    }
    const limit = await this.limiter.consume([
      { dimension: "account_email", subject: email, limit: 5, windowMs: HOUR },
      { dimension: "source_ip", subject: sourceIp, limit: 20, windowMs: HOUR }
    ]);
    if (!limit.allowed) return { accepted: true, message: GENERIC_VERIFICATION_RESPONSE };

    const result = await this.pool.query(
      "SELECT id, email_normalized FROM accounts WHERE email_normalized = $1 AND status = 'active' AND email_verified_at IS NULL",
      [email]
    );
    const account = result.rows[0];
    if (!account || typeof account.id !== "string" || typeof account.email_normalized !== "string") {
      return { accepted: true, message: GENERIC_VERIFICATION_RESPONSE };
    }
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hash(rawToken);
    const url = publicAppUrl();
    url.pathname = url.pathname.replace(/\/$/, "") + "/verify-email";
    url.searchParams.set("token", rawToken);
    await this.lifecycle.issueAccountToken({
      tokenId: randomUUID(),
      accountId: account.id,
      purpose: "email_verification",
      tokenHash,
      email: {
        to: account.email_normalized,
        subject: "Verify your AbayFlow email",
        text: `Use this one-time link within 24 hours to verify your email: ${url.toString()}\nIf you did not request this, you can ignore this message.`
      }
    });
    return { accepted: true, message: GENERIC_VERIFICATION_RESPONSE };
  }

  async requestRecovery(emailInput: string, sourceIp: string): Promise<AuthRequestResult> {
    const email = normalizeEmail(emailInput);
    if (email.length < 3 || email.length > 254 || !email.includes("@") || !sourceIp) {
      return { accepted: true, message: GENERIC_RECOVERY_RESPONSE };
    }
    const limit = await this.limiter.consume([
      { dimension: "account_email", subject: email, limit: 5, windowMs: HOUR },
      { dimension: "source_ip", subject: sourceIp, limit: 20, windowMs: HOUR }
    ]);
    if (!limit.allowed) return { accepted: true, message: GENERIC_RECOVERY_RESPONSE };

    const result = await this.pool.query(
      `SELECT id, email_normalized FROM accounts
        WHERE email_normalized = $1 AND status = 'active' AND email_verified_at IS NOT NULL`,
      [email]
    );
    const account = result.rows[0];
    if (!account || typeof account.id !== "string" || typeof account.email_normalized !== "string") {
      return { accepted: true, message: GENERIC_RECOVERY_RESPONSE };
    }
    const rawToken = randomBytes(32).toString("base64url");
    const url = publicAppUrl();
    url.pathname = url.pathname.replace(/\/$/, "") + "/recover";
    url.searchParams.set("token", rawToken);
    await this.lifecycle.issueAccountToken({
      tokenId: randomUUID(),
      accountId: account.id,
      purpose: "password_recovery",
      tokenHash: hash(rawToken),
      email: {
        to: account.email_normalized,
        subject: "AbayFlow account recovery",
        text: `Use this one-time link within 30 minutes to reset your credential: ${url.toString()}\nIf you did not request this, you can ignore this message.`
      }
    });
    return { accepted: true, message: GENERIC_RECOVERY_RESPONSE };
  }

  async redeemRecovery(rawToken: string, newCredential: string): Promise<boolean> {
    if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) return false;
    const tokenHash = hash(rawToken);
    const limit = await this.limiter.consume([
      { dimension: "token", subject: tokenHash, limit: 5, windowMs: 30 * 60 * 1000 }
    ]);
    if (!limit.allowed) return false;
    const encoded = await hashCredential(newCredential);
    return this.lifecycle.consumeRecoveryTokenAndReplaceCredential({
      tokenHash,
      newCredentialHash: encoded
    });
  }

  async verifyEmail(rawToken: string): Promise<boolean> {
    if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) return false;
    const tokenHash = hash(rawToken);
    const limit = await this.limiter.consume([
      { dimension: "token", subject: tokenHash, limit: 5, windowMs: 30 * 60 * 1000 }
    ]);
    if (!limit.allowed) return false;
    return this.lifecycle.consumeEmailVerificationToken(tokenHash);
  }

  async login(emailInput: string, credential: string): Promise<{ readonly sessionToken: string; readonly sessionId: string } | null> {
    const email = normalizeEmail(emailInput);
    const result = await this.pool.query(
      `SELECT id, credential_hash FROM accounts
        WHERE email_normalized = $1 AND status = 'active' AND email_verified_at IS NOT NULL`,
      [email]
    );
    const account = result.rows[0];
    if (!account || typeof account.id !== "string" || typeof account.credential_hash !== "string") return null;
    let verified = false;
    try {
      verified = await verifyCredential(credential, account.credential_hash);
    } catch {
      return null;
    }
    if (!verified) return null;
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    await this.lifecycle.issueSession({ sessionId, accountId: account.id, tokenHash: hash(sessionToken) });
    return { sessionToken, sessionId };
  }
}
