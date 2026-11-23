import { describe, expect, it } from "vitest";
import { appIdForName } from "../../src/web/pages/appForName";

describe("appIdForName", () => {
  it("matches an app by its name in any case", () => {
    expect(appIdForName("cursor")).toBe("cursor");
  });

  it("prefers the longer name, so Claude Code is not taken for Claude", () => {
    expect(appIdForName("Claude Code")).toBe("claude-code");
    expect(appIdForName("claude-code")).toBe("claude-code");
  });

  it("matches the domain an app registers with", () => {
    expect(appIdForName("claude.ai")).toBe("claude");
    expect(appIdForName("chatgpt.com")).toBe("chatgpt");
  });

  it("knows VS Code by its other names", () => {
    expect(appIdForName("Visual Studio Code")).toBe("vscode");
    expect(appIdForName("GitHub Copilot")).toBe("vscode");
  });

  it("matches Gemini CLI from its client name", () => {
    expect(appIdForName("gemini-cli-mcp-client")).toBe("gemini");
  });

  it("returns nothing for an app it does not know", () => {
    expect(appIdForName("Some Agent")).toBeUndefined();
  });
});
