CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('artist', 'client')),
    preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','ru','sr')),
    contact_channels JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_channels) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(email)) BETWEEN 3 AND 254),
    CHECK (length(trim(display_name)) BETWEEN 2 AND 120)
);
CREATE UNIQUE INDEX app_users_email_unique ON app_users (lower(email));

CREATE TABLE user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_idx ON user_sessions(user_id);

ALTER TABLE artists ADD COLUMN user_id UUID UNIQUE REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE artists ADD COLUMN slug VARCHAR(48) UNIQUE;
ALTER TABLE artists ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE artists ADD COLUMN contact_channels JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE artists ADD COLUMN published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE artists ADD COLUMN accepting_requests BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE artists ADD CONSTRAINT artist_slug_pattern CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE artists ADD CONSTRAINT artist_contacts_object CHECK (jsonb_typeof(contact_channels) = 'object');

ALTER TABLE intake_requests ADD COLUMN client_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE intake_requests ADD COLUMN contact_channels JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_channels) = 'object');
CREATE INDEX intake_requests_client_idx ON intake_requests(client_user_id,created_at DESC);

-- Test fallback: keep uploaded bytes in the persistent PostgreSQL staging DB until R2 is configured.
ALTER TABLE request_attachments ADD COLUMN contents BYTEA;
