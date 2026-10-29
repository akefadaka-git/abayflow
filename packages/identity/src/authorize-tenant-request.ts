import type { IdentityRepository, IdentityFailureCode, SessionPolicy, VerifiedTenantContext } from "./contracts.js";
import { authenticateAndResolveTenant } from "./resolve-tenant.js";

export interface TenantAuthorizationRequest {
  readonly authorizationHeader: string | undefined;
  /** Tenant selector from a trusted routing layer or request contract; never proof of access. */
  readonly requestedTenantId: string | undefined;
  readonly now?: Date;
}

export type TenantAuthorizationDecision =
  | { readonly ok: true; readonly context: VerifiedTenantContext }
  | {
      readonly ok: false;
      readonly httpStatus: 400 | 401 | 403 | 503;
      readonly code: IdentityFailureCode | "IDENTITY_UNAVAILABLE";
    };

export interface TenantAuthorizationDependencies {
  readonly repository: IdentityRepository;
  readonly sessionPolicy: SessionPolicy;
  readonly now?: () => Date;
}

const FAILURE_STATUS: Record<IdentityFailureCode, 400 | 401 | 403> = {
  UNAUTHENTICATED: 401,
  ACCOUNT_SUSPENDED: 403,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  TENANT_CONTEXT_REQUIRED: 400,
  MEMBERSHIP_INACTIVE: 403,
  TENANT_ACCESS_DENIED: 403
};

/**
 * Shared request-boundary authorization primitive.
 *
 * It deliberately has no default repository or default session policy. Callers
 * must supply authoritative persistence and an explicitly selected policy.
 * Infrastructure errors become a fail-closed 503 decision; they never grant
 * access. This function does not authorize an action or resource by itself:
 * callers must apply permission and resource-tenant checks before data access.
 */
export async function authorizeTenantRequest(
  request: TenantAuthorizationRequest,
  dependencies: TenantAuthorizationDependencies
): Promise<TenantAuthorizationDecision> {
  try {
    const result = await authenticateAndResolveTenant({
      authorizationHeader: request.authorizationHeader,
      requestedTenantId: request.requestedTenantId,
      now: request.now ?? dependencies.now?.() ?? new Date(),
      repository: dependencies.repository,
      sessionPolicy: dependencies.sessionPolicy
    });

    if (!result.ok) {
      return {
        ok: false,
        httpStatus: FAILURE_STATUS[result.code],
        code: result.code
      };
    }

    return { ok: true, context: result.value };
  } catch {
    // Do not leak database or identity-provider details to callers.
    return { ok: false, httpStatus: 503, code: "IDENTITY_UNAVAILABLE" };
  }
}
