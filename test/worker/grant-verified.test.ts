import { describe, expect, it } from "vitest";
import { grantVerified } from "../../src/worker/auth/oauth";

describe("grantVerified", () => {
  it("keeps the flag stored on newer grants", () => {
    expect(grantVerified({ clientId: "abc", app: "Claude", verified: true })).toBe(true);
    expect(grantVerified({ clientId: "https://claude.ai/oauth/client.json", app: "claude.ai", verified: false })).toBe(false);
  });

  it("recognises an older grant from a metadata document client on the domain it is named after", () => {
    expect(grantVerified({ clientId: "https://claude.ai/oauth/mcp-client.json", app: "claude.ai" })).toBe(true);
  });

  it("never trusts an older self-registered grant, whatever it calls itself", () => {
    expect(grantVerified({ clientId: "Xk9fR2pQ", app: "claude.ai" })).toBe(false);
    expect(grantVerified({ clientId: "https://evil.example/client.json", app: "claude.ai" })).toBe(false);
    expect(grantVerified({ clientId: "http://claude.ai/client.json", app: "claude.ai" })).toBe(false);
    expect(grantVerified({ clientId: "not a url", app: "not a url" })).toBe(false);
  });
});
