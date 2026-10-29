# Implementation status

Updated: 2026-10-29

## Delivered in this scaffold

- [x] Project README and initial repository commit.
- [x] Strict TypeScript compiler configuration.
- [x] Minimal API process with liveness endpoint.
- [x] Readiness endpoint fails closed until dependencies are configured.
- [x] Unknown routes return a stable JSON 404 response.
- [x] Server-generated request correlation IDs in response headers and JSON envelopes.
- [x] Baseline response headers: no-store, nosniff, frame denial, restrictive CSP, referrer policy, and permissions policy.
- [x] Shared API error-envelope and tenant-context contract types.
- [x] Identity/session repository contracts and fail-closed session-plus-membership resolution function.
- [x] Shared tenant-request authorization primitive with explicit dependencies and fail-closed infrastructure-error handling.
- [x] PostgreSQL identity schema migration for accounts, tenants, sessions, and memberships with status checks, foreign keys, uniqueness, revocation consistency, and lookup indexes.
- [x] Injected PostgreSQL identity repository adapter for session lookup, account status lookup, active tenant membership lookup, and session revocation.
- [x] Active membership lookup also requires the tenant itself to be active.
- [x] Tenant-scope comparison guard for use by tenant-scoped data access.
- [x] Amharic-first product direction documented, with English as a secondary language and localization requirements identified.
- [x] Architecture and security-gate documentation.

## Not implemented or not yet integrated

- [ ] PostgreSQL driver installation, pool creation, configuration/secrets handling, connection lifecycle, and application composition root.
- [ ] Migration runner, migration ledger, and controlled application of the identity migration to a real database.
- [ ] HTTP middleware wiring the authorization boundary into every business route; the API still exposes no business routes.
- [ ] Approved session idle/absolute lifetime policy (F-02 remains open); the adapter stores timestamps but does not decide policy.
- [ ] Account verification/recovery contract and implementation (F-01 remains open).
- [ ] Membership-removal transaction, pending-task handling, and cross-session/API/download revocation integration (F-04 remains open).
- [ ] Transactional membership lifecycle service and audited administrative operations.
- [ ] Explicit per-action permission evaluation and resource-level authorization beyond tenant membership.
- [ ] Tenant-scoped data access patterns and further concurrency controls for domain tables.
- [ ] Session issuance/rotation service; opaque token generation and persistence lifecycle.
- [ ] Document upload, quarantine, malware scanning, versioning, and private downloads.
- [ ] Workflow definition validation, publication, immutable versions, and execution state machine.
- [ ] Persistent job queue, leases, retry policy, and worker fencing.
- [ ] Audit persistence and integrity verification; notification outbox and delivery.
- [ ] Exports, retention, legal holds, deletion and backup reconciliation.
- [ ] OpenAPI contract, rate limits, pagination, and operational telemetry.
- [ ] Complete Amharic translation catalog, translation-key integration, font/rendering and accessibility review, locale-aware dates/numbers/currency, and localization verification.
- [ ] Dependency/license audit, final license file, CI workflows, and automated verification.

## Evidence and limitations

- Repository changes are on `feat/document-approval-mvp`; no merge or deployment is authorized.
- No tests, build, typecheck, dependency installation, database connection, or migration execution have been run for this pass.
- The adapter uses an injected structural PostgreSQL query interface; no PostgreSQL driver is installed or wired by this change.
- The migration is source-only and has not been applied to a database.
- The authorization primitive requires the adapter and a concrete session policy, and it is not yet wired into HTTP request handling.
- The adapter does not issue sessions or implement account recovery or membership removal.
- Tenant membership is not equivalent to permission to perform every action. Routes must authorize the action and tenant-scope resource queries before accessing data.
- Baseline response headers are not a substitute for deployment-level TLS, proxy, or browser security configuration.
- Amharic-first is a confirmed product direction, not a claim that the current scaffold is already translated.
- This remains an initial scaffold, not a complete or production-ready MVP.
