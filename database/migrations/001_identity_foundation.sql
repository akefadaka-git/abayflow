-- AbayFlow identity foundation (PostgreSQL).
-- Apply only through the reviewed migration runner; the API never auto-runs migrations.
-- IDs are application-generated UUIDs. Recovery and session-lifetime policy remain separate decisions.
-- Transaction boundaries are owned by the migration runner so schema changes and ledger entries commit atomically.

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'recovery_pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT tenant_memberships_roles_no_nulls CHECK (array_position(roles, NULL) IS NULL),
  CONSTRAINT tenant_memberships_unique_account UNIQUE (tenant_id, account_id),
  CONSTRAINT tenant_memberships_revocation_consistent CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL)
  )
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE
    CHECK (length(token_hash) = 64 AND token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT sessions_expiry_after_creation CHECK (absolute_expires_at > created_at),
  CONSTRAINT sessions_last_seen_after_creation CHECK (last_seen_at >= created_at),
  CONSTRAINT sessions_revocation_after_creation CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  )
);

CREATE INDEX sessions_active_account_idx
  ON sessions (account_id, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX tenant_memberships_active_lookup_idx
  ON tenant_memberships (account_id, tenant_id)
  WHERE status = 'active';
