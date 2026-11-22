import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree, filterTree, type TreeFolder, untitledPath } from "../../src/web/noteTree";

const names = (folder: TreeFolder) => [...folder.folders.map((f) => `${f.name}/`), ...folder.notes.map((n) => n.name)];

describe("the notes tree", () => {
  it("nests notes under their folders, folders first, each level sorted by name", () => {
    const root = buildTree([
      { id: "1", path: "Zebra" },
      { id: "2", path: "Projects/b note" },
      { id: "3", path: "apple" },
      { id: "4", path: "Projects/A note" },
      { id: "5", path: "Meetings/2026-11-03 Call" },
    ]);
    expect(names(root)).toEqual(["Meetings/", "Projects/", "apple", "Zebra"]);
    const projects = root.folders[1]!;
    expect(projects.path).toBe("Projects");
    expect(names(projects)).toEqual(["A note", "b note"]);
    expect(projects.notes[0]).toEqual({ id: "4", name: "A note", path: "Projects/A note" });
  });

  it("sorts numbers inside names by value, so Note 2 comes before Note 10", () => {
    expect(names(buildTree([{ id: "a", path: "Note 10" }, { id: "b", path: "Note 2" }]))).toEqual(["Note 2", "Note 10"]);
  });

  it("counts every note inside a folder, including its subfolders", () => {
    const root = buildTree([{ id: "1", path: "A/B/one" }, { id: "2", path: "A/two" }, { id: "3", path: "top" }]);
    expect(root.count).toBe(3);
    expect(root.folders[0]!.count).toBe(2);
    expect(root.folders[0]!.folders[0]!.path).toBe("A/B");
  });

  it("keeps a note whose name is also a folder name as both a note and a folder", () => {
    const root = buildTree([{ id: "1", path: "Meetings" }, { id: "2", path: "Meetings/Call" }]);
    expect(names(root)).toEqual(["Meetings/", "Meetings"]);
  });

  it("filters to matching notes and the folders that lead to them, ignoring case", () => {
    const root = buildTree([{ id: "1", path: "Projects/Launch plan" }, { id: "2", path: "Projects/Budget" }, { id: "3", path: "Inbox/launch idea" }]);
    const found = filterTree(root, "LAUNCH")!;
    expect(names(found)).toEqual(["Inbox/", "Projects/"]);
    expect(names(found.folders[1]!)).toEqual(["Launch plan"]);
    expect(found.count).toBe(2);
  });

  it("keeps a whole folder when the folder name matches", () => {
    const root = buildTree([{ id: "1", path: "Meetings/a" }, { id: "2", path: "Meetings/b" }, { id: "3", path: "Other" }]);
    expect(names(filterTree(root, "meet")!)).toEqual(["Meetings/"]);
    expect(filterTree(root, "meet")!.folders[0]!.notes).toHaveLength(2);
  });

  it("returns null when nothing matches, and the tree itself for an empty query", () => {
    const root = buildTree([{ id: "1", path: "a" }]);
    expect(filterTree(root, "zzz")).toBeNull();
    expect(filterTree(root, "  ")).toBe(root);
  });

  it("lists the folders that lead to a note, outermost first", () => {
    expect(ancestorsOf("A/B/note")).toEqual(["A", "A/B"]);
    expect(ancestorsOf("note")).toEqual([]);
  });
});

describe("naming a new note", () => {
  it("uses Untitled in the folder when the name is free", () => {
    expect(untitledPath([], "Projects")).toBe("Projects/Untitled");
    expect(untitledPath(["Other/Untitled"], "")).toBe("Untitled");
  });

  it("numbers the next new note in a folder that already has an Untitled one, ignoring case", () => {
    expect(untitledPath(["Projects/untitled", "Projects/Untitled 2"], "Projects")).toBe("Projects/Untitled 3");
  });
});
