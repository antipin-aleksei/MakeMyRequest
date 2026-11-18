ALTER TABLE artists ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Berlin';
CREATE TABLE artist_working_hours (
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    CHECK (start_time < end_time),
    PRIMARY KEY(artist_id, weekday, start_time)
);
CREATE INDEX artist_working_hours_by_artist ON artist_working_hours (artist_id, weekday);
ALTER TABLE intake_requests ADD COLUMN availability_preferences JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(availability_preferences) = 'array');
ALTER TABLE intake_requests ADD COLUMN claim_token_hash TEXT;
