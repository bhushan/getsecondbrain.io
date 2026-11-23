/** The folder tree for the Notes page, built from note paths. Folders exist only as path prefixes. */

export interface TreeNote {
  id: string;
  name: string;
  path: string;
}
export interface TreeFolder {
  name: string;
  /** "" for the top level. */
  path: string;
  folders: TreeFolder[];
  notes: TreeNote[];
  /** Notes inside, at any depth. */
  count: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);

export function buildTree(entries: { id: string; path: string }[]): TreeFolder {
  const root: TreeFolder = { name: "", path: "", folders: [], notes: [], count: 0 };
  const index = new Map<string, TreeFolder>([["", root]]);
  const folderFor = (path: string): TreeFolder => {
    const known = index.get(path);
    if (known) return known;
    const cut = path.lastIndexOf("/");
    const parent = folderFor(cut === -1 ? "" : path.slice(0, cut));
    const folder: TreeFolder = { name: path.slice(cut + 1), path, folders: [], notes: [], count: 0 };
    parent.folders.push(folder);
    index.set(path, folder);
    return folder;
  };
  for (const { id, path } of entries) {
    const cut = path.lastIndexOf("/");
    folderFor(cut === -1 ? "" : path.slice(0, cut)).notes.push({ id, name: path.slice(cut + 1), path });
  }
  const finish = (folder: TreeFolder): number => {
    folder.folders.sort(byName);
    folder.notes.sort(byName);
    folder.count = folder.notes.length + folder.folders.reduce((sum, child) => sum + finish(child), 0);
    return folder.count;
  };
  finish(root);
  return root;
}

/** The part of the tree whose note paths or folder names contain `query`, or null when nothing does. */
export function filterTree(root: TreeFolder, query: string): TreeFolder | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return root;
  const walk = (folder: TreeFolder): TreeFolder | null => {
    if (folder.path && folder.name.toLowerCase().includes(needle)) return folder;
    const folders = folder.folders.map(walk).filter((child): child is TreeFolder => child !== null);
    const notes = folder.notes.filter((note) => note.name.toLowerCase().includes(needle));
    if (!folders.length && !notes.length) return null;
    return { ...folder, folders, notes, count: notes.length + folders.reduce((sum, child) => sum + child.count, 0) };
  };
  return walk(root);
}

/** Folder paths that lead to `path`, outermost first. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** The path for a new note in `folder`: "Untitled", or the first free "Untitled N" when that is taken. */
export function untitledPath(paths: Iterable<string>, folder: string): string {
  const taken = new Set([...paths].map((path) => path.toLowerCase()));
  const at = (name: string) => (folder ? `${folder}/${name}` : name);
  if (!taken.has(at("Untitled").toLowerCase())) return at("Untitled");
  for (let n = 2; ; n++) if (!taken.has(at(`Untitled ${n}`).toLowerCase())) return at(`Untitled ${n}`);
}
