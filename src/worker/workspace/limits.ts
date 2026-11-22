/**
 * Fair-use limits for open sign-up. They sit well above one heavy user (the founder's vault is about
 * 300 notes and a few MB; a whole-vault import is a few hundred saves) and keep one workspace from
 * using up the account's shared Cloudflare allowance. Reading, trashing and deleting forever are
 * never limited, so a workspace at a limit can always make room.
 */
export interface Limits {
  /** Notes in the workspace, trashed ones included until they are deleted forever. */
  notes: number;
  /** Size of the workspace's database: notes, revisions, search index and activity. */
  bytes: number;
  /** Saves and renames per UTC day, by the user and their apps together. */
  writesPerDay: number;
}

export const DEFAULT_LIMITS: Limits = {
  notes: 10_000,
  bytes: 200 * 1024 * 1024,
  writesPerDay: 2_000,
};

/** Workspaces one person can own at a time, deleted ones waiting for erase not counted. */
export const MAX_WORKSPACES = 10;

export type LimitName = "notes" | "storage" | "writes";

export interface Usage {
  notes: number;
  bytes: number;
  writesToday: number;
  limits: Limits;
}

/** Words for a refused save, shown to people and to apps. */
export function limitMessage(limit: LimitName): string {
  switch (limit) {
    case "notes":
      return "This workspace has reached its note limit. Delete notes forever from the trash to make room.";
    case "storage":
      return "This workspace has reached its storage limit. Delete notes forever from the trash to make room.";
    case "writes":
      return "This workspace has reached today's limit on saves. Saving works again after midnight UTC.";
  }
}
