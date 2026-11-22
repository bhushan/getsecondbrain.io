/**
 * Workspace schema, one entry per version. Append only: never edit a released entry.
 *
 * Notes are joined by their integer rowid (compact, and the node index for the graph); the public
 * id is a ULID. Text columns that take part in link resolution compare case-insensitively.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE notes (
    rowid INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL COLLATE NOCASE,
    folder TEXT NOT NULL COLLATE NOCASE,
    title TEXT NOT NULL COLLATE NOCASE,
    body TEXT NOT NULL,
    frontmatter TEXT,
    rev INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_seq INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE UNIQUE INDEX notes_path ON notes (path) WHERE deleted_at IS NULL;
  CREATE INDEX notes_title ON notes (title) WHERE deleted_at IS NULL;
  CREATE INDEX notes_recent ON notes (updated_seq) WHERE deleted_at IS NULL;

  CREATE TABLE note_revisions (
    note INTEGER NOT NULL,
    rev INTEGER NOT NULL,
    body TEXT NOT NULL,
    actor TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (note, rev)
  ) WITHOUT ROWID;

  CREATE TABLE links (
    src INTEGER NOT NULL,
    dst_ref TEXT NOT NULL COLLATE NOCASE,
    dst INTEGER,
    embed INTEGER NOT NULL,
    PRIMARY KEY (src, dst_ref)
  ) WITHOUT ROWID;
  CREATE INDEX links_dst ON links (dst) WHERE dst IS NOT NULL;
  CREATE INDEX links_unresolved ON links (dst_ref) WHERE dst IS NULL;

  CREATE TABLE tags (
    note INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (note, tag)
  ) WITHOUT ROWID;
  CREATE INDEX tags_tag ON tags (tag);

  CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, prefix='2 3', tokenize='porter unicode61');
  CREATE VIRTUAL TABLE paths_fts USING fts5(path, tokenize='trigram');

  CREATE TABLE changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    note_id TEXT NOT NULL,
    at INTEGER NOT NULL
  );

  CREATE TABLE audit (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    note_id TEXT,
    at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE layout (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    note_ids TEXT NOT NULL,
    positions BLOB NOT NULL,
    saved_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE sources (
    provider TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    tokens TEXT NOT NULL,
    status TEXT NOT NULL,
    account TEXT,
    user_id TEXT NOT NULL,
    synced_until TEXT,
    last_sync_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL
  ) WITHOUT ROWID;

  CREATE TABLE source_items (
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    rev INTEGER NOT NULL,
    PRIMARY KEY (provider, external_id)
  ) WITHOUT ROWID;
  `,
];
