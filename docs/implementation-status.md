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
- [x] PostgreSQL driver declared as a runtime dependency.
- [x] Explicit migration runner with PostgreSQL advisory locking, SHA-256 checksums, immutable applied-migration enforcement, and per-migration transactions that atomically commit schema changes with the migration ledger entry.
- [x] Corrected the identity migration's token-hash CHECK expression and moved transaction ownership to the migration runner.

## Not implemented or not yet integrated

- [x] Lazy PostgreSQL connection pool and identity application composition for the reserved `/api` authentication boundary; database connectivity and schema readiness are not yet verified.
- [ ] Migration runner execution against a real database; no target database was supplied for this source-only pass.
- [ ] Per-route action permission checks and resource-tenant scoping; no business routes are registered.
- [x] F-01 account verification/recovery policy selected and documented: verified email only, single-use hashed tokens, 24-hour verification token, 30-minute recovery token, generic responses, rate limits, and revoke-all-sessions on successful recovery.
- [x] F-02 session policy selected and documented: 30-minute idle timeout, 12-hour absolute lifetime, concurrent sessions allowed, opaque 256-bit-minimum bearer secrets, and session activity tracking.
- [x] Reserved `/api` request namespace wired to fail-closed authentication and tenant resolution; no business routes are registered.
- [ ] Membership-removal transaction, pending-task handling, and cross-session/API/download revocation integration (F-04 remains open).
- [ ] Transactional membership lifecycle service and audited administrative operations.
- [ ] Explicit per-action permission evaluation and resource-level authorization beyond tenant membership.
- [ ] Tenant-scoped data access patterns and further concurrency controls for domain tables.
- [ ] Login/session issuance and logout/revoke-all-sessions service; recovery and verification token lifecycle and credential handling.
- [ ] Document upload, quarantine, malware scanning, versioning, and private downloads.
- [ ] Workflow definition validation, publication, immutable versions, and execution state machine.
- [ ] Persistent job queue, leases, retry policy, and worker fencing.
- [ ] Audit persistence and integrity verification; notification outbox and delivery.
- [ ] Exports, retention, legal holds, deletion and backup reconciliation.
- [ ] OpenAPI contract, rate limits, pagination, and operational telemetry.
- [ ] Complete Amharic translation catalog, translation-key integration, font/rendering and accessibility review, locale-aware dates/numbers/currency, and localization verification.
- [ ] Dependency/license audit, final license file, CI workflows, and automated verification.

## Migration runner contract

Run `npm run db:migrate` only from the repository root after dependencies are installed and `DATABASE_URL` points to the intended PostgreSQL database. The command is explicit and is never invoked by API startup. It creates a `schema_migrations` ledger, serializes runners with a PostgreSQL advisory lock, verifies SHA-256 checksums for already-applied migrations, and wraps each new migration plus its ledger row in one transaction. If an applied migration's contents change, it stops and requires a new migration file. Review the target database and backup/recovery arrangements before running it.

## Evidence and limitations

- Repository changes are on `feat/document-approval-mvp`; no merge or deployment is authorized.
- No tests, build, typecheck, dependency installation, database connection, or migration execution have been run for this pass.
- The PostgreSQL driver is declared in `package.json`, but dependencies have not been installed and the driver has not been exercised.
- The migration runner is source-only and has not been run against a database.
- The API creates a lazy PostgreSQL pool when `DATABASE_URL` is configured and wires the identity adapter into the reserved `/api` request boundary. The pool and middleware have not been exercised against a database.
- F-01/F-02 policy decisions are documented; their complete verification/recovery/login/logout workflows remain unimplemented.
- The adapter does not issue sessions, implement account recovery, or implement membership removal.
- Tenant membership is not equivalent to permission to perform every action. Routes must authorize the action and tenant-scope resource queries before accessing data.
- Baseline response headers are not a substitute for deployment-level TLS, proxy, or browser security configuration.
- Amharic-first is a confirmed product direction, not a claim that the current scaffold is already translated.
- This remains an initial scaffold, not a complete or production-ready MVP.
