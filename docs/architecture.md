# Architecture baseline

Status: implementation scaffold; not production-ready.

## Initial shape

- TypeScript API process with a deliberately minimal HTTP surface.
- PostgreSQL is the initial persistence candidate. Driver dependency and an explicit migration runner are now declared; normal API connection composition is still not wired.
- Private object/file storage and a persistent worker are planned but not implemented.
- Business routes must not be exposed before session authentication, tenant resolution, per-action authorization, and audit contracts are implemented and reviewed.
- Shared contracts should remain explicit and transport/persistence adapters should be replaceable without changing domain policy semantics.

## Identity persistence

- `database/migrations/001_identity_foundation.sql` defines accounts, tenants, sessions, and tenant memberships.
- Database constraints enforce valid statuses, foreign keys, unique tenant slugs, one membership per account/tenant pair, hashed bearer-token shape/uniqueness, session expiry ordering, and membership revocation consistency.
- The migration uses application-generated UUIDs and `ON DELETE RESTRICT` for identity references to avoid silently cascading away audit-relevant records.
- `PostgreSqlIdentityRepository` accepts an injected query interface; it does not create a pool, load credentials, run migrations, or start database connections.
- Active membership lookup joins the tenant table and fails closed when either the membership or tenant is inactive.
- Session token hashes are looked up with parameterized queries; raw bearer secrets are not persisted by this adapter.
- `scripts/migrate.mjs` is an explicit operator-invoked migration runner. It requires `DATABASE_URL`, serializes runs with a PostgreSQL advisory lock, maintains a checksum ledger, rejects edits to applied migrations, and commits each migration with its ledger row in one transaction.
- Migration execution is not part of API startup. Review the target database, credentials, and recovery arrangements before invoking `npm run db:migrate`.

## Identity and request authorization boundary

- The identity resolver validates the opaque bearer token against a stored token hash, checks account and session status, and verifies active membership for the requested tenant.
- `authorizeTenantRequest` provides a fail-closed request-boundary primitive. It requires the caller to inject an authoritative repository and a concrete session policy; it has no permissive defaults.
- Infrastructure failures produce an unavailable decision rather than granting access. The helper does not replace action-level permission checks or resource-level tenant scoping.
- The primitive is connected to the reserved `/api` namespace. That namespace intentionally has no business routes; valid authenticated requests receive 404 after the boundary is exercised.
- F-01 and F-02 policy decisions are recorded in `docs/security-contracts-f01-f02.md`. Their complete workflows (credential verification, email delivery, token lifecycle, login/logout, revoke-all-sessions, and high-risk reauthentication) remain unimplemented.
- Membership removal (F-04) remains unresolved. The boundary requires an active membership but does not yet provide transactional membership lifecycle or revoke sessions/tasks/files on membership removal.

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

The F-01–F-17 contract-freeze register remains authoritative. F-01 account verification/recovery and F-02 session lifetime policy choices are now documented in `docs/security-contracts-f01-f02.md`; their end-to-end workflows are not implemented. Membership removal, upload scanning behavior, workflow schema dialect, API pagination/rate limits, hosting recovery targets, and acceptance evidence still require separate decisions. The current scaffold is not production-ready.
