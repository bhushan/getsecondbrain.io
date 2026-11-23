import { describe, expect, it } from "vitest";
import { describeAction, dayLabel } from "../../src/web/pages/activityText";

describe("describeAction", () => {
  it("names a note change in plain words", () => {
    expect(describeAction("create")).toBe("created");
    expect(describeAction("relink")).toBe("updated links in");
    expect(describeAction("delete_forever")).toBe("deleted forever");
  });

  it("turns a read tool into what the app used", () => {
    expect(describeAction("read:search_notes")).toBe("used search notes");
  });

  it("says plainly when an app looked through or used the user's skills", () => {
    expect(describeAction("read:list_skills")).toBe("looked through your skills");
    expect(describeAction("read:use_skill")).toBe("used one of your skills");
  });

  it("shows an unknown action as it is", () => {
    expect(describeAction("archive")).toBe("archive");
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 10, 22, 15, 0).getTime();

  it("calls the current day Today", () => {
    expect(dayLabel(new Date(2026, 10, 22, 0, 5).getTime(), now)).toBe("Today");
  });

  it("calls the day before Yesterday", () => {
    expect(dayLabel(new Date(2026, 10, 21, 23, 59).getTime(), now)).toBe("Yesterday");
  });

  it("gives older days their date", () => {
    expect(dayLabel(new Date(2026, 10, 18, 12, 0).getTime(), now)).toBe(new Date(2026, 10, 18).toLocaleDateString(undefined, { dateStyle: "medium" }));
  });
});
