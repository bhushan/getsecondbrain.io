-- Which workspaces have a source (Granola) connected, so the hourly job knows what to sync.
-- Tokens live sealed inside the workspace object, never here.
CREATE TABLE source_connections (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  provider TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, provider)
) WITHOUT ROWID;
