ALTER TABLE intake_requests ADD COLUMN upload_token_hash TEXT;
CREATE TABLE request_attachments (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES intake_requests(id) ON DELETE CASCADE,
    filename VARCHAR(120) NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX request_attachments_request_idx ON request_attachments(request_id);
CREATE OR REPLACE FUNCTION enforce_attachment_count() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM intake_requests WHERE id = NEW.request_id FOR UPDATE;
  IF (SELECT count(*) FROM request_attachments WHERE request_id = NEW.request_id) >= 3 THEN
    RAISE EXCEPTION 'only three attachments allowed' USING ERRCODE = '23514', CONSTRAINT = 'request_attachments_max_three';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER request_attachment_limit BEFORE INSERT ON request_attachments
FOR EACH ROW EXECUTE FUNCTION enforce_attachment_count();
