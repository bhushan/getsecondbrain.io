import { useEffect, useState } from "react";
import { api, ApiError, type Source } from "../api";
import { ImportVault } from "./ImportVault";
import { PageHeader } from "./PageHeader";
import { callbackMessage, sourceLine, syncMessage } from "./sourceText";

type Notice = { kind: "ok" | "error"; text: string } | null;

/** Tools that send notes in: Granola today, and the one-time vault import. */
export function SourcesPage({ onChanged }: { onChanged(): void }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const granola = sources?.find((source) => source.provider === "granola");

  const load = () => api.sources().then(({ sources }) => setSources(sources));

  async function sync() {
    setBusy("sync");
    try {
      const result = await api.syncGranola();
      setNotice({ kind: result.status === "ok" ? "ok" : "error", text: syncMessage(result) });
      onChanged();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof ApiError ? error.message : "Could not sync. Check your connection." });
    } finally {
      setBusy(null);
      void load();
    }
  }

  useEffect(() => {
    // Back from Granola: say how it went, tidy the address, and run the first sync straight away.
    const back = callbackMessage(location.search);
    if (back) {
      setNotice(back);
      history.replaceState(null, "", location.pathname);
    }
    void load().then(() => {
      if (back?.kind === "ok") void sync();
    });
  }, []);

  async function connect() {
    setBusy("connect");
    try {
      location.assign((await api.connectGranola()).url);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof ApiError ? error.message : "Could not start connecting Granola." });
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await api.disconnectGranola();
      setNotice({ kind: "ok", text: "Granola is disconnected. Notes it brought in stay in your workspace." });
    } finally {
      setBusy(null);
      void load();
    }
  }

  return (
    <main className="page page-sources">
      <PageHeader eyebrow="Sources" title="Bring notes in from your tools">
        Connect a tool once and its notes arrive here on their own, linked into your map. Every AI app you connect can then search them.
      </PageHeader>

      {notice && (
        <p className="callout" data-kind={notice.kind} role="status">
          {notice.text}
        </p>
      )}

      <section className="pg-section" aria-labelledby="meetings-title">
        <h2 id="meetings-title">Meeting notes</h2>
        <p className="muted">New and edited notes come in every hour, into the Meetings folder. A note you edit or trash here is never overwritten.</p>
        <ul className="list-card">
          <li>
            <span className="app-mark app-mark-md source-mark" aria-hidden="true">
              G
            </span>
            <div className="list-text">
              <strong>Granola</strong>
              <span>
                {sources === null
                  ? "Loading…"
                  : granola
                    ? sourceLine(granola)
                    : "Your Granola meeting summaries and notes. The free Granola plan shares the last 30 days."}
              </span>
            </div>
            {sources !== null && !granola && (
              <button type="button" className="primary btn-sm" disabled={busy !== null} onClick={() => void connect()}>
                {busy === "connect" ? "Opening Granola…" : "Connect"}
              </button>
            )}
            {granola?.status === "reconnect" && (
              <button type="button" className="primary btn-sm" disabled={busy !== null} onClick={() => void connect()}>
                Reconnect
              </button>
            )}
            {granola?.status === "active" && (
              <button type="button" className="btn-sm" disabled={busy !== null} onClick={() => void sync()}>
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
            )}
            {granola && (
              <button type="button" className="danger btn-sm" disabled={busy !== null} onClick={() => void disconnect()}>
                Disconnect
              </button>
            )}
          </li>
        </ul>
        <p className="muted pg-small">Coming next: Fireflies and your calendar.</p>
      </section>

      <ImportVault onDone={onChanged} />
    </main>
  );
}
