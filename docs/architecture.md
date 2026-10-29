# Architecture baseline

Status: implementation scaffold; not production-ready.

## Initial shape

- TypeScript API process with a deliberately minimal HTTP surface.
- PostgreSQL remains the initial database candidate, subject to compatibility review.
- Private object/file storage and a persistent worker are planned but not implemented.
- Business routes must not be exposed before session authentication, tenant resolution, authorization, and audit contracts are implemented and reviewed.

## Document approval MVP

1. Authenticate a user using server-managed sessions.
2. Resolve organization membership from trusted server-side state; fail closed if tenant context is absent or ambiguous.
3. Upload document content into private quarantine storage; validate content and run required security checks before making it available.
4. Create immutable document versions and versioned workflow definitions.
5. Start an execution pinned to a published workflow version.
6. Assign review tasks and record one decision per task.
7. Commit the decision, state transition, audit event, and notification intent consistently where feasible.
8. Preserve terminal outcomes; corrections create linked executions rather than rewriting history.

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

The F-01–F-17 contract-freeze register remains authoritative. In particular, session/recovery policy, upload scanning behavior, workflow schema dialect, API pagination/rate limits, hosting recovery targets, and acceptance evidence still require Owner decisions. The current scaffold does not resolve these questions.
