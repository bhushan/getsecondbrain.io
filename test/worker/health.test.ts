import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("answers the health check on the app host", async () => {
  const response = await exports.default.fetch("https://app.test/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

it("refuses an unknown host", async () => {
  expect((await exports.default.fetch("https://elsewhere.test/health")).status).toBe(404);
});

it("serves the web app with security headers", async () => {
  const response = await exports.default.fetch("https://app.test/");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(response.headers.get("content-security-policy")).toContain("img-src 'self' data:");
});

it("keeps each workspace object separate", async () => {
  const a = env.WORKSPACE.getByName("workspace-a");
  const b = env.WORKSPACE.getByName("workspace-b");
  expect(await a.schemaVersion()).toBe(3);
  expect(await b.schemaVersion()).toBe(3);
});

it("asks browsers to use HTTPS on every host", async () => {
  for (const url of ["https://app.test/", "https://app.test/health", "https://app.test/auth/login", "https://mcp.test/mcp", "https://www.test/"]) {
    const response = await exports.default.fetch(url, { redirect: "manual" });
    expect(response.headers.get("strict-transport-security"), url).toBe("max-age=31536000; includeSubDomains");
  }
});

it("gives sign-in error pages the app's security headers", async () => {
  const response = await exports.default.fetch("https://app.test/auth/google/callback?code=abc&state=forged");
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

it("caches the app's content-hashed files for a year and revalidates its page", async () => {
  const page = await exports.default.fetch("https://app.test/");
  expect(page.headers.get("cache-control") ?? "").not.toContain("immutable");
  const script = (await page.text()).match(/\/assets\/[\w.-]+\.js/)?.[0];
  expect(script).toBeTruthy();
  const asset = await exports.default.fetch(`https://app.test${script}`);
  expect(asset.status).toBe(200);
  expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  const missing = await exports.default.fetch("https://app.test/assets/nope-123.js");
  expect(missing.headers.get("cache-control") ?? "").not.toContain("immutable");
});
