/** A source that sends notes in, such as Granola. Never carries a token. */
export interface Source {
  provider: string;
  status: "active" | "reconnect";
  account: string | null;
  connectedAt: number;
  lastSyncAt: number | null;
  lastError: string | null;
  notes: number;
}

export type SyncResult =
  | { status: "ok"; created: number; updated: number; unchanged: number; skipped: number; adopted?: number }
  | { status: "reconnect" }
  | { status: "error"; error: string }
  | { status: "not_connected" };
