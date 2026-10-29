# Architecture baseline

Status: implementation scaffold; not production-ready.

## Initial shape

- TypeScript API process with a deliberately minimal HTTP surface.
- PostgreSQL remains the initial database candidate, subject to compatibility review.
- Private object/file storage and a persistent worker are planned but not implemented.
- Business routes must not be exposed before session authentication, tenant resolution, per-action authorization, and audit contracts are implemented and reviewed.
- Shared contracts should remain explicit and transport/persistence adapters should be replaceable without changing domain policy semantics.

## Identity and request authorization boundary

- The identity resolver validates the opaque bearer token against a stored token hash, checks account and session status, and verifies active membership for the requested tenant.
- `authorizeTenantRequest` provides a fail-closed request-boundary primitive. It requires the caller to inject an authoritative repository and a concrete session policy; it has no permissive defaults.
- Infrastructure failures produce an unavailable decision rather than granting access. The helper does not replace action-level permission checks or resource-level tenant scoping.
- The primitive is not yet connected to the HTTP server. No business routes should be added until persistence, policy decisions, middleware wiring, and per-route authorization are reviewed.
- Account recovery (F-01), session lifetime (F-02), and membership removal (F-04) remain unresolved and must not be silently defaulted.

## Document approval MVP

1. Authenticate a user using server-managed sessions.
2. Resolve organization membership from trusted server-side state; fail closed if tenant context is absent or ambiguous.
3. Authorize the requested action against explicit permissions and the target resource's tenant before querying or mutating protected data.
4. Upload document content into private quarantine storage; validate content and run required security checks before making it available.
5. Create immutable document versions and versioned workflow definitions.
6. Start an execution pinned to a published workflow version.
7. Assign review tasks and record one decision per task.
8. Commit the decision, state transition, audit event, and notification intent consistently where feasible.
9. Preserve terminal outcomes; corrections create linked executions rather than rewriting history.

## Security invariants

- Every business request must be authorized server-side.
- Tenant-scoped relations must be enforced by application checks and database constraints.
- File paths and URLs are not authorization.
- Published workflow versions and prior decisions are immutable.
- Ordinary users and tenant administrators cannot rewrite audit history.
- Secrets must not be committed or returned in ordinary API responses.
- AI integrations remain disabled unless explicitly configured and disclosed.
- Do not claim production readiness, compliance certification, or successful verification without evidence.

## Open decisions

The F-01–F-17 contract-freeze register remains authoritative. In particular, account recovery, session policy, membership removal, upload scanning behavior, workflow schema dialect, API pagination/rate limits, hosting recovery targets, and acceptance evidence still require Owner decisions. The current scaffold does not resolve these questions.
