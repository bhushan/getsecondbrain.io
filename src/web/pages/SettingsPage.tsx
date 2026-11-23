import { type FormEvent, useEffect, useState } from "react";
import { api, ApiError, type DeletedWorkspace, type Me, type Usage } from "../api";
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
      <PageHeader title="Settings">Rename or delete this workspace, see its usage, bring back one you deleted, or delete your account.</PageHeader>
      <RenameWorkspace key={workspace.id} name={workspace.name} onRenamed={onRenamed} />
      <DeleteWorkspace key={`delete-${workspace.id}`} name={workspace.name} only={only} onDeleted={onDeleted} />
      <RecentlyDeleted onRestored={onRestored} />
      <WorkspaceUsage key={`usage-${workspace.id}`} />

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
      <DeleteAccount email={me.user.email} />
    </main>
  );
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: bytes < 10 * 1024 * 1024 ? 1 : 0 })} MB`;

/** How much of its fair-use limits this workspace uses. */
function WorkspaceUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => void api.usage().then(setUsage, () => setUsage(null)), []);
  if (!usage) return null;
  const rows: [string, number, number, string, string][] = [
    ["Notes", usage.notes, usage.limits.notes, usage.notes.toLocaleString(), usage.limits.notes.toLocaleString()],
    ["Storage", usage.bytes, usage.limits.bytes, megabytes(usage.bytes), megabytes(usage.limits.bytes)],
    ["Saves today", usage.writesToday, usage.limits.writesPerDay, usage.writesToday.toLocaleString(), usage.limits.writesPerDay.toLocaleString()],
  ];
  return (
    <section className="pg-section" aria-labelledby="usage-title">
      <h2 id="usage-title">Usage</h2>
      <p className="muted">Fair-use limits for this workspace. Trashed notes count until you delete them forever. Saves reset at midnight UTC.</p>
      <ul className="settings-card usage-list">
        {rows.map(([label, used, limit, usedText, limitText]) => (
          <li key={label}>
            <span className="usage-label">{label}</span>
            <meter min={0} max={limit || 1} value={Math.min(used, limit)} high={limit * 0.8} optimum={0} aria-label={`${label}: ${usedText} of ${limitText}`} />
            <span className="usage-value">
              {usedText} <span className="muted">of {limitText}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(typed.trim());
      location.assign("/");
    } catch (cause) {
      setError(problem(cause, "Could not delete your account. Try again."));
      setBusy(false);
    }
  };

  return (
    <section className="pg-section" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">Delete your account</h2>
      <div className="settings-card settings-danger">
        <p>
          This erases every workspace you own, with all their notes, revisions and skills, disconnects every app and signs you out. It happens at once and
          cannot be undone. Workspaces other people own stay as they are.
        </p>
        {!open ? (
          <button type="button" className="danger" onClick={() => setOpen(true)}>
            Delete account
          </button>
        ) : (
          <form className="settings-confirm" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>
                Type <strong>{email}</strong> to confirm
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
              <button type="submit" className="danger" disabled={!matches || busy}>
                Delete account for good
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
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
