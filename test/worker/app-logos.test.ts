import { describe, expect, it } from "vitest";
import { appLogo } from "../../src/web/appLogos";
import { connectGuides } from "../../src/web/connectGuides";

describe("app logos", () => {
  it("gives every app with a setup guide its own logo", () => {
    const apps = connectGuides("https://mcp.test/mcp").filter((guide) => guide.id !== "other");
    for (const app of apps) expect(appLogo(app.id)?.src).toBe(`/logos/${app.id}.svg`);
  });

  it("marks single-colour logos so light themes can darken them", () => {
    expect(appLogo("chatgpt")?.mono).toBe(true);
    expect(appLogo("claude")?.mono).toBe(false);
  });

  it("has no logo for the catch-all guide", () => {
    expect(appLogo("other")).toBeUndefined();
  });
});
