/**
 * Maps a file picked from a vault folder ("Vault/Projects/Plan.md") to its note path
 * ("Projects/Plan"). Returns null for files that are not notes: other file types and anything
 * inside a hidden folder such as `.obsidian` or `.trash`.
 */
export function notePathFor(relativePath: string): string | null {
  const parts = relativePath.split("/");
  const inside = parts.length > 1 ? parts.slice(1) : parts;
  if (inside.some((part) => part.startsWith("."))) return null;
  const path = inside.join("/");
  if (!/\.md$/i.test(path)) return null;
  return path.replace(/\.md$/i, "");
}
