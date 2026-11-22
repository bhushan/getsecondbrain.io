import { describe, expect, it } from "vitest";
import { MEETINGS_HUB_PATH, meetingPath, parseMeetings, parseSearchPage, renderMeeting } from "../../src/worker/sources/granolaFormat";
import { parsePath } from "../../src/worker/lib/paths";
import { getMeetingsXml, SEARCH_EMPTY, SEARCH_PAGE_1, SEARCH_PAGE_2 } from "./granola-fixtures";

describe("reading a Granola search page", () => {
  it("lists meeting ids and the cursor for the next page", () => {
    expect(parseSearchPage(SEARCH_PAGE_1)).toEqual({ ids: ["m-1", "m-2"], nextCursor: "cursor-2" });
  });

  it("has no cursor on the last page", () => {
    expect(parseSearchPage(SEARCH_PAGE_2)).toEqual({ ids: ["m-3"], nextCursor: null });
  });

  it("reads an empty page", () => {
    expect(parseSearchPage(SEARCH_EMPTY)).toEqual({ ids: [], nextCursor: null });
  });
});

describe("reading Granola meetings", () => {
  it("reads title, times, link, attendee names, summary and decodes entities", () => {
    const [meeting] = parseMeetings(
      getMeetingsXml([
        {
          id: "m-1",
          title: "Pricing &amp; Ada&apos;s &quot;plan&quot;",
          summary: "- Use &lt;b&gt; tags",
          participants: ["Ada (note creator) from Example (ada@example.com)", "Grace from Navy (grace@navy.example)", "Linus"],
        },
      ]),
    );
    expect(meeting).toEqual({
      id: "m-1",
      title: `Pricing & Ada's "plan"`,
      meetingAt: "2026-11-20T15:54:37+05:30",
      updatedAt: "2026-11-20T15:54:37+05:30",
      url: "https://notes.granola.ai/d/m-1",
      attendees: ["Ada", "Grace", "Linus"],
      summary: "- Use <b> tags",
      privateNotes: "",
    });
  });

  it("reads private notes when there are some", () => {
    const [meeting] = parseMeetings(getMeetingsXml([{ id: "m-1", title: "T", privateNotes: "my own words" }]));
    expect(meeting!.privateNotes).toBe("my own words");
  });

  it("reads several meetings in order", () => {
    const meetings = parseMeetings(getMeetingsXml([{ id: "a", title: "A" }, { id: "b", title: "B" }]));
    expect(meetings.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("where a meeting note goes", () => {
  it("uses the meeting's own calendar date, not the UTC date", () => {
    // 00:30 in India is still the previous day in UTC.
    expect(meetingPath({ title: "Standup", meetingAt: "2026-11-19T00:30:00+05:30" })).toBe("Meetings/2026-11-19 Standup");
  });

  it("names files the way the Obsidian granola-sync plugin did", () => {
    expect(meetingPath({ title: "Funnel optimization: activation, conversion", meetingAt: "2026-10-19T10:00:00Z" })).toBe(
      "Meetings/2026-10-19 Funnel optimization_ activation, conversion",
    );
  });

  it("keeps a hostile title inside the Meetings folder", () => {
    for (const title of ["../Skills/evil", "Skills/x", "a [[link]] | #tag ^b", "..", "\u0000\u0007"]) {
      const path = meetingPath({ title, meetingAt: "2026-11-20T10:00:00Z" });
      expect(parsePath(path).folder).toBe("Meetings");
    }
  });

  it("names an untitled meeting", () => {
    expect(meetingPath({ title: "   ", meetingAt: "2026-11-20T10:00:00Z" })).toBe("Meetings/2026-11-20 Untitled meeting");
  });

  it("puts the hub inside the Meetings folder", () => {
    expect(MEETINGS_HUB_PATH).toBe("Meetings/Meetings");
  });
});

describe("the note written for a meeting", () => {
  const [meeting] = parseMeetings(getMeetingsXml([{ id: "m-1", title: "Roadmap: Q1", summary: "# Decisions\n\n- Ship it", privateNotes: "remember x" }]));
  const body = renderMeeting(meeting!);

  it("uses the same frontmatter as the existing Granola notes", () => {
    expect(body.startsWith(
      [
        "---",
        'granola_id: "m-1"',
        'title: "Roadmap: Q1"',
        "type: note",
        'created: "2026-11-20T15:54:37+05:30"',
        'updated: "2026-11-20T15:54:37+05:30"',
        "attendees:",
        '  - "Ada"',
        'web_url: "https://notes.granola.ai/d/m-1"',
        "tags: [meeting]",
        "---",
        "",
        "Part of [[Meetings]]. Imported from Granola; figures and plans are as of the meeting.",
        "",
        "# Decisions",
      ].join("\n"),
    )).toBe(true);
  });

  it("keeps the user's own notes and ends with the link back to Granola", () => {
    expect(body).toContain("# My notes\n\nremember x");
    expect(body.trimEnd().endsWith("---\n\nOpen in Granola: [https://notes.granola.ai/d/m-1](https://notes.granola.ai/d/m-1)")).toBe(true);
  });

  it("never stores attendee email addresses", () => {
    expect(body).not.toContain("@example.com");
  });

  it("leaves out empty private notes", () => {
    const [plain] = parseMeetings(getMeetingsXml([{ id: "m-1", title: "Roadmap" }]));
    expect(renderMeeting(plain!)).not.toContain("# My notes");
  });
});
