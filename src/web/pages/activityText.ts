/** Plain-language pieces of the activity timeline. */

const ACTIONS: Record<string, string> = {
  create: "created",
  update: "edited",
  rename: "renamed",
  relink: "updated links in",
  trash: "trashed",
  restore: "restored",
  "read:list_skills": "looked through your skills",
  "read:use_skill": "used one of your skills",
};

export function describeAction(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  if (action.startsWith("read:")) return `used ${action.slice(5).replace(/_/g, " ")}`;
  return action;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

/** The heading a timeline entry sits under: Today, Yesterday, or its date. */
export function dayLabel(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });
}
