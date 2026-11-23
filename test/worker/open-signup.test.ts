import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { isAllowed } from "../../src/worker/control/accounts";
import { llmsTxt } from "../../src/worker/site/discovery";
import { landingPage } from "../../src/worker/site/pages";
import { APP } from "./helpers";

const LIST = "founder@example.com";
const origins = (open: boolean) => ({ app: "https://app.test", site: "https://www.test", open });

describe("who may sign in", () => {
  it("lets any verified Google account in when sign-up is open", () => {
    expect(isAllowed({ SIGNUP: "open", ALLOWED_EMAILS: LIST }, "stranger@example.com")).toBe(true);
  });

  it("only lets listed accounts in when sign-up is by invitation", () => {
    expect(isAllowed({ SIGNUP: "invite", ALLOWED_EMAILS: LIST }, "Founder@Example.com")).toBe(true);
    expect(isAllowed({ SIGNUP: "invite", ALLOWED_EMAILS: LIST }, "stranger@example.com")).toBe(false);
  });

  it("stays closed when the switch is missing or misspelled", () => {
    expect(isAllowed({ ALLOWED_EMAILS: LIST }, "stranger@example.com")).toBe(false);
    expect(isAllowed({ SIGNUP: "Open ", ALLOWED_EMAILS: LIST }, "stranger@example.com")).toBe(false);
    expect(isAllowed({ SIGNUP: "yes", ALLOWED_EMAILS: "" }, "stranger@example.com")).toBe(false);
  });
});

describe("copy follows the sign-up switch", () => {
  it("invites people to sign in and try when sign-up is open", () => {
    const html = landingPage(origins(true), "https://mcp.test/mcp");
    expect(html).not.toMatch(/invitation|Ask for an invite/i);
    expect(html).toContain("Sign in with Google");
    expect(llmsTxt("https://www.test", "https://app.test", true)).not.toMatch(/invitation/i);
  });

  it("says access is by invitation when sign-up is closed", () => {
    expect(landingPage(origins(false), "https://mcp.test/mcp")).toMatch(/invitation/i);
    expect(llmsTxt("https://www.test", "https://app.test", false)).toMatch(/invitation/i);
  });

  it("tells a signed-out app which way sign-up works, so the sign-in screen can say so", async () => {
    const response = await exports.default.fetch(`${APP}/api/me`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ signup: "invite" });
  });
});
