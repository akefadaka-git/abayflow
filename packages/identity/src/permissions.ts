import type { VerifiedTenantContext } from "./contracts.js";

/**
 * Permission evaluation is deny-by-default. This module intentionally defines
 * no role grants: each deployment must provide its reviewed role-to-permission
 * mapping, and membership alone never implies an action permission.
 */
export type Permission = string;
export type RolePermissionMap = Readonly<Record<string, readonly Permission[]>>;

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason: "allowed" | "missing_context" | "missing_permission";
}

export function authorizeAction(
  context: VerifiedTenantContext | null,
  requiredPermission: Permission,
  grants: RolePermissionMap
): PermissionDecision {
  if (!context || !context.tenantId || !context.membershipId || !context.actorId) {
    return { allowed: false, reason: "missing_context" };
  }
  if (requiredPermission.trim().length === 0) {
    return { allowed: false, reason: "missing_permission" };
  }

  const allowed = context.roles.some((role) => {
    const permissions = grants[role];
    return Array.isArray(permissions) && permissions.includes(requiredPermission);
  });

  return allowed
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "missing_permission" };
}

/** Resource queries must include tenant_id in their predicate before loading data. */
export function tenantResourcePredicate(
  context: VerifiedTenantContext | null
): { readonly tenantId: string } | null {
  return context?.tenantId ? { tenantId: context.tenantId } : null;
}
