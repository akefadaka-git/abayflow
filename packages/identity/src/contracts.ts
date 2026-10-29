/**
 * Identity/session policy boundary for the AbayFlow MVP.
 *
 * These interfaces define contracts, not a persistence implementation. Tenant
 * identity must never be trusted merely because it appears in a request.
 */

export type AccountStatus = "active" | "suspended" | "recovery_pending";
export type MembershipStatus = "active" | "suspended" | "revoked";

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly accountStatus: AccountStatus;
}

export interface TenantMembership {
  readonly membershipId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly status: MembershipStatus;
  readonly roles: readonly string[];
}

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  /** Store only a cryptographic hash of the opaque bearer secret. */
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly absoluteExpiresAt: string;
  readonly revokedAt: string | null;
}

export type IdentityFailureCode =
  | "UNAUTHENTICATED"
  | "ACCOUNT_SUSPENDED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "TENANT_CONTEXT_REQUIRED"
  | "MEMBERSHIP_INACTIVE"
  | "TENANT_ACCESS_DENIED";

export type IdentityResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: IdentityFailureCode };

export interface IdentityRepository {
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  findPrincipalById(userId: string): Promise<AuthenticatedPrincipal | null>;
  findActiveMembership(userId: string, tenantId: string): Promise<TenantMembership | null>;
  revokeSession(sessionId: string, revokedAt: string): Promise<void>;
  /** Advance idle-timeout activity only for a live, unexpired session. */
  touchSession(sessionId: string, seenAt: string): Promise<boolean>;
}

export interface VerifiedTenantContext {
  readonly actorId: string;
  readonly sessionId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly roles: readonly string[];
}

export interface TenantResourceScope {
  readonly tenantId: string;
}

export function resourceBelongsToTenant(
  context: VerifiedTenantContext | null,
  resource: TenantResourceScope
): boolean {
  return context !== null && context.tenantId === resource.tenantId;
}

/** Explicitly selected session policy; absolute expiry is also enforced by the resolver. */
export interface SessionPolicy {
  isExpired(session: SessionRecord, now: Date): boolean;
}

export interface MembershipRevocationService {
  revokeMembership(input: {
    tenantId: string;
    membershipId: string;
    actorId: string;
    reason: string;
    occurredAt: string;
  }): Promise<void>;
}
