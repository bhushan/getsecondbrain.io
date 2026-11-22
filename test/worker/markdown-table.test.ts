import { describe, expect, it } from "vitest";
import { inlineParts, parseTable, renderedTables, splitTableRow } from "../../src/web/markdownTable";

describe("splitTableRow", () => {
  it("splits a row on its pipes, dropping the outer ones and trimming each cell", () => {
    expect(splitTableRow("| Role | Use for |").map((c) => c.text)).toEqual(["Role", "Use for"]);
  });

  it("splits a row written without outer pipes", () => {
    expect(splitTableRow("a | b").map((c) => c.text)).toEqual(["a", "b"]);
  });

  it("keeps an escaped pipe inside its cell, as a plain pipe", () => {
    expect(splitTableRow("| a \\| b | c |").map((c) => c.text)).toEqual(["a | b", "c"]);
  });

  it("gives the offset where each cell's text starts in the line", () => {
    const line = "| one |  two |";
    expect(splitTableRow(line).map((c) => line.slice(c.at, c.at + c.text.length))).toEqual(["one", "two"]);
  });
});

describe("parseTable", () => {
  it("reads the header, the alignment row and the body rows", () => {
    const table = parseTable("| Left | Center | Right | None |\n| :--- | :---: | ---: | --- |\n| a | b | c | d |");
    expect(table.align).toEqual(["left", "center", "right", null]);
    expect(table.header.map((c) => c.text)).toEqual(["Left", "Center", "Right", "None"]);
    expect(table.rows.map((row) => row.map((c) => c.text))).toEqual([["a", "b", "c", "d"]]);
  });

  it("pads a short row with empty cells and drops cells past the header's width", () => {
    const table = parseTable("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    expect(table.rows.map((row) => row.map((c) => c.text))).toEqual([["1", ""], ["1", "2"]]);
  });

  it("gives each cell's offset in the whole table source, for placing the cursor", () => {
    const source = "| a | b |\n|---|---|\n| one | two |";
    const cell = parseTable(source).rows[0]![1]!;
    expect(source.slice(cell.at, cell.at + 3)).toBe("two");
  });
});

describe("inlineParts", () => {
  it("returns plain text as one part", () => {
    expect(inlineParts("PRDs, prioritization")).toEqual([{ kind: "text", text: "PRDs, prioritization" }]);
  });

  it("reads inline code without its backticks", () => {
    expect(inlineParts("via the `review-pr` skill")).toEqual([
      { kind: "text", text: "via the " },
      { kind: "code", text: "review-pr" },
      { kind: "text", text: " skill" },
    ]);
  });

  it("reads bold, italic and strikethrough, with formatting inside them", () => {
    expect(inlineParts("**bold `x`** and *em* and ~~gone~~")).toEqual([
      { kind: "strong", parts: [{ kind: "text", text: "bold " }, { kind: "code", text: "x" }] },
      { kind: "text", text: " and " },
      { kind: "em", parts: [{ kind: "text", text: "em" }] },
      { kind: "text", text: " and " },
      { kind: "strike", parts: [{ kind: "text", text: "gone" }] },
    ]);
  });

  it("leaves underscores inside a word alone", () => {
    expect(inlineParts("snake_case_name")).toEqual([{ kind: "text", text: "snake_case_name" }]);
  });

  it("reads a markdown link and a bare web address", () => {
    expect(inlineParts("[site](https://example.com) or https://a.test/x.")).toEqual([
      { kind: "link", href: "https://example.com", parts: [{ kind: "text", text: "site" }] },
      { kind: "text", text: " or " },
      { kind: "link", href: "https://a.test/x", parts: [{ kind: "text", text: "https://a.test/x" }] },
      { kind: "text", text: "." },
    ]);
  });

  it("reads a wikilink with its alias, and an embed", () => {
    expect(inlineParts("see [[Agent Brain|the brain]] and ![[Diagram]]")).toEqual([
      { kind: "text", text: "see " },
      { kind: "wikilink", target: "Agent Brain", label: "the brain", embed: false },
      { kind: "text", text: " and " },
      { kind: "wikilink", target: "Diagram", label: "Diagram", embed: true },
    ]);
  });

  it("turns a backslash escape into the plain character", () => {
    expect(inlineParts("not \\*em\\*")).toEqual([{ kind: "text", text: "not *em*" }]);
  });

  it("keeps an unclosed marker as text", () => {
    expect(inlineParts("2 * 3 and `open")).toEqual([{ kind: "text", text: "2 * 3 and `open" }]);
  });
});

describe("renderedTables", () => {
  const tables = [
    { from: 10, to: 50 },
    { from: 60, to: 90 },
  ];

  it("renders every table while the editor does not have focus", () => {
    expect(renderedTables(tables, [{ from: 20, to: 20 }], false)).toEqual(tables);
  });

  it("shows the raw markdown of the table the cursor is in", () => {
    expect(renderedTables(tables, [{ from: 20, to: 20 }], true)).toEqual([{ from: 60, to: 90 }]);
  });

  it("counts a cursor on either edge of a table as inside it", () => {
    expect(renderedTables(tables, [{ from: 50, to: 50 }], true)).toEqual([{ from: 60, to: 90 }]);
    expect(renderedTables(tables, [{ from: 60, to: 60 }], true)).toEqual([{ from: 10, to: 50 }]);
  });

  it("shows the raw markdown of every table a selection crosses", () => {
    expect(renderedTables(tables, [{ from: 0, to: 70 }], true)).toEqual([]);
  });
});
