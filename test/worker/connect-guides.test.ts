import { describe, expect, it } from "vitest";
import { connectGuides } from "../../src/web/connectGuides";

const URL = "https://mcp.example.test";
const guides = connectGuides(URL);
const byId = (id: string) => guides.find((guide) => guide.id === id)!;
const snippets = (id: string) => byId(id).steps.flatMap((step) => (step.code ? [step.code] : []));

describe("connect guides", () => {
  it("covers each supported app once", () => {
    expect(guides.map((guide) => guide.id)).toEqual(["claude", "claude-code", "chatgpt", "cursor", "vscode", "codex", "gemini", "other"]);
  });

  it("gives every app at least two steps with text", () => {
    for (const guide of guides) {
      expect(guide.steps.length).toBeGreaterThanOrEqual(2);
      for (const step of guide.steps) expect(step.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the exact address with no path in every snippet", () => {
    for (const guide of guides) {
      for (const code of guide.steps.flatMap((step) => (step.code ? [step.code] : []))) {
        expect(code).toContain(URL);
        expect(code).not.toContain(`${URL}/`);
      }
    }
  });

  it("adds Claude Code for every project over HTTP", () => {
    expect(snippets("claude-code")[0]).toBe(`claude mcp add --scope user --transport http second-brain ${URL}`);
  });

  it("adds Codex by URL and signs in with codex mcp login", () => {
    expect(snippets("codex")[0]).toBe(`codex mcp add second-brain --url ${URL}`);
    expect(byId("codex").steps.some((step) => step.text.includes("codex mcp login second-brain"))).toBe(true);
  });

  it("adds Gemini CLI with the HTTP transport, not SSE", () => {
    expect(snippets("gemini")[0]).toBe(`gemini mcp add --scope user --transport http second-brain ${URL}`);
  });

  it("gives Cursor and VS Code valid JSON with the address", () => {
    expect(JSON.parse(snippets("cursor")[0]!)).toEqual({ mcpServers: { "second-brain": { url: URL } } });
    expect(JSON.parse(snippets("vscode")[0]!)).toEqual({ servers: { "second-brain": { type: "http", url: URL } } });
  });
});
