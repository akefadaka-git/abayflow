-- Credential, durable rate limiting, and encrypted email outbox foundation.
-- Apply only through scripts/migrate.mjs after reviewing the target database.

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY,
  payload_ciphertext text NOT NULL CHECK (length(payload_ciphertext) BETWEEN 1 AND 100000),
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  locked_at timestamptz NULL,
  sent_at timestamptz NULL,
  last_error_code text NULL CHECK (last_error_code IS NULL OR length(last_error_code) <= 80),
  CONSTRAINT email_outbox_sent_state_consistent CHECK (
    (status = 'sent' AND sent_at IS NOT NULL) OR (status <> 'sent' AND sent_at IS NULL)
  )
);
CREATE INDEX email_outbox_pending_idx ON email_outbox (available_at, created_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX auth_rate_limit_events_cleanup_idx ON auth_rate_limit_events (occurred_at);

-- Remove old limiter events after the largest currently approved window (24h).
-- Schedule this bounded cleanup query from operations; it is not run automatically.
