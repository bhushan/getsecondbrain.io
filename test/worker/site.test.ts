import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { connectGuides } from "../../src/web/connectGuides";

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

  it("shows one app saving a note and another app recalling it", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain("Save it in one app. Find it in another.");
    expect(html).toContain('class="relay"');
  });

  it("marks the product as in beta next to the name", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toMatch(/class="brand"[^]*?Second Brain<\/a><span class="beta-tag">Beta<\/span>/);
  });

  it("lists every app that has a setup guide in the app", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    const apps = connectGuides("https://mcp.test").filter((guide) => guide.id !== "other");
    expect(apps.length).toBeGreaterThan(5);
    for (const app of apps) expect(html).toContain(`<li class="app-pill">${app.name}</li>`);
  });

  it("says plainly that any AI app or agent can connect, on any device", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain("Connect any AI app or agent, on any device");
    expect(html).toMatch(/class="works-with"[^<]*any AI app or agent/);
    for (const app of connectGuides("https://mcp.test").filter((guide) => guide.id !== "other")) {
      expect(html).toContain(`<h3>${app.name}</h3><p>${app.where}</p>`);
    }
  });

  it("answers common questions without needing a script", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('id="faq"');
    expect(html.match(/<details/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps every page free of inline scripts, event handlers and outside assets", async () => {
    for (const path of ["/", "/privacy", "/terms"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html).not.toMatch(/<script(?![^>]*\bsrc="\/site\.js")/i);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/(src|href)="https?:\/\/(?!app\.test|developers\.google\.com)/);
      expect(html).not.toContain("data:");
    }
  });

  it("holds the landing animation still for people who ask for reduced motion", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain("@media (prefers-reduced-motion:reduce)");
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

  it("allows only the site's own script file, never inline or outside scripts", async () => {
    const response = await exports.default.fetch(`${SITE}/`);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*(unsafe|https?:)/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("serves the map script that brings the landing page to life", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('<script src="/site.js" defer></script>');
    const script = await exports.default.fetch(`${SITE}/site.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
  });

  it("caches the map script no longer than the page, so the two never drift apart", async () => {
    const script = await exports.default.fetch(`${SITE}/site.js`);
    expect(script.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("serves the shared design tokens, the font and the app logos from its own origin", async () => {
    for (const [path, type] of [["/tokens.css", "text/css"], ["/site.css", "text/css"], ["/fonts/inter-var.woff2", "font/woff2"], ["/logos/claude.svg", "image/svg+xml"]] as const) {
      const response = await exports.default.fetch(`${SITE}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toContain(type);
    }
  });

  it("does not serve other app files from the www host", async () => {
    expect((await exports.default.fetch(`${SITE}/index.html`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/logos/../index.html`)).status).toBe(404);
  });

  it("allows fonts and stylesheets only from its own origin", async () => {
    const csp = (await exports.default.fetch(`${SITE}/`)).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("font-src 'self'");
    expect(csp).toMatch(/style-src 'self'/);
  });

  it("never exposes the API or sign-in routes on the www host", async () => {
    expect((await exports.default.fetch(`${SITE}/api/me`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/auth/login`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/authorize`)).status).toBe(404);
  });
});
