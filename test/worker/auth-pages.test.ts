import { describe, expect, it } from "vitest";
import { consentPage, messagePage, type ConsentView } from "../../src/worker/auth/pages";

const view = (overrides: Partial<ConsentView> = {}): ConsentView => ({
  clientName: "Test Client",
  clientDomain: undefined,
  redirectHost: "client.example",
  redirectIsLoopback: false,
  handle: "handle-1",
  email: "me@example.com",
  workspaces: [
    { id: "ws-1", name: "My second brain" },
    { id: "ws-2", name: "Work" },
  ],
  ...overrides,
});

describe("consent page", () => {
  it("uses the design tokens and the Second Brain logo", () => {
    const html = consentPage(view());
    expect(html).toContain('<link rel="stylesheet" href="/tokens.css">');
    expect(html).toContain('src="/logo.svg"');
  });

  it("shows a known app's own logo when its domain is verified, marked mono when it is single-colour", () => {
    const verified = (clientName: string) => consentPage(view({ clientName, clientDomain: "app.example" }));
    expect(verified("Claude Code")).toContain('src="/logos/claude-code.svg"');
    expect(verified("chatgpt")).toMatch(/src="\/logos\/chatgpt.svg"[^>]*class="logo-mono"/);
    expect(verified("Visual Studio Code")).toContain('src="/logos/vscode.svg"');
  });

  it("never lends a real app's logo to an app that only registered itself under that name", () => {
    const html = consentPage(view({ clientName: "Claude", clientDomain: undefined }));
    expect(html).not.toContain("/logos/");
    expect(html).toContain('<span class="monogram">C</span>');
  });

  it("shows a monogram, not a borrowed logo, for an app whose name only resembles a known one", () => {
    for (const clientName of ["Claude Helper", "My Cursor tool", "Test Client"]) {
      const html = consentPage(view({ clientName }));
      expect(html, clientName).not.toContain("/logos/");
      expect(html, clientName).toContain(`<span class="monogram">${clientName[0]}</span>`);
    }
  });

  it("escapes every value that comes from the app, the user or the workspace", () => {
    const html = consentPage(
      view({
        clientName: "<xb>App",
        clientDomain: "<xi>dom",
        redirectHost: "<xu>host",
        handle: '"><xx>',
        email: "<xe>@example.com",
        workspaces: [{ id: '"><xy>', name: "<xw>" }],
      }),
    );
    for (const raw of ["<xb>", "<xi>", "<xu>", "<xx>", "<xy>", "<xw>", "<xe>"]) expect(html).not.toContain(raw);
    expect(html).toContain('<span class="monogram">&#60;</span>');
    expect(html).toContain("&#60;xi&#62;dom");
    expect(html).toContain("&#60;xu&#62;host");
  });

  it("names a verified publisher, or says the name is not verified", () => {
    expect(consentPage(view({ clientDomain: "claude.ai" }))).toContain("Published by <strong>claude.ai</strong>");
    expect(consentPage(view())).toContain("not verified");
  });

  it("warns only when access goes to an app on this computer", () => {
    expect(consentPage(view({ redirectIsLoopback: true }))).toContain("Access goes to an app on your computer.");
    expect(consentPage(view())).not.toContain("Access goes to an app on your computer.");
  });

  it("offers every workspace as a choice with the first one selected", () => {
    const html = consentPage(view());
    expect(html).toContain('name="workspace" value="ws-1" checked');
    expect(html).toMatch(/name="workspace" value="ws-2"(?! checked)/);
  });

  it("keeps the form contract: handle, write on by default, and Connect as the first button", () => {
    const html = consentPage(view());
    expect(html).toContain('<input type="hidden" name="handle" value="handle-1">');
    expect(html).toMatch(/name="write" value="on" checked/);
    expect(html.indexOf('value="approve"')).toBeLessThan(html.indexOf('value="deny"'));
    expect(html).toContain("never delete");
  });

  it("uses no em or en dashes in its copy", () => {
    expect(consentPage(view({ redirectIsLoopback: true }))).not.toMatch(/[–—]/);
  });
});

describe("message page", () => {
  it("shows an escaped title and message with exactly one action", () => {
    const html = messagePage("Could <not>", "Bad <thing>", { href: "/auth/login", label: "Sign in again" });
    expect(html).toContain("Could &#60;not&#62;");
    expect(html).toContain("Bad &#60;thing&#62;");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain('<link rel="stylesheet" href="/tokens.css">');
  });
});
