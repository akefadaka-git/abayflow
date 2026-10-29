import { createHash, timingSafeEqual } from "node:crypto";
import type {
  IdentityRepository,
  IdentityResult,
  SessionPolicy,
  VerifiedTenantContext
} from "./contracts.js";

function equalStringsConstantTime(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{32,512})$/.exec(header);
  return match?.[1] ?? null;
}

/**
 * Validate the session against authoritative persistence, then independently
 * validate the requested tenant against an active membership. The tenant ID
 * is only a selector; it never grants access by itself.
 */
export async function authenticateAndResolveTenant(input: {
  authorizationHeader: string | undefined;
  requestedTenantId: string | undefined;
  now: Date;
  repository: IdentityRepository;
  sessionPolicy: SessionPolicy;
}): Promise<IdentityResult<VerifiedTenantContext>> {
  const token = readBearerToken(input.authorizationHeader);
  if (!token) return { ok: false, code: "UNAUTHENTICATED" };

  const session = await input.repository.findSessionByTokenHash(hashSessionToken(token));
  if (!session) return { ok: false, code: "UNAUTHENTICATED" };
  if (session.revokedAt !== null) return { ok: false, code: "SESSION_REVOKED" };

  const principal = await input.repository.findPrincipalById(session.userId);
  if (!principal || !equalStringsConstantTime(principal.userId, session.userId)) {
    return { ok: false, code: "UNAUTHENTICATED" };
  }
  if (principal.accountStatus !== "active") {
    return { ok: false, code: "ACCOUNT_SUSPENDED" };
  }
  if (principal.sessionId !== session.id) {
    // A principal/session mismatch is an integrity failure: deny access.
    return { ok: false, code: "UNAUTHENTICATED" };
  }

  if (
    input.sessionPolicy.isExpired(session, input.now) ||
    new Date(session.absoluteExpiresAt).getTime() <= input.now.getTime()
  ) {
    return { ok: false, code: "SESSION_EXPIRED" };
  }

  const tenantId = input.requestedTenantId?.trim();
  if (!tenantId) return { ok: false, code: "TENANT_CONTEXT_REQUIRED" };

  const membership = await input.repository.findActiveMembership(principal.userId, tenantId);
  if (
    !membership ||
    membership.status !== "active" ||
    membership.userId !== principal.userId ||
    membership.tenantId !== tenantId
  ) {
    return { ok: false, code: "TENANT_ACCESS_DENIED" };
  }

  return {
    ok: true,
    value: {
      actorId: principal.userId,
      sessionId: session.id,
      tenantId: membership.tenantId,
      membershipId: membership.membershipId,
      roles: [...membership.roles]
    }
  };
}

/**
 * Apply this guard to every tenant-scoped repository operation. A route must
 * not query by resource ID first and authorize afterward.
 */
export function tenantScopeMatches(
  context: VerifiedTenantContext | null,
  resourceTenantId: string
): boolean {
  return context !== null && context.tenantId === resourceTenantId;
}
