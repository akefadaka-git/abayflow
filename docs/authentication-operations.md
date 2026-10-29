# Authentication operations runbook

This runbook documents the source-level authentication foundation. Authentication HTTP routes remain intentionally unregistered until automated verification and database-backed review pass.

## Required runtime secrets

- `DATABASE_URL`: PostgreSQL connection string, supplied through a secret manager. Use TLS and a least-privilege database role in deployment.
- `ABAYFLOW_PUBLIC_APP_URL`: trusted public application base URL. HTTPS is required outside localhost. This URL is used to construct verification and recovery links.
- `ABAYFLOW_OUTBOX_ENCRYPTION_KEY`: exactly 32 random bytes encoded as 64 lowercase hexadecimal characters. The outbox uses AES-256-GCM. Keep this key outside the database and source repository; losing it makes pending messages undecryptable. Key rotation needs a separately designed versioned-key procedure.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: SMTP transport settings stored as deployment secrets/configuration.
- `SMTP_SECURE=true` only when the SMTP endpoint expects implicit TLS (commonly port 465). For submission ports using STARTTLS, leave it false; the transport must require TLS.

Never place secrets, raw bearer tokens, verification/recovery tokens, or credential values in logs, commit messages, CI output, or issue reports.

## Database changes

Migrations `001` through `003` are source files only. Review the database target, backup/recovery plan, migration checksums, and required PostgreSQL version before running `npm run db:migrate`. No migration is run automatically by the API.

## Scheduled operations

- Run `npm run email:drain` from a trusted worker/scheduler at a short interval. It drains up to 20 messages per invocation. Monitor failures and the `dead` state without logging payloads.
- Run `npm run auth:rate-limit-cleanup` at least daily. It removes limiter events older than 24 hours; the longest currently configured window is one hour.
- Alert on repeated worker failures, dead-letter growth, database errors, and SMTP outages. Do not expose a public endpoint for draining the queue.

## Before authentication routes can be opened

1. Obtain a passing GitHub Actions source-verification run for the exact branch head.
2. Apply migrations to a disposable PostgreSQL instance and test constraints, token single-use behavior, concurrent rate-limit checks, recovery/session revocation atomicity, and outbox retry/recovery.
3. Exercise SMTP delivery in a controlled environment with secrets supplied through the secret manager.
4. Review trusted-proxy handling for source IPs, generic HTTP response behavior, login/logout, CSRF/browser storage strategy if applicable, TLS, and operational alerts.
5. Register routes only after the above evidence is recorded; keep all business routes closed until their per-action permission and tenant-scope review is complete.
