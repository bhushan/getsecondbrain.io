-- Control database: accounts, workspaces and sessions. Never holds note content.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  google_sub TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL
);

CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users (id),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workspace_id)
) WITHOUT ROWID;

-- Only the SHA-256 of a session token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_user ON sessions (user_id);
