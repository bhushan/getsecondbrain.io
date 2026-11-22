import { describe, expect, it } from "vitest";
import { meetingPath, parseMeetings, parseSearchPage, renderMeeting } from "../../src/worker/sources/granolaFormat";
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
  it("reads title, time, link, participants, summary and decodes entities", () => {
    const [meeting] = parseMeetings(
      getMeetingsXml([{ id: "m-1", title: "Pricing &amp; Ada&apos;s &quot;plan&quot;", summary: "- Use &lt;b&gt; tags", participants: ["Ada (note creator)", "Grace from Navy"] }]),
    );
    expect(meeting).toEqual({
      id: "m-1",
      title: `Pricing & Ada's "plan"`,
      meetingAt: "2026-11-20T15:54:37+05:30",
      url: "https://notes.granola.ai/d/m-1",
      participants: ["Ada (note creator)", "Grace from Navy"],
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

  it("keeps a hostile title inside the Meetings folder", () => {
    for (const title of ["../Skills/evil", "Skills/x", "a [[link]] | #tag ^b", "..", "\u0000\u0007"]) {
      const path = meetingPath({ title, meetingAt: "2026-11-20T10:00:00Z" });
      expect(parsePath(path).folder).toBe("Meetings");
    }
  });

  it("names an untitled meeting", () => {
    expect(meetingPath({ title: "   ", meetingAt: "2026-11-20T10:00:00Z" })).toBe("Meetings/2026-11-20 Untitled meeting");
  });
});

describe("the note written for a meeting", () => {
  it("records the source in frontmatter and holds the summary and notes", () => {
    const [meeting] = parseMeetings(getMeetingsXml([{ id: "m-1", title: "Roadmap", summary: "# Decisions\n\n- Ship it", privateNotes: "remember x" }]));
    const body = renderMeeting(meeting!);
    expect(body.startsWith("---\nsource: granola\nsource_id: \"m-1\"\n")).toBe(true);
    expect(body).toContain("url: \"https://notes.granola.ai/d/m-1\"");
    expect(body).toContain("## Summary\n\n# Decisions\n\n- Ship it");
    expect(body).toContain("## My notes\n\nremember x");
    expect(body).toContain("Ada (note creator)");
  });

  it("leaves out empty private notes", () => {
    const [meeting] = parseMeetings(getMeetingsXml([{ id: "m-1", title: "Roadmap" }]));
    expect(renderMeeting(meeting!)).not.toContain("## My notes");
  });
});
