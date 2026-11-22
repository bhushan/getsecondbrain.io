/** A date and time in the reader's locale. */
export const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A time of day in the reader's locale. */
export const timeOfDay = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { timeStyle: "short" });
