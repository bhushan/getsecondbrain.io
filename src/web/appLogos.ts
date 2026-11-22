/**
 * Logos for the apps that have a setup guide, served from /logos (LobeHub Icons, MIT).
 * Single-colour logos are drawn white; `mono` tells a light theme to invert them.
 */

export interface AppLogo {
  src: string;
  mono: boolean;
}

const MONO = new Set(["chatgpt", "cursor", "vscode"]);
const ALL = new Set(["claude", "claude-code", "chatgpt", "cursor", "vscode", "codex", "gemini"]);

export function appLogo(guideId: string): AppLogo | undefined {
  return ALL.has(guideId) ? { src: `/logos/${guideId}.svg`, mono: MONO.has(guideId) } : undefined;
}
