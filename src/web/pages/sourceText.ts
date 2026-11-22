import type { Source, SyncResult } from "../sourceTypes";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "5 minutes ago", "2 hours ago", "3 days ago". */
export function ago(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.round(hours / 24), "day")} ago`;
}

/** One line under a connected source. */
export function sourceLine(source: Source, now = Date.now()): string {
  if (source.status === "reconnect") return `Granola stopped sharing notes. Reconnect to keep syncing; your ${plural(source.notes, "note")} stay.`;
  const who = source.account ? `Connected as ${source.account}.` : "Connected.";
  if (source.lastSyncAt === null) return `${who} First sync starting.`;
  return `${who} ${plural(source.notes, "note")}, last synced ${ago(source.lastSyncAt, now)}.`;
}

export function syncMessage(result: SyncResult): string {
  if (result.status === "reconnect") return "Granola stopped sharing notes. Reconnect Granola to keep syncing.";
  if (result.status === "not_connected") return "Granola is not connected.";
  if (result.status === "error") return "Could not reach Granola. It will try again within the hour.";
  if (!result.created && !result.updated && !result.skipped) return "Up to date. No new meeting notes.";
  const counts = `${result.created} new and ${result.updated} updated meeting notes.`;
  return result.skipped ? `${counts} ${result.skipped} left as they are, because you edited or trashed them.` : counts;
}

/** What to say when Granola sends the browser back to the Sources page. */
export function callbackMessage(search: string): { kind: "ok" | "error"; text: string } | null {
  const params = new URLSearchParams(search);
  if (params.get("connected") === "granola") return { kind: "ok", text: "Granola is connected. Bringing in your meeting notes…" };
  const error = params.get("error");
  if (error === "denied") return { kind: "error", text: "Granola was not connected, because access was not allowed." };
  if (error === "expired") return { kind: "error", text: "That sign-in took too long. Try connecting again." };
  if (error) return { kind: "error", text: "Granola did not finish the sign-in. Try connecting again." };
  return null;
}
