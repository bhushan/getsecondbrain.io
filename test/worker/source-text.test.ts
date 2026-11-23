import { describe, expect, it } from "vitest";
import { callbackMessage, sourceLine, syncMessage } from "../../src/web/pages/sourceText";

const base = { provider: "granola", status: "active" as const, account: "ada@example.com", connectedAt: 0, lastSyncAt: null, lastError: null, notes: 0 };

describe("the status line of a connected source", () => {
  it("says it is waiting for its first sync", () => {
    expect(sourceLine(base)).toBe("Connected as ada@example.com. First sync starting.");
  });

  it("says how many notes it has brought in and when it last synced", () => {
    expect(sourceLine({ ...base, notes: 12, lastSyncAt: Date.now() - 5 * 60 * 1000 })).toBe("Connected as ada@example.com. 12 notes, last synced 5 minutes ago.");
  });

  it("asks for a reconnect when access ended", () => {
    expect(sourceLine({ ...base, status: "reconnect", notes: 3 })).toBe("Granola stopped sharing notes. Reconnect to keep syncing; your 3 notes stay.");
  });
});

describe("the message after a sync", () => {
  it("counts new and updated notes", () => {
    expect(syncMessage({ status: "ok", created: 2, updated: 1, unchanged: 0, skipped: 0 })).toBe("2 new and 1 updated meeting notes.");
  });

  it("says when nothing changed", () => {
    expect(syncMessage({ status: "ok", created: 0, updated: 0, unchanged: 4, skipped: 0 })).toBe("Up to date. No new meeting notes.");
  });

  it("mentions notes it left alone because they were edited or trashed", () => {
    expect(syncMessage({ status: "ok", created: 1, updated: 0, unchanged: 0, skipped: 2 })).toBe(
      "1 new and 0 updated meeting notes. 2 left as they are, because you edited or trashed them.",
    );
  });

  it("explains an error and that it will retry", () => {
    expect(syncMessage({ status: "error", error: "Granola answered 503" })).toBe("Could not reach Granola. It will try again within the hour.");
  });
});

describe("the message when Granola sends the user back", () => {
  it("reads each outcome", () => {
    expect(callbackMessage("?connected=granola")).toEqual({ kind: "ok", text: "Granola is connected. Bringing in your meeting notes…" });
    expect(callbackMessage("?error=denied")).toEqual({ kind: "error", text: "Granola was not connected, because access was not allowed." });
    expect(callbackMessage("?error=expired")).toEqual({ kind: "error", text: "That sign-in took too long. Try connecting again." });
    expect(callbackMessage("?error=failed")).toEqual({ kind: "error", text: "Granola did not finish the sign-in. Try connecting again." });
    expect(callbackMessage("")).toBeNull();
  });
});
