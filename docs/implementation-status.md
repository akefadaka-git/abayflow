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
- [x] Injected PostgreSQL identity repository adapter for session lookup, account status lookup, active tenant membership lookup, session activity, and individual session revocation.
- [x] Additive identity-lifecycle migration for normalized email, opaque credential-hash storage, hashed single-use verification/recovery tokens, rate-limit event storage, and identity audit events.
- [x] Transactional lifecycle primitives for verification-token issuance/consumption, recovery-token issuance/consumption, fixed-lifetime session issuance, revoke-all-sessions, and audited membership revocation.
- [x] Deny-by-default action-permission evaluator with injected role grants; no role grants are assumed by default.\n- [x] Versioned scrypt credential hashing and constant-time derived-key comparison.\n- [x] PostgreSQL-backed, cross-instance rate limiting using transaction-scoped advisory locks and hashed subjects.\n- [x] Encrypted transactional email outbox with SMTP delivery, bounded retries, and stale-lease recovery.\n- [x] Identity service source for generic verification/recovery responses, token redemption, and login/session issuance; no HTTP routes exposed.\n- [x] GitHub Actions source verification workflow for typecheck, build, and unit tests.
- [x] Active membership lookup also requires the tenant itself to be active.
- [x] Tenant-scope comparison guard for use by tenant-scoped data access.
- [x] Amharic-first product direction documented, with English as a secondary language and localization requirements identified.
- [x] Architecture and security-gate documentation.
- [x] PostgreSQL driver declared as a runtime dependency.
- [x] Explicit migration runner with PostgreSQL advisory locking, SHA-256 checksums, immutable applied-migration enforcement, and per-migration transactions that atomically commit schema changes with the migration ledger entry.
- [x] Corrected the identity migration's token-hash CHECK expression and moved transaction ownership to the migration runner.

## Not implemented or not yet integrated

- [x] Lazy PostgreSQL connection pool and identity application composition for the reserved `/api` authentication boundary; database connectivity and schema readiness are not yet verified.
- [ ] Migration runner execution against a real database; no target database was supplied for this source-only pass.\n- [ ] Production SMTP and outbox encryption secrets must be configured in the deployment secret manager; email delivery has not been exercised.
- [ ] Per-route action permission checks and resource-tenant scoping; no business routes are registered.
- [x] F-01 account verification/recovery policy selected and documented: verified email only, single-use hashed tokens, 24-hour verification token, 30-minute recovery token, generic responses, rate limits, and revoke-all-sessions on successful recovery.
- [x] F-02 session policy selected and documented: 30-minute idle timeout, 12-hour absolute lifetime, concurrent sessions allowed, opaque 256-bit-minimum bearer secrets, and session activity tracking.
- [x] Reserved `/api` request namespace wired to fail-closed authentication and tenant resolution; no business routes are registered.
- [ ] Membership-removal follow-up handling for pending tasks/files and domain-specific download revocation (F-04 remains partial; those domain tables do not exist yet).
- [x] Transactional membership revocation primitive with an audit event; [ ] authorized administrative route, pending-task/file handling, and domain-specific revocation integration.
- [x] Reusable deny-by-default per-action permission evaluation contract; [ ] approved role-to-permission matrix and integration into each route/resource repository.
- [ ] Tenant-scoped data access patterns and further concurrency controls for domain tables.
- [x] Low-level transactional session issuance and revoke-all-sessions primitives; [x] verification/recovery token persistence and atomic consumption primitives; [ ] credential hashing/verification policy, login/logout handlers, email delivery/outbox, durable distributed rate-limit enforcement, and route integration.
- [ ] Document upload, quarantine, malware scanning, versioning, and private downloads.
- [ ] Workflow definition validation, publication, immutable versions, and execution state machine.
- [ ] Persistent job queue, leases, retry policy, and worker fencing.
- [ ] Audit persistence and integrity verification; notification outbox and delivery.
- [ ] Exports, retention, legal holds, deletion and backup reconciliation.
- [x] Durable database-backed auth rate-limit enforcement primitives for recovery/verification/login, with hashed subjects.\n- [ ] Operational scheduling/monitoring for outbox draining, rate-limit cleanup, dead-letter review, and delivery telemetry.\n- [ ] OpenAPI contract, pagination, and operational telemetry.
- [ ] Complete Amharic translation catalog, translation-key integration, font/rendering and accessibility review, locale-aware dates/numbers/currency, and localization verification.
- [ ] Dependency/license audit, final license file, CI workflows, and automated verification.

## Migration runner contract

Run `npm run db:migrate` only from the repository root after dependencies are installed and `DATABASE_URL` points to the intended PostgreSQL database. The command is explicit and is never invoked by API startup. It creates a `schema_migrations` ledger, serializes runners with a PostgreSQL advisory lock, verifies SHA-256 checksums for already-applied migrations, and wraps each new migration plus its ledger row in one transaction. If an applied migration's contents change, it stops and requires a new migration file. Review the target database and backup/recovery arrangements before running it.

## Evidence and limitations

- Repository changes are on `feat/document-approval-mvp`; no merge or deployment is authorized.
- No tests, build, typecheck, dependency installation, database connection, or migration execution have been run for this pass.
- PostgreSQL and SMTP transport dependencies are declared in `package.json`; dependency installation and runtime exercise are pending CI evidence.
- The migration runner is source-only and has not been run against a database.\n- The email outbox encrypts payloads with AES-256-GCM using `ABAYFLOW_OUTBOX_ENCRYPTION_KEY`; the SMTP worker requires SMTP environment variables and must be run by an external scheduler. No secrets are committed.
- The API creates a lazy PostgreSQL pool when `DATABASE_URL` is configured and wires the identity adapter into the reserved `/api` request boundary. The pool and middleware have not been exercised against a database.
- F-01/F-02 have source-level credential hashing, token lifecycle, durable rate limiting, encrypted email outbox, and login/session service primitives. No HTTP routes are exposed; source correctness, SMTP delivery, database migrations, and integration behavior remain unverified.
- The adapter remains read/resolution-focused; a separate lifecycle service now provides source-level transactional primitives, but none is exposed through HTTP routes.
- Credential hashing uses versioned scrypt with N=32768, r=8, p=1, 16-byte salt, 64-byte key, minimum 12 Unicode characters, and 1024-byte maximum. Reassess parameters against production latency/capacity before opening routes.
- Tenant membership is not equivalent to permission to perform every action. A deny-by-default evaluator exists, but routes must supply an approved role grant map and tenant-scope resource queries before accessing data.
- Baseline response headers are not a substitute for deployment-level TLS, proxy, or browser security configuration.
- Amharic-first is a confirmed product direction, not a claim that the current scaffold is already translated.
- This remains an initial scaffold, not a complete or production-ready MVP.
