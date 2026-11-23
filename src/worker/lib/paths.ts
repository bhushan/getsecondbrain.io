export interface NotePath {
  path: string;
  folder: string;
  title: string;
}

const MAX_PATH_LENGTH = 512;

/** Normalizes a note path: trims segments, drops a trailing `.md`, rejects anything that escapes. */
export function parsePath(raw: string): NotePath {
  const segments = raw
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const last = segments.at(-1);
  if (last?.toLowerCase().endsWith(".md")) segments[segments.length - 1] = last.slice(0, -3).trim();
  const title = segments.at(-1);
  const bad = segments.some((segment) => segment === "." || segment === ".." || /[\u0000-\u001f\[\]|#^]/.test(segment));
  const path = segments.join("/");
  if (!title || bad || path.length > MAX_PATH_LENGTH) throw new Error(`Invalid note path: ${JSON.stringify(raw)}`);
  return { path, folder: segments.slice(0, -1).join("/"), title };
}
