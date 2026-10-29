# Security contract decisions: F-01 and F-02

Status: Owner-directed MVP policy decisions recorded 2026-10-29. These are application security defaults for the initial MVP, not a claim of external security certification.

## F-01 — Account verification and recovery

**Decision: verified email is the only initial account-verification and account-recovery channel.** SMS, phone-based recovery, support-assisted identity override, and administrator bypass are out of scope until separately reviewed.

### Verification
- An account cannot establish an authenticated session until its email address is verified.
- Verification uses a cryptographically random, single-use token; persist only a cryptographic hash of the token.
- Verification tokens expire after 24 hours. Reissuing a token invalidates any earlier outstanding verification token for the same account.
- Responses do not disclose whether an email address belongs to an account. Apply throttling by normalized account/email key and source IP.
- Email changes require recent reauthentication and verification of the new address before it becomes the account's recovery address.

### Recovery
- Recovery may be initiated only through the account's already-verified email address.
- Recovery tokens are cryptographically random, single-use, stored only as hashes, and expire after 30 minutes. Issuing a new token invalidates earlier outstanding recovery tokens for the account.
- Request and redemption responses must not reveal whether an account exists, is suspended, or is eligible for recovery.
- Apply rate limits at both account/email and source-IP dimensions. Initial ceiling: 5 recovery requests per normalized account/email per hour, 20 per source IP per hour, and 5 token-redemption attempts per token. Return a generic response when throttled; do not send email synchronously in the request path.
- A successful recovery requires a new credential to be set, consumes the token atomically, and revokes every active session for the account in the same database transaction. Previously issued recovery tokens are invalidated.
- Recovery never changes tenant membership, roles, ownership, or administrative privileges.
- If the verified email channel is unavailable, recovery fails closed. No support or platform-admin override exists in the MVP contract.

### Implementation status
Policy and source primitives now exist for scrypt credential hashing (`scrypt$v1$32768$8$1$...`, random 16-byte salt, 64-byte derived key, minimum 12 Unicode characters, maximum 1024 UTF-8 bytes), verification/recovery token issuance and consumption, PostgreSQL-backed rate limits, and an encrypted SMTP outbox. Recovery requests are capped at 5 per normalized email and 20 per source IP per hour; token redemption is capped at 5 attempts per token. Login attempts use an additional conservative source contract of 10 per normalized email and 30 per source IP per 15 minutes. Email delivery is asynchronous via the outbox worker. These source changes have not yet passed automated verification or database-backed integration tests. Do not expose registration, login, verification, or recovery routes until verification succeeds and the source review is closed. Token hashes, rate limits, delivery failures, and session revocations must be auditable without logging raw tokens or credentials.

## F-02 — Session lifetime and concurrency

**Decision: 30-minute idle timeout and 12-hour absolute lifetime.** Both limits apply; whichever expires first ends the session.

- Multiple concurrent sessions are allowed, so users can use multiple devices. Each session has an independent opaque bearer secret and revocation state.
- Session secrets must be generated using a cryptographically secure random source with at least 256 bits of entropy. Persist only SHA-256 hashes of the bearer secrets; never log or return stored hashes.
- Idle timeout is 30 minutes from the last successfully authenticated API request. A successful authenticated request advances `last_seen_at` monotonically; failed authentication does not refresh activity.
- Absolute expiry is fixed at session issuance to 12 hours after creation. Activity does not extend the absolute expiry.
- Every request must reject revoked, idle-expired, absolute-expired, unknown, malformed, or account-ineligible sessions. Invalid timestamps fail closed.
- A normal logout revokes that session. Password recovery, credential compromise response, or account suspension revokes all sessions for the account.
- Reauthentication is required before changing credentials or recovery email, changing authentication factors, and performing future high-impact security/ownership actions. Individual high-impact action authorization remains to be specified with those domain contracts.
- No “remember me” extension, refresh-token extension, session lifetime exception, or platform-admin bypass is enabled in the MVP.

### Implementation status
The resolver enforces the persisted absolute expiry and the selected idle-timeout policy. The API's reserved `/api` namespace is wired through the identity boundary, and a successful authorization records session activity. Session issuance, credential verification, login/logout endpoints, revoke-all-sessions, high-risk reauthentication, and automated verification are **not implemented**. No business routes are exposed.

## Authenticated request boundary

- `Authorization: Bearer <opaque-token>` authenticates a session; `X-Tenant-Id` is only a tenant selector, never proof of access.
- The API requires an active account, unrevoked/unexpired session, active membership, and active tenant before allowing the request to proceed to route dispatch.
- Missing/invalid credentials return 401; missing tenant selector returns 400; denied tenant/account access returns 403; identity persistence failure returns 503.
- The current `/api` namespace intentionally returns 404 after successful authentication because no business routes are registered. This verifies the boundary placement without exposing business functionality.
- Tenant membership does not grant action permissions. Each future route must authorize the specific action and scope resource queries by the verified tenant before reading or mutating data.
- Health liveness is public. Readiness checks database reachability and remains 503 if the database is not configured or unavailable.
- No database migration, database connection test, test suite, build, typecheck, or deployment was performed as part of recording these source changes.

## Remaining Owner/security gates

These decisions close F-01 and F-02 policy selection, not their full implementation. F-04 membership revocation, permission/action matrix, database TLS/secret delivery, audit persistence, rate-limit storage and distributed enforcement, credential algorithm, and high-impact action list remain separate contracts. They must be resolved before relevant production capabilities are exposed.
