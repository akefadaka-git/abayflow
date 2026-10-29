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
- [x] Tenant-scope comparison guard for use by tenant-scoped data access.
- [x] Amharic-first product direction documented, with English as a secondary language and localization requirements identified.
- [x] Architecture and security-gate documentation.

## Not implemented or not yet integrated

- [ ] Authoritative database adapters for users, sessions, memberships, and revocation.
- [ ] HTTP middleware wiring the identity resolver into every business route.
- [ ] Approved session idle/absolute expiry policy (F-02 remains open); the resolver requires a policy implementation.
- [ ] Account verification/recovery contract and implementation (F-01 remains open).
- [ ] Membership-removal transaction, pending-task handling, and cross-session/API/download revocation integration (F-04 remains open).
- [ ] Tenant-scoped database constraints, migrations, and concurrency controls.
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
- No tests, build, dependency installation, or deployment have been run for this pass.
- Identity resolution is source code only: without an authoritative repository adapter and HTTP middleware wiring, it does not yet enforce production request authorization.
- The tenant ID is a membership-checked selector, not proof of access. Every data query must still be tenant-scoped.
- Baseline response headers are not a substitute for deployment-level TLS, proxy, or browser security configuration.
- Amharic-first is a confirmed product direction, not a claim that the current scaffold is already translated.
- This remains an initial scaffold, not a complete or production-ready MVP.
