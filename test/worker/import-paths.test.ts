import { describe, expect, it } from "vitest";
import { notePathFor } from "../../src/web/importPaths";

describe("notePathFor", () => {
  it("drops the vault folder and the .md extension", () => {
    expect(notePathFor("My Vault/Projects/Plan.md")).toBe("Projects/Plan");
  });

  it("keeps a note at the vault root", () => {
    expect(notePathFor("My Vault/Inbox.md")).toBe("Inbox");
  });

  it("skips files that are not markdown", () => {
    expect(notePathFor("My Vault/images/photo.png")).toBeNull();
  });

  it("skips hidden folders such as .obsidian and .trash", () => {
    expect(notePathFor("My Vault/.obsidian/workspace.md")).toBeNull();
    expect(notePathFor("My Vault/Notes/.trash/old.md")).toBeNull();
  });

  it("matches the extension in any case", () => {
    expect(notePathFor("My Vault/Readme.MD")).toBe("Readme");
  });
});
