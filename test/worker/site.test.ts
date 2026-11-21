import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const SITE = "https://www.test";

describe("public site on the www host", () => {
  it("serves the landing page with a sign-in link to the app", async () => {
    const response = await exports.default.fetch(`${SITE}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Second Brain");
    expect(html).toContain('href="https://app.test/"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("serves the privacy policy with the Google Limited Use statement", async () => {
    const response = await exports.default.fetch(`${SITE}/privacy`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Privacy policy");
    expect(html).toContain("Limited Use");
  });

  it("serves the terms of service", async () => {
    const response = await exports.default.fetch(`${SITE}/terms`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Terms of service");
  });

  it("answers 404 for an unknown page", async () => {
    expect((await exports.default.fetch(`${SITE}/nope`)).status).toBe(404);
  });

  it("sends strict security headers with no scripts allowed", async () => {
    const response = await exports.default.fetch(`${SITE}/`);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("never exposes the API or sign-in routes on the www host", async () => {
    expect((await exports.default.fetch(`${SITE}/api/me`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/auth/login`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/authorize`)).status).toBe(404);
  });
});
