import { useEffect, useState } from "react";
import { parseSkillText } from "../../worker/lib/skills";
import { api, type SkillSummary } from "../api";
import { Icon } from "../Icons";
import { PageHeader } from "./PageHeader";
import { EMPTY_DRAFT, EXAMPLE_DRAFT, SkillComposer, type SkillDraft } from "./SkillComposer";

/** `opened` gives each composer a fresh key, so starting another resets the form. */
type Composer = { draft: SkillDraft; paste: boolean; opened: number } | null;

/** The skill library: instructions the user writes once for every connected app to use. */
export function SkillsPage({ onChanged }: { onChanged(): void }) {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [composer, setComposer] = useState<Composer>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    void api
      .skills()
      .then(({ skills }) => setSkills(skills))
      .catch(() => setError("Could not load your skills. Reload the page to try again."));
  useEffect(load, []);

  const bundles = [...new Set((skills ?? []).map((skill) => skill.bundle).filter((bundle): bundle is string => bundle !== null))];
  const groups = new Map<string, SkillSummary[]>();
  for (const skill of skills ?? []) groups.set(skill.bundle ?? "", [...(groups.get(skill.bundle ?? "") ?? []), skill]);
  const start = (draft: SkillDraft, paste = false) => {
    setComposer({ draft, paste, opened: Date.now() });
    window.setTimeout(() => document.querySelector(".page-sheet")?.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const edit = async (skill: SkillSummary) => {
    try {
      const note = await api.noteByPath(skill.path);
      const parsed = parseSkillText(note.body);
      start({
        name: parsed.name || skill.name,
        bundle: skill.bundle ?? "",
        description: parsed.description,
        instructions: parsed.instructions,
        saved: { id: note.id, path: note.path, rev: note.rev },
      });
    } catch {
      setError("Could not open that skill. Reload the page to try again.");
    }
  };

  const saved = () => {
    setComposer(null);
    load();
    onChanged();
  };

  return (
    <main className="page page-skills">
      <PageHeader title="Skills">
        Write a set of instructions once, and every AI app you connect can use it. Apps pick the right skill when a task fits, or
        you ask for one by name. Only you can add or change skills; apps can only use them.
      </PageHeader>

      {!composer && skills !== null && skills.length > 0 && (
        <div className="skills-toolbar">
          <button type="button" className="primary" onClick={() => start(EMPTY_DRAFT)}>
            <Icon name="plus" size={16} />
            New skill
          </button>
          <button type="button" onClick={() => start(EMPTY_DRAFT, true)}>
            Paste a SKILL.md
          </button>
          <span className="skills-count">
            {skills.length} {skills.length === 1 ? "skill" : "skills"}
            {bundles.length > 0 && `, ${bundles.length} ${bundles.length === 1 ? "bundle" : "bundles"}`}
          </span>
        </div>
      )}

      {composer && (
        <SkillComposer
          key={composer.opened}
          initial={composer.draft}
          bundles={bundles}
          pasteFirst={composer.paste}
          onSaved={saved}
          onCancel={() => setComposer(null)}
        />
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {skills?.length === 0 && !composer && (
        <div className="empty-state skills-empty">
          <span className="empty-icon" aria-hidden="true">
            <Icon name="skills" size={26} />
          </span>
          <strong>No skills yet.</strong>
          <p>Write down the steps you keep explaining to AI apps: how you review code, write a post or plan a trip. Every connected app can then follow them.</p>
          <div className="empty-actions">
            <button type="button" className="primary" onClick={() => start(EMPTY_DRAFT)}>
              <Icon name="plus" size={16} />
              New skill
            </button>
            <button type="button" onClick={() => start(EMPTY_DRAFT, true)}>
              Paste a SKILL.md
            </button>
            <button type="button" className="ghost" onClick={() => start(EXAMPLE_DRAFT)}>
              Start from an example
            </button>
          </div>
        </div>
      )}

      {[...groups].map(([bundle, items]) => (
        <section className="skill-group" key={bundle || "-"} aria-label={bundle || "Skills without a bundle"}>
          {bundle && (
            <h2>
              {bundle} <span>{items.length}</span>
            </h2>
          )}
          <ul className="skill-grid">
            {items.map((skill) => (
              <li key={skill.path}>
                <button type="button" className="skill-card" onClick={() => void edit(skill)} aria-label={`Edit ${skill.name}`}>
                  <strong>{skill.name}</strong>
                  <p>{skill.description || "No description yet. Add one so apps know when to use it."}</p>
                  <code className="skill-command">/{skill.slug}</code>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="pg-section skills-how" aria-labelledby="skills-how">
        <h2 id="skills-how">How apps use your skills</h2>
        <ul>
          <li>
            <strong>When a task fits.</strong> Connected apps see each skill's name and when to use it, and follow the one that matches.
          </li>
          <li>
            <strong>When you ask.</strong> Say "use my blog post skill" in any connected app.
          </li>
          <li>
            <strong>As a slash command.</strong> Apps that list MCP prompts, such as Claude Code, show your skills in their / menu.
          </li>
        </ul>
        <p className="muted pg-small">
          Skills are notes in the Skills folder, so they also appear on your map and keep every revision. Importing a vault with a Skills
          folder of SKILL.md files adds them all at once.
        </p>
      </section>
    </main>
  );
}
