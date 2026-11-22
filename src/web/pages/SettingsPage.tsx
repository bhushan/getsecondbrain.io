import { type FormEvent, useEffect, useState } from "react";
import { api, ApiError, type DeletedWorkspace, type Me } from "../api";
import { PageHeader } from "./PageHeader";

const RESTORE_DAYS = 30;
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const problem = (cause: unknown, fallback: string) => (cause instanceof ApiError ? cause.message : fallback);

/** Settings for the current workspace (rename, delete, restore) and the signed-in account. */
export function SettingsPage({
  me,
  onRenamed,
  onDeleted,
  onRestored,
}: {
  me: Me;
  onRenamed(): void;
  onDeleted(): void;
  onRestored(id: string): void;
}) {
  const workspace = me.workspaces.find((item) => item.id === me.workspaceId)!;
  const only = me.workspaces.length < 2;

  return (
    <main className="page page-settings">
      <PageHeader title="Settings">Change the name of this workspace, delete it, or bring back one you deleted.</PageHeader>
      <RenameWorkspace key={workspace.id} name={workspace.name} onRenamed={onRenamed} />
      <DeleteWorkspace key={`delete-${workspace.id}`} name={workspace.name} only={only} onDeleted={onDeleted} />
      <RecentlyDeleted onRestored={onRestored} />

      <section className="pg-section" aria-labelledby="account-title">
        <h2 id="account-title">Account</h2>
        <div className="settings-card settings-account">
          <div className="list-text">
            <strong>{me.user.name}</strong>
            <span>{me.user.email}</span>
          </div>
          <form method="post" action="/auth/logout">
            <button type="submit" className="btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function RenameWorkspace({ name, onRenamed }: { name: string; onRenamed(): void }) {
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ error?: string; saved?: boolean }>({});
  const changed = draft.trim() !== "" && draft.trim() !== name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    setBusy(true);
    try {
      await api.renameWorkspace(draft.trim());
      setStatus({ saved: true });
      onRenamed();
    } catch (cause) {
      setStatus({ error: problem(cause, "Could not rename the workspace. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pg-section" aria-labelledby="rename-title">
      <h2 id="rename-title">Workspace name</h2>
      <form className="settings-card settings-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Name</span>
          <input value={draft} maxLength={80} required onChange={(event) => (setDraft(event.target.value), setStatus({}))} />
          <small>Connected apps and the workspace menu show this name.</small>
        </label>
        <div className="settings-actions">
          {status.error && (
            <p className="form-error" role="alert">
              {status.error}
            </p>
          )}
          {status.saved && !changed && (
            <p className="muted settings-note" role="status">
              Renamed.
            </p>
          )}
          <button type="submit" className="primary" disabled={!changed || busy}>
            Save name
          </button>
        </div>
      </form>
    </section>
  );
}

function DeleteWorkspace({ name, only, onDeleted }: { name: string; only: boolean; onDeleted(): void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (typed !== name) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteWorkspace(typed);
      onDeleted();
    } catch (cause) {
      setError(problem(cause, "Could not delete the workspace. Try again."));
      setBusy(false);
    }
  };

  return (
    <section className="pg-section" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete this workspace</h2>
      <div className="settings-card settings-danger">
        <p>
          Deleting <strong>{name}</strong> hides it and its notes at once and disconnects every app connected to it. You can restore it here for{" "}
          {RESTORE_DAYS} days. After that its notes, revisions and skills are erased for good.
        </p>
        {only ? (
          <p className="muted">This is your only workspace. Create another one from the workspace menu before you delete this one.</p>
        ) : !open ? (
          <button type="button" className="danger" onClick={() => setOpen(true)}>
            Delete workspace
          </button>
        ) : (
          <form className="settings-confirm" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>
                Type <strong>{name}</strong> to confirm
              </span>
              <input value={typed} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setTyped(event.target.value)} />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="settings-actions">
              <button type="button" onClick={() => (setOpen(false), setTyped(""), setError(null))} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="danger" disabled={typed !== name || busy}>
                Delete {name}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function RecentlyDeleted({ onRestored }: { onRestored(id: string): void }) {
  const [deleted, setDeleted] = useState<DeletedWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void api.deletedWorkspaces().then(({ workspaces }) => setDeleted(workspaces), () => setDeleted([])), []);
  if (!deleted?.length) return null;

  const restore = async (id: string) => {
    try {
      await api.restoreWorkspace(id);
      onRestored(id);
    } catch (cause) {
      setError(problem(cause, "Could not restore the workspace. Try again."));
    }
  };

  return (
    <section className="pg-section" aria-labelledby="deleted-title">
      <h2 id="deleted-title">Recently deleted</h2>
      <p className="muted">Restoring brings back the workspace and all its notes. Connect your apps to it again afterwards.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="list-card">
        {deleted.map((workspace) => (
          <li key={workspace.id}>
            <div className="list-text">
              <strong>{workspace.name}</strong>
              <span>Erased for good on {day(workspace.eraseAt)}</span>
            </div>
            <button type="button" className="btn-sm" onClick={() => void restore(workspace.id)}>
              Restore
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
