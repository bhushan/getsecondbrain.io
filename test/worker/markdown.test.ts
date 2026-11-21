import { describe, expect, it } from "vitest";
import { rewriteLinks, scanMarkdown } from "../../src/worker/lib/markdown";

describe("scanMarkdown links", () => {
  it("finds a plain wikilink", () => {
    expect(scanMarkdown("See [[Agent Brain]].").links).toEqual([{ ref: "Agent Brain", embed: false }]);
  });

  it("drops the alias and keeps the target", () => {
    expect(scanMarkdown("[[athenaeum_design_system|Athenaeum design system]]").links).toEqual([
      { ref: "athenaeum_design_system", embed: false },
    ]);
  });

  it("drops the heading or block part of a link", () => {
    expect(scanMarkdown("[[Working With Me#Decisions]] and [[Note#^block1]]").links).toEqual([
      { ref: "Working With Me", embed: false },
      { ref: "Note", embed: false },
    ]);
  });

  it("keeps a path-qualified target and strips a .md extension", () => {
    expect(scanMarkdown("[[Projects/austa/austa memory.md]]").links).toEqual([
      { ref: "Projects/austa/austa memory", embed: false },
    ]);
  });

  it("marks an embed", () => {
    expect(scanMarkdown("![[Diagram]]").links).toEqual([{ ref: "Diagram", embed: true }]);
  });

  it("returns each target once, and an embed wins over a plain link to the same note", () => {
    expect(scanMarkdown("[[A]] [[A|again]] ![[A]] [[B]]").links).toEqual([
      { ref: "A", embed: true },
      { ref: "B", embed: false },
    ]);
  });

  it("ignores a link to a heading in the same note", () => {
    expect(scanMarkdown("[[#Section]]").links).toEqual([]);
  });

  it("ignores links inside fenced code, including a longer or tilde fence", () => {
    const text = "```md\n[[Hidden]]\n```\n~~~~\n[[Hidden too]]\n```\nstill code\n~~~~\n[[Shown]]";
    expect(scanMarkdown(text).links).toEqual([{ ref: "Shown", embed: false }]);
  });

  it("ignores links inside inline code", () => {
    expect(scanMarkdown("Type `[[Not a link]]` then [[Real]]").links).toEqual([{ ref: "Real", embed: false }]);
  });

  it("ignores an unclosed or multi-line bracket pair", () => {
    expect(scanMarkdown("[[broken\nlink]] and [[open").links).toEqual([]);
  });
});

describe("scanMarkdown tags", () => {
  it("finds inline tags, including nested ones", () => {
    expect(scanMarkdown("Work on #project/alpha and #idea.").tags).toEqual(["idea", "project/alpha"]);
  });

  it("does not treat headings, numbers, or mid-word hashes as tags", () => {
    expect(scanMarkdown("# Heading\nIssue #123 and a#b and url.com/#frag").tags).toEqual([]);
  });

  it("ignores tags in code", () => {
    expect(scanMarkdown("`#nope`\n```\n#nope\n```\n#yes").tags).toEqual(["yes"]);
  });

  it("reads tags from an inline frontmatter list", () => {
    const text = "---\ntype: hub\ntags: [agents, hub]\n---\n# Title #inline";
    expect(scanMarkdown(text).tags).toEqual(["agents", "hub", "inline"]);
  });

  it("reads tags from a block frontmatter list and strips quotes and hashes", () => {
    const text = '---\ntags:\n  - product/austa\n  - "#engineering"\nupdated: 2026-10-26\n---\nBody';
    expect(scanMarkdown(text).tags).toEqual(["engineering", "product/austa"]);
  });

  it("lowercases and de-duplicates tags", () => {
    expect(scanMarkdown("#Idea #idea").tags).toEqual(["idea"]);
  });
});

describe("scanMarkdown frontmatter", () => {
  it("returns the raw frontmatter and does not scan it for links", () => {
    const text = "---\nrelated: \"[[Ignored]]\"\n---\n[[Seen]]";
    const result = scanMarkdown(text);
    expect(result.frontmatter).toBe('related: "[[Ignored]]"');
    expect(result.links).toEqual([{ ref: "Seen", embed: false }]);
  });

  it("treats a document with no closing fence as having no frontmatter", () => {
    const result = scanMarkdown("---\nnot closed\n[[Link]]");
    expect(result.frontmatter).toBeNull();
    expect(result.links).toEqual([{ ref: "Link", embed: false }]);
  });
});

describe("rewriteLinks", () => {
  const rename = (ref: string) => (ref === "Old" ? "New" : null);

  it("renames a target and keeps alias, heading and embed marker", () => {
    expect(rewriteLinks("[[Old]] [[Old|shown]] [[Old#Part|x]] ![[Old]] [[Other]]", rename)).toBe(
      "[[New]] [[New|shown]] [[New#Part|x]] ![[New]] [[Other]]",
    );
  });

  it("leaves fenced code, inline code and frontmatter alone", () => {
    const text = '---\nrelated: "[[Old]]"\n---\n`[[Old]]` then [[Old]]\n```\n[[Old]]\n```';
    expect(rewriteLinks(text, rename)).toBe('---\nrelated: "[[Old]]"\n---\n`[[Old]]` then [[New]]\n```\n[[Old]]\n```');
  });

  it("returns the same string when nothing matches", () => {
    const text = "[[Other]] text";
    expect(rewriteLinks(text, rename)).toBe(text);
  });
});
