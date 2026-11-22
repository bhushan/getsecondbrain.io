import { useEffect, useState } from "react";
import { api, type AuditEntry } from "../api";
import { dayLabel, describeAction } from "./activityText";
import { AppMark } from "./AppMark";
import { appIdForName } from "./appForName";
import { PageHeader } from "./PageHeader";
import { timeOfDay, when } from "./when";

/** Entries in order, split wherever the day changes. */
function byDay(entries: AuditEntry[]): { day: string; entries: AuditEntry[] }[] {
  const groups: { day: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const day = dayLabel(entry.at);
    if (groups.at(-1)?.day !== day) groups.push({ day, entries: [] });
    groups.at(-1)!.entries.push(entry);
  }
  return groups;
}

function Actor({ entry }: { entry: AuditEntry }) {
  if (entry.actor.kind === "app") return <AppMark id={appIdForName(entry.actor.app ?? "")} size="sm" />;
  return (
    <span className="app-mark app-mark-sm actor-you" aria-hidden="true">
      You
    </span>
  );
}

export function ActivityPage({ onOpen }: { onOpen(id: string): void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => void api.activity().then(({ entries }) => setEntries(entries)), []);
  return (
    <main className="page page-activity">
      <PageHeader title="Activity">
        What you and your connected apps did in this workspace, newest first.
      </PageHeader>
      {entries?.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          </span>
          <strong>Nothing yet.</strong>
          <p>When you or a connected app saves, edits or searches notes, it shows up here.</p>
        </div>
      )}
      {entries &&
        byDay(entries).map((group) => (
          <section key={group.day} className="timeline-day" aria-label={group.day}>
            <h2>{group.day}</h2>
            <ol className="timeline">
              {group.entries.map((entry, index) => (
                <li key={index}>
                  <Actor entry={entry} />
                  <p>
                    <strong>{entry.actor.kind === "app" ? entry.actor.app : "You"}</strong> {describeAction(entry.action)}{" "}
                    {entry.noteId && (
                      <button type="button" className="pg-link" onClick={() => onOpen(entry.noteId!)}>
                        a note
                      </button>
                    )}
                  </p>
                  <time dateTime={new Date(entry.at).toISOString()} title={when(entry.at)}>
                    {timeOfDay(entry.at)}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        ))}
    </main>
  );
}
