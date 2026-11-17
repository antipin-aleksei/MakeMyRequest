CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE request_kind AS ENUM ('consultation', 'session');
CREATE TYPE request_status AS ENUM ('new', 'in_review', 'needs_info', 'accepted', 'declined');

CREATE TABLE artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(120) NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE intake_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artists(id),
    kind request_kind NOT NULL,
    status request_status NOT NULL DEFAULT 'new',
    client_name VARCHAR(120) NOT NULL,
    contact_email VARCHAR(254) NOT NULL,
    description TEXT NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version > 0),
    preferred_at TIMESTAMPTZ,
    consent_to_contact BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(client_name)) > 0),
    CHECK (length(description) BETWEEN 10 AND 5000),
    CHECK (jsonb_typeof(answers) = 'object'),
    CHECK (consent_to_contact = true),
    CHECK (kind = 'session' OR preferred_at IS NULL)
);

CREATE INDEX idx_intake_requests_artist_created ON intake_requests (artist_id, created_at DESC);
CREATE INDEX idx_intake_requests_artist_status ON intake_requests (artist_id, status);

-- Development-only initial artist. Replace via admin tooling before production.
INSERT INTO artists (display_name, bio)
VALUES ('Tattoo artist', 'Авторские татуировки и индивидуальные проекты.');
