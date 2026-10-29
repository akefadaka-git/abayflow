# AbayFlow

Open-Source Workflow Automation.

> Open by design. Trusted by people.

AbayFlow is an open-source workflow automation project. The first MVP focuses on secure document intake and approval for organizations, with self-hosted deployment as a first-class goal.

## Product language: Amharic-first, globally usable

AbayFlow is designed **Amharic-first for Ethiopian users**, while remaining usable by people and organizations worldwide.

- Amharic (`am`) is the primary product-language target for initial user journeys, especially document intake, review, approval, notifications, and help.
- English (`en`) is supported as a secondary language for international teams and technical administration.
- Language must be independent of tenant, user role, and authorization; changing language must never grant or remove permissions.
- User-facing text should use translation keys rather than hard-coded strings. Dates, numbers, and currency must use explicit locale-aware formatting, with Ethiopian calendar support assessed for relevant workflows.
- Ethiopian names, organization names, phone-number entry, and document metadata must be handled without assuming English-only formats.
- Amharic-first is a product requirement; a complete translation catalog, font/rendering review, accessibility review, and end-to-end localization verification are not yet implemented.

## Status

Early implementation scaffold. Not production-ready; security, retention, recovery, API, and deployment contracts remain subject to the Owner-approved planning decisions and verification.

## MVP scope

- Organization membership and tenant-scoped access
- Private document intake and versioned metadata
- Versioned workflow definitions and execution records
- Assigned review tasks and approve/reject/request-changes decisions
- Notifications, audit history, and authorized exports
- Persistent jobs with controlled retries
- Self-hosting, backup, restore, and security documentation

## Security baseline

- Enforce authorization server-side on every request.
- Fail closed when tenant context or access checks are missing.
- Treat file paths and URLs as references, never as authorization.
- Keep published workflow versions immutable and pin each execution to a version.
- Preserve decisions and audit history; corrections use linked executions.
- Do not claim compliance certification or production readiness without independent evidence.

## License

MIT is the intended license, pending dependency and license audit. Until that audit and a LICENSE file are complete, licensing is not finalized.

## Development

Implementation is in progress. Do not use this scaffold for production workloads.
