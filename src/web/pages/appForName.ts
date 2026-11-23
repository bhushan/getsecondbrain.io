/** Matches the name or domain an app connected with to the setup guide (and logo) it belongs to. */

const NAMES: Record<string, string[]> = {
  "claude-code": ["claude code"],
  claude: ["claude"],
  chatgpt: ["chatgpt"],
  cursor: ["cursor"],
  vscode: ["vscode", "visual studio code", "copilot"],
  codex: ["codex"],
  gemini: ["gemini"],
};

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Longest name first, so "Claude Code" is not taken for "Claude". */
const MATCHERS = Object.entries(NAMES)
  .flatMap(([id, names]) => names.map((name) => ({ id, name: squash(name) })))
  .sort((a, b) => b.name.length - a.name.length);

export function appIdForName(name: string): string | undefined {
  const squashed = squash(name);
  return MATCHERS.find((matcher) => squashed.includes(matcher.name))?.id;
}

/**
 * The logo to show for a connected app. Self-registered apps choose their own names, so a name
 * alone never earns a real app's logo; only an identity verified at connect time does.
 */
export function logoIdFor(app: { app?: string; verified?: boolean }): string | undefined {
  return app.verified === true && app.app ? appIdForName(app.app) : undefined;
}
