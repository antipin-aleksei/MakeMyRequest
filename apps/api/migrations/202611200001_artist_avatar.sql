ALTER TABLE artists ADD COLUMN avatar_bytes BYTEA;
ALTER TABLE artists ADD COLUMN avatar_media_type TEXT;
ALTER TABLE artists ADD CONSTRAINT artist_avatar_media CHECK (avatar_media_type IS NULL OR avatar_media_type IN ('image/jpeg','image/png','image/webp'));
ALTER TABLE artists ADD CONSTRAINT artist_avatar_size CHECK (avatar_bytes IS NULL OR octet_length(avatar_bytes) <= 2097152);
