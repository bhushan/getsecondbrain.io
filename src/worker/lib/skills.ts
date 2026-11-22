/**
 * The skill format. A skill is a note under the `Skills/` folder, written in the SKILL.md shape:
 * frontmatter with `name` and `description`, and the instructions as the body. A subfolder is a
 * bundle. An imported skill folder (`Skills/<name>/SKILL`) counts as one skill named after its folder.
 * Pure functions: the worker and the web app both use them.
 */

export const SKILLS_FOLDER = "Skills";
const MAX_NAME = 100;
const MAX_DESCRIPTION = 1024;

export interface Skill {
  path: string;
  name: string;
  description: string;
  /** The folder under `Skills/` that groups it, or null at the top level. */
  bundle: string | null;
  instructions: string;
}

export interface SkillFields {
  name: string;
  description: string;
  instructions: string;
  /** Other frontmatter lines (tags, license...), kept as written so an edit never drops them. */
  extra?: string;
}

/** True for notes inside the Skills folder, in any letter case (paths compare case-insensitively). */
export function isSkillPath(path: string): boolean {
  return path.toLowerCase().startsWith(`${SKILLS_FOLDER.toLowerCase()}/`);
}

export function parseSkill(path: string, body: string): Skill {
  const { fields, instructions } = splitSkill(body);
  const segments = path.split("/").slice(1);
  const ownFolder = segments.at(-1)?.toUpperCase() === "SKILL" && segments.length > 1;
  const nameSegment = ownFolder ? segments.at(-2)! : segments.at(-1)!;
  const bundleSegments = segments.slice(0, ownFolder ? -2 : -1);
  return {
    path,
    name: clip(fields.name || nameSegment, MAX_NAME),
    description: clip(fields.description || firstLine(instructions), MAX_DESCRIPTION),
    bundle: bundleSegments.length ? bundleSegments.join("/") : null,
    instructions,
  };
}

/** Reads pasted text (a SKILL.md, or plain instructions) into the fields of the skill form. */
export function parseSkillText(text: string): SkillFields {
  const { fields, extra, instructions } = splitSkill(text);
  return { name: fields.name ?? "", description: fields.description ?? "", instructions, extra };
}

/** Writes a skill as a note body that `parseSkill` reads back. */
export function composeSkill(skill: SkillFields): string {
  const extra = skill.extra?.trim() ? `${skill.extra.trimEnd()}\n` : "";
  return `---\nname: ${yamlValue(skill.name)}\ndescription: ${yamlValue(skill.description)}\n${extra}---\n\n${skill.instructions.trim()}\n`;
}

/** Where a skill from the form is saved: `Skills/<bundle>/<name>`, or null if the name is unusable. */
export function skillNotePath(skill: { name: string; bundle: string }): string | null {
  const name = cleanSegment(skill.name.replace(/\//g, "-"));
  if (!name) return null;
  const bundle = skill.bundle.split("/").map(cleanSegment).filter(Boolean);
  return [SKILLS_FOLDER, ...bundle, name].join("/");
}

/** Gives each skill a unique name safe for MCP prompts, in the order given (callers sort by path). */
export function assignSlugs<T extends Skill>(skills: T[]): (T & { slug: string })[] {
  const taken = new Set<string>();
  return skills.map((skill) => {
    const base = slugify([skill.bundle, skill.name].filter(Boolean).join(" ")) || "skill";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    return { ...skill, slug };
  });
}

// Internals

interface Split {
  fields: { name?: string; description?: string };
  extra: string;
  instructions: string;
}

function splitSkill(body: string): Split {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trimEnd() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
    if (end > 0) return { ...readFields(lines.slice(1, end)), instructions: lines.slice(end + 1).join("\n").trim() };
  }
  return { fields: {}, extra: "", instructions: body.trim() };
}

/**
 * Reads top-level `name` and `description`, joining indented continuation lines and block scalars.
 * Every other line is returned untouched as `extra`.
 */
function readFields(lines: string[]): Omit<Split, "instructions"> {
  const fields: Record<string, string> = {};
  const extra: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(name|description):\s*(.*)$/i.exec(lines[i]!);
    if (!match) {
      extra.push(lines[i]!);
      continue;
    }
    const parts = /^[>|][+-]?$/.test(match[2]!.trim()) ? [] : [match[2]!];
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) parts.push(lines[++i]!);
    fields[match[1]!.toLowerCase()] = unquote(parts.map((part) => part.trim()).join(" ").trim());
  }
  return { fields, extra: extra.join("\n").trim() };
}

function unquote(value: string): string {
  const quoted = /^"(.*)"$/.exec(value);
  if (quoted) return quoted[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return value.replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
}

function yamlValue(value: string): string {
  // Always double-quoted, so a colon, quote or leading symbol never changes the meaning.
  return `"${value.replace(/\s+/g, " ").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A path segment without the characters note paths refuse; empty when nothing usable is left. */
function cleanSegment(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\[\]|#^]/g, " ").replace(/\s+/g, " ").trim();
  return clean === "." || clean === ".." ? "" : clean;
}

function firstLine(instructions: string): string {
  return instructions.split("\n").find((line) => line.trim() && !/^#{1,6}\s/.test(line))?.trim() ?? "";
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}
