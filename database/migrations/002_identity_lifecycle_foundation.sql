-- AbayFlow identity lifecycle persistence foundation.
-- Apply only through scripts/migrate.mjs after explicit database-target review.
-- Credential hashes are opaque algorithm-encoded values; credential algorithm policy
-- must be selected before any registration/login endpoint is exposed.

ALTER TABLE accounts
  ADD COLUMN email_normalized text NULL,
  ADD COLUMN credential_hash text NULL,
  ADD COLUMN email_verified_at timestamptz NULL;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_email_normalized_format CHECK (
    email_normalized IS NULL OR (
      length(email_normalized) BETWEEN 3 AND 254
      AND email_normalized = lower(trim(email_normalized))
      AND email_normalized !~ '[[:space:]]'
      AND position('@' IN email_normalized) > 1
    )
  ),
  ADD CONSTRAINT accounts_credential_hash_nonempty CHECK (
    credential_hash IS NULL OR length(credential_hash) BETWEEN 1 AND 1024
  ),
  ADD CONSTRAINT accounts_verified_email_required CHECK (
    email_verified_at IS NULL OR email_normalized IS NOT NULL
  );

CREATE UNIQUE INDEX accounts_email_normalized_unique
  ON accounts (email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE TABLE account_tokens (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('email_verification', 'password_recovery')),
  token_hash text NOT NULL UNIQUE
    CHECK (length(token_hash) = 64 AND token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  invalidated_at timestamptz NULL,
  redemption_attempts integer NOT NULL DEFAULT 0 CHECK (redemption_attempts BETWEEN 0 AND 5),
  CONSTRAINT account_tokens_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT account_tokens_terminal_state_exclusive CHECK (
    consumed_at IS NULL OR invalidated_at IS NULL
  ),
  CONSTRAINT account_tokens_consumption_after_creation CHECK (
    consumed_at IS NULL OR consumed_at >= created_at
  ),
  CONSTRAINT account_tokens_invalidation_after_creation CHECK (
    invalidated_at IS NULL OR invalidated_at >= created_at
  )
);

CREATE INDEX account_tokens_active_lookup_idx
  ON account_tokens (account_id, purpose, expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE auth_rate_limit_events (
  id uuid PRIMARY KEY,
  dimension text NOT NULL CHECK (dimension IN ('account_email', 'source_ip', 'token')),
  subject_hash text NOT NULL CHECK (length(subject_hash) = 64 AND subject_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_rate_limit_window_idx
  ON auth_rate_limit_events (dimension, subject_hash, occurred_at);

CREATE TABLE identity_audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  subject_account_id uuid NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  membership_id uuid NULL REFERENCES tenant_memberships(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'membership_revoked', 'membership_suspended', 'account_suspended',
    'sessions_revoked', 'email_verified', 'credential_recovered'
  )),
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX identity_audit_events_tenant_time_idx
  ON identity_audit_events (tenant_id, occurred_at DESC);
CREATE INDEX identity_audit_events_subject_time_idx
  ON identity_audit_events (subject_account_id, occurred_at DESC);
