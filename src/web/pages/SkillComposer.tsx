import { type FormEvent, useId, useState } from "react";
import { composeSkill, parseSkillText, skillNotePath } from "../../worker/lib/skills";
import { api, ApiError } from "../api";

export interface SkillDraft {
  name: string;
  bundle: string;
  description: string;
  instructions: string;
  /** Set when editing a saved skill. */
  saved?: { id: string; path: string; rev: number };
}

export const EMPTY_DRAFT: SkillDraft = { name: "", bundle: "", description: "", instructions: "" };

export const EXAMPLE_DRAFT: SkillDraft = {
  name: "Meeting notes",
  bundle: "Work",
  description: "Turn a meeting transcript or rough notes into a short summary. Use when the user shares notes from a meeting.",
  instructions: [
    "1. Start with one line: what the meeting decided.",
    "2. List each decision with who owns it and the date, if one was given.",
    "3. List open questions separately.",
    "4. Keep it under 200 words. No filler, no recap of who attended.",
    "5. Offer to save the summary to Second Brain under Meetings/ with today's date.",
  ].join("\n"),
};

/** Creates or edits one skill. Pasting a SKILL.md fills the fields. */
export function SkillComposer({
  initial,
  bundles,
  pasteFirst,
  onSaved,
  onCancel,
}: {
  initial: SkillDraft;
  bundles: string[];
  pasteFirst: boolean;
  onSaved(): void;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [pasting, setPasting] = useState(pasteFirst);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const set = (field: keyof Omit<SkillDraft, "saved">) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  // A skill keeps its note path unless its name or bundle changes, so imported SKILL notes stay put.
  const unmoved = draft.saved && draft.name === initial.name && draft.bundle === initial.bundle;
  const path = unmoved ? draft.saved!.path : skillNotePath(draft);

  const fillFromPaste = (text: string) => {
    const pasted = parseSkillText(text);
    setDraft((current) => ({
      ...current,
      name: pasted.name || current.name,
      description: pasted.description || current.description,
      instructions: pasted.instructions,
    }));
    setPasting(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!path) return setError("Give the skill a name.");
    if (!draft.instructions.trim()) return setError("Write the instructions the app should follow.");
    setBusy(true);
    setError(null);
    try {
      const problem = await save(draft, path);
      if (problem) setError(problem);
      else onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save the skill. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const trash = async () => {
    if (!draft.saved) return;
    setBusy(true);
    try {
      await api.trash(draft.saved.id);
      onSaved();
    } catch {
      setError("Could not move the skill to the trash. Try again.");
      setBusy(false);
    }
  };

  return (
    <form className="skill-composer" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-title`}>
      <div className="composer-head">
        <h2 id={`${id}-title`}>{draft.saved ? "Edit skill" : "New skill"}</h2>
        {!draft.saved && (
          <button type="button" className="ghost btn-sm" onClick={() => setPasting(!pasting)} aria-expanded={pasting}>
            {pasting ? "Write it instead" : "Paste a SKILL.md"}
          </button>
        )}
      </div>

      {pasting && (
        <label className="field">
          <span>Paste a SKILL.md, or any instructions you already use</span>
          <textarea
            className="mono"
            rows={8}
            autoFocus
            placeholder={"---\nname: Blog post\ndescription: Write a blog post in my voice. Use when I ask for a post.\n---\n\n1. Start with the point..."}
            onPaste={(event) => {
              event.preventDefault();
              fillFromPaste(event.clipboardData.getData("text"));
            }}
            onBlur={(event) => event.target.value.trim() && fillFromPaste(event.target.value)}
          />
        </label>
      )}

      <div className="field-row">
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={set("name")} placeholder="Blog post" maxLength={100} autoFocus={!pasting} required />
        </label>
        <label className="field">
          <span>
            Bundle <em>optional</em>
          </span>
          <input value={draft.bundle} onChange={set("bundle")} placeholder="Writing" list={`${id}-bundles`} maxLength={200} />
          <datalist id={`${id}-bundles`}>
            {bundles.map((bundle) => (
              <option key={bundle} value={bundle} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="field">
        <span>When to use it</span>
        <textarea
          rows={2}
          value={draft.description}
          onChange={set("description")}
          maxLength={1024}
          placeholder="Write a blog post in my voice. Use when I ask for a post or an article."
        />
        <small>Apps read this to decide when the skill fits a task. Say what it does and when to use it.</small>
      </label>

      <label className="field">
        <span>Instructions</span>
        <textarea className="mono" rows={10} value={draft.instructions} onChange={set("instructions")} placeholder="1. Start with the point..." />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="composer-foot">
        <p className="composer-path">{path ? <>Saves as the note <code>{path}</code></> : "Give the skill a name to save it."}</p>
        <div className="composer-actions">
          {draft.saved && (
            <button type="button" className="ghost danger btn-sm" onClick={() => void trash()} disabled={busy}>
              Move to trash
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {draft.saved ? "Save changes" : "Save skill"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Saves the draft, moving the note first if its name or bundle changed. Returns an error message, or null. */
async function save(draft: SkillDraft, path: string): Promise<string | null> {
  const body = composeSkill(draft);
  let rev = 0;
  if (draft.saved) {
    rev = draft.saved.rev;
    if (draft.saved.path !== path) {
      const moved = await api.rename(draft.saved.id, path);
      if (moved.status === "exists") return "Another skill already has this name in this bundle.";
      if (moved.status !== "renamed") return "This skill was changed or removed elsewhere. Reload the page.";
    }
  }
  const result = await api.save(path, body, rev);
  if (result.status === "conflict") {
    return draft.saved ? "This skill changed since you opened it. Reload the page to get the latest." : "Another skill already has this name in this bundle.";
  }
  if (result.status === "not_found") return "This skill was removed elsewhere. Reload the page.";
  return null;
}
