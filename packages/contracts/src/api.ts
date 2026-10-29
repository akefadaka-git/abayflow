/**
 * Stable API error contract.
 *
 * Never place secrets, stack traces, SQL, storage paths, or cross-tenant
 * resource details in public error messages.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_NOT_READY";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: ReadonlyArray<{
      field?: string;
      code: string;
      message: string;
    }>;
  };
}

export interface ApiSuccessBody<T> {
  data: T;
  requestId: string;
}

/**
 * Resource identifiers are not authorization. Every repository operation
 * must also receive a verified TenantContext from trusted server middleware.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly actorId: string;
  readonly membershipId: string;
  readonly roles: readonly string[];
}

export type AuthorizationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "unauthenticated" | "forbidden" | "tenant_context_missing" };
