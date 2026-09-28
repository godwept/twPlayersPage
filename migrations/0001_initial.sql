PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  jersey_number TEXT,
  featured_photo_id TEXT,
  crop_x REAL NOT NULL DEFAULT 0.5 CHECK (crop_x BETWEEN 0 AND 1),
  crop_y REAL NOT NULL DEFAULT 0.5 CHECK (crop_y BETWEEN 0 AND 1),
  crop_zoom REAL NOT NULL DEFAULT 1 CHECK (crop_zoom BETWEEN 1 AND 4),
  created_at TEXT NOT NULL,
  FOREIGN KEY (featured_photo_id) REFERENCES photos(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  original_key TEXT NOT NULL UNIQUE,
  display_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  crc32 INTEGER NOT NULL DEFAULT 0 CHECK (crc32 BETWEEN 0 AND 4294967295),
  uploaded_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'deleting'))
);

CREATE INDEX IF NOT EXISTS photos_player_gallery
  ON photos (player_id, uploaded_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS photos_sha256 ON photos (sha256);

CREATE TABLE IF NOT EXISTS upload_staging (
  upload_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('original', 'display')),
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  crc32 INTEGER NOT NULL DEFAULT 0 CHECK (crc32 BETWEEN 0 AND 4294967295),
  content_type TEXT NOT NULL CHECK (content_type = 'image/jpeg'),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (upload_id, kind)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  address_key TEXT PRIMARY KEY NOT NULL,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX IF NOT EXISTS login_attempts_window ON login_attempts (window_started_at);

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  banner_key TEXT,
  logo_key TEXT,
  banner_position_x REAL NOT NULL DEFAULT 0.5 CHECK (banner_position_x BETWEEN 0 AND 1),
  banner_position_y REAL NOT NULL DEFAULT 0.5 CHECK (banner_position_y BETWEEN 0 AND 1),
  updated_at TEXT
);
