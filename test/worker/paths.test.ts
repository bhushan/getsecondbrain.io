import { expect, it } from "vitest";
import { parsePath } from "../../src/worker/lib/paths";

it("splits a path into folder and title, trimming segments and a .md extension", () => {
  expect(parsePath(" Projects / austa/austa memory.md ")).toEqual({
    path: "Projects/austa/austa memory",
    folder: "Projects/austa",
    title: "austa memory",
  });
});

it("accepts a note at the root", () => {
  expect(parsePath("/Inbox/")).toEqual({ path: "Inbox", folder: "", title: "Inbox" });
});

it.each(["", "  ", "/", ".md", "a/../b", "./a", "a[b", "a|b", "a#b", "line\nbreak", "x".repeat(600)])(
  "rejects %j",
  (raw) => {
    expect(() => parsePath(raw)).toThrow(/Invalid note path/);
  },
);
