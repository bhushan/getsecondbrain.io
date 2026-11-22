/**
 * Reads the text the Granola MCP tools return (an XML-like envelope around markdown) and turns a
 * meeting into a note. The text is untrusted data: it is only parsed and stored, never followed.
 */

export interface Meeting {
  id: string;
  title: string;
  /** As Granola wrote it, with the meeting's own UTC offset. */
  meetingAt: string;
  updatedAt: string;
  url: string;
  /** Names only: Granola's email addresses are not kept. */
  attendees: string[];
  summary: string;
  privateNotes: string;
}

export const MEETINGS_FOLDER = "Meetings";
/**
 * The parent note every meeting links to, as the Obsidian granola-sync plugin set it up: it lives in
 * the folder and is linked as [[Meetings]]. The user curates it; syncing only creates it when missing.
 */
export const MEETINGS_HUB_PATH = "Meetings/Meetings";
const HUB_LINK = "[[Meetings]]";

export const MEETINGS_HUB_BODY = `---
type: hub
tags: [meeting, hub]
---

# Meetings

Meeting notes synced from Granola, one note per meeting. Each one links here, so "Linked from" lists
them all. Edit this note freely: syncing never changes it.
`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const attr = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decode(match[1]!) : null;
};

/** The body of `<name>…</name>` inside a block, trimmed, or "" when absent or self-closing. */
const element = (block: string, name: string): string => {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]!).trim() : "";
};

/** The opening tags and bodies of every `<meeting …>` block. */
function meetingBlocks(text: string): { open: string; body: string }[] {
  return [...text.matchAll(/<meeting\s([^>]*?)(\/?)>([\s\S]*?)(?:<\/meeting>|(?=<meeting\s)|(?=<\/meetings_data>)|$)/g)].map((match) => ({
    open: ` ${match[1]}`,
    body: match[2] ? "" : match[3]!,
  }));
}

/** "Ada (note creator) from Example (ada@example.com)" becomes "Ada". */
const attendeeName = (line: string) => line.trim().split(/\s+\(|\s+from\s+/)[0]!.trim();

/** One page of `search_meetings`: meeting ids, and the cursor for the next page when there is one. */
export function parseSearchPage(text: string): { ids: string[]; nextCursor: string | null } {
  const ids = meetingBlocks(text)
    .map((block) => attr(block.open, "id"))
    .filter((id): id is string => !!id);
  const pagination = text.match(/<pagination\s[^>]*>/)?.[0] ?? "";
  const more = attr(pagination, "has_more") === "true";
  return { ids, nextCursor: more ? attr(pagination, "next_cursor") : null };
}

/** The meetings in a `get_meetings` answer. */
export function parseMeetings(text: string): Meeting[] {
  return meetingBlocks(text).flatMap(({ open, body }) => {
    const id = attr(open, "id");
    if (!id) return [];
    return [
      {
        id,
        title: attr(open, "title") ?? "",
        meetingAt: attr(open, "meeting_at") ?? "",
        updatedAt: attr(open, "updated_at") ?? "",
        url: attr(open, "url") ?? "",
        attendees: element(body, "known_participants")
          .split("\n")
          .map(attendeeName)
          .filter(Boolean),
        summary: element(body, "summary"),
        privateNotes: element(body, "private_notes"),
      },
    ];
  });
}

/**
 * `Meetings/YYYY-MM-DD Title`. The date is the meeting's own calendar date, read from Granola's
 * string, so an evening meeting in India does not land on the UTC day. The title is untrusted:
 * anything that could leave the folder or break a wikilink is replaced.
 */
export function meetingPath(meeting: Pick<Meeting, "title" | "meetingAt">): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(meeting.meetingAt)?.[0] ?? "Undated";
  const title =
    meeting.title
      .replace(/[\u0000-\u001f\u007f/\\[\]|#^]/g, " ")
      // Characters files cannot hold become "_", as the Obsidian granola-sync plugin named them.
      .replace(/[:*?"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+$/, "")
      .slice(0, 150)
      .trim() || "Untitled meeting";
  return `${MEETINGS_FOLDER}/${date} ${title}`;
}

const yamlString = (value: string) => JSON.stringify(value);

/**
 * The note body, in the format of the notes the Obsidian granola-sync plugin wrote, so old and new
 * meeting notes read the same: identifying frontmatter, a link to the hub, the summary, the user's
 * own notes, then the link back to Granola.
 */
export function renderMeeting(meeting: Meeting): string {
  const lines = [
    "---",
    `granola_id: ${yamlString(meeting.id)}`,
    `title: ${yamlString(meeting.title)}`,
    "type: note",
    `created: ${yamlString(meeting.meetingAt)}`,
    `updated: ${yamlString(meeting.updatedAt || meeting.meetingAt)}`,
    ...(meeting.attendees.length ? ["attendees:", ...meeting.attendees.map((name) => `  - ${yamlString(name)}`)] : []),
    ...(meeting.url ? [`web_url: ${yamlString(meeting.url)}`] : []),
    "tags: [meeting]",
    "---",
    "",
    `Part of ${HUB_LINK}. Imported from Granola; figures and plans are as of the meeting.`,
    "",
    meeting.summary || "_No summary yet._",
    "",
  ];
  if (meeting.privateNotes) lines.push("# My notes", "", meeting.privateNotes, "");
  if (meeting.url) lines.push("---", "", `Open in Granola: [${meeting.url}](${meeting.url})`, "");
  return lines.join("\n");
}

/** Whether a note looks like one written from this Granola meeting, by our sync or the Obsidian plugin. */
export function isGranolaNote(body: string, meetingId: string): boolean {
  return /^granola_id:/m.test(body) || body.includes(`notes.granola.ai/d/${meetingId}`);
}
