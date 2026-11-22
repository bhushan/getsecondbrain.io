import type { LimitName } from "./limits";

/** Who made a change: the signed-in user, or an app connected over MCP on their behalf. */
export interface Actor {
  kind: "user" | "app";
  /** User id. */
  id: string;
  /** Connected app (OAuth client) name, when kind is "app". */
  app?: string;
}

export interface NoteMeta {
  id: string;
  path: string;
  title: string;
  rev: number;
  createdAt: number;
  updatedAt: number;
}

export interface Note extends NoteMeta {
  body: string;
}

export interface SaveInput {
  path: string;
  body: string;
  /** When set, the save only applies if the note is at this revision. 0 means "create only". */
  expectedRev?: number;
  actor: Actor;
}

export type SaveResult =
  | { status: "created" | "updated" | "unchanged"; note: NoteMeta }
  /** The note moved on since `expectedRev`; `note` is its current state. */
  | { status: "conflict"; note: NoteMeta }
  /** `expectedRev` was above 0 but there is no note at that path. */
  | { status: "not_found" }
  /** The workspace is at a fair-use limit (see limits.ts). Nothing was written. */
  | { status: "limit"; limit: LimitName };

export type RenameResult =
  | { status: "renamed"; note: NoteMeta }
  | { status: "exists" }
  | { status: "not_found" }
  | { status: "limit"; limit: LimitName };

/** A skill as listed: everything but its instructions. */
export interface SkillSummary {
  path: string;
  /** Unique, prompt-safe name, for example "writing-blog-post". */
  slug: string;
  name: string;
  description: string;
  bundle: string | null;
}

export interface SkillDetail extends SkillSummary {
  instructions: string;
}

export interface Revision {
  rev: number;
  body: string;
  actor: Actor;
  at: number;
}

export interface OutgoingLink {
  ref: string;
  embed: boolean;
  /** Null while the target note does not exist. */
  id: string | null;
  path: string | null;
}

export interface LinkedNote extends NoteMeta {
  depth: number;
}

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  snippet: string;
}

export interface Change {
  seq: number;
  kind: "upsert" | "rename" | "trash" | "restore";
  noteId: string;
  at: number;
}

export interface Stats {
  notes: number;
  links: number;
  unresolved: number;
  tags: number;
  /** Sequence number of the latest change; the cursor for `changesSince`. */
  seq: number;
}

/** The whole link graph in compact form. Node i is `ids[i]`; edge k joins `edges[2k]` to `edges[2k+1]`. */
export interface Graph {
  seq: number;
  layoutAt: number;
  ids: string[];
  paths: string[];
  edges: number[];
  /** Saved x, y per node (`positions[2i]`, `positions[2i+1]`), or null where a node has none yet. */
  positions: (number | null)[];
}
