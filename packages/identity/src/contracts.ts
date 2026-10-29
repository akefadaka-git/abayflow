/**
 * Identity/session policy boundary for the AbayFlow MVP.
 *
 * These interfaces intentionally define contracts, not a session implementation.
 * No request may derive tenant identity from an untrusted header, query value,
 * URL, or client-supplied organization ID.
 */

export type AccountStatus = "active" | "suspended" | "recovery_pending";
export type MembershipStatus = "active" | "suspended" | "revoked";

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly accountStatus: AccountStatus;
  readonly authenticatedAt: string;
  readonly sessionId: string;
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

/**
 * Adapter contract. Implementations must use authoritative persistence and
 * must never fall back to a tenant ID supplied only by the caller.
 */
export interface IdentityRepository {
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  findPrincipalById(userId: string): Promise<AuthenticatedPrincipal | null>;
  findActiveMembership(userId: string, tenantId: string): Promise<TenantMembership | null>;
  revokeSession(sessionId: string, revokedAt: string): Promise<void>;
}

/**
 * Authorization context must be created only after session validation and
 * membership lookup. Do not construct this from request parameters.
 */
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

/**
 * Session expiry policy is intentionally injected. F-02 remains unresolved,
 * so implementations must not invent idle/absolute lifetimes in this module.
 */
export interface SessionPolicy {
  isExpired(session: SessionRecord, now: Date): boolean;
}

/**
 * Membership removal must revoke tenant access immediately in the authoritative
 * store, including subsequent download/export/API authorization checks.
 * Existing historical actor attribution must remain intact.
 */
export interface MembershipRevocationService {
  revokeMembership(input: {
    tenantId: string;
    membershipId: string;
    actorId: string;
    reason: string;
    occurredAt: string;
  }): Promise<void>;
}
