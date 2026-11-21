import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "../../src/worker/auth/google";
import { APP } from "./helpers";

afterEach(() => vi.restoreAllMocks());

/** Starts a login and returns the Google redirect plus the login cookie. */
async function start(next = "/notes") {
  const response = await exports.default.fetch(`${APP}/auth/login?next=${encodeURIComponent(next)}`, { redirect: "manual" });
  const location = new URL(response.headers.get("location")!);
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  return { response, location, cookie };
}

/** Makes the Google token and profile endpoints answer with this profile. */
function fakeGoogle(profile: Record<string, unknown>) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "google-access-token" });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json(profile);
    return real(input, init);
  });
}

describe("Google sign-in", () => {
  it("redirects to Google with state, PKCE and our callback", async () => {
    const { response, location, cookie } = await start();
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP}/auth/google/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(cookie.startsWith("__Host-sb_login=")).toBe(true);
    expect(response.headers.get("set-cookie")).toMatch(/Secure; HttpOnly; SameSite=Lax/);
  });

  it("signs in an allowed, verified account and returns to the page it came from", async () => {
    const google = fakeGoogle({ sub: "g-1", email: "Founder@example.com", email_verified: true, name: "Founder" });
    const { location, cookie } = await start("/graph");
    const callback = await exports.default.fetch(
      `${APP}/auth/google/callback?code=abc&state=${location.searchParams.get("state")}`,
      { headers: { cookie }, redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/graph");
    const session = callback.headers.getSetCookie().find((c) => c.startsWith("__Host-sb_session="))!;
    expect(session).toBeTruthy();
    const tokenCall = google.mock.calls.find(([input]) => String(input) === "https://oauth2.googleapis.com/token")!;
    expect(String((tokenCall[1] as RequestInit).body)).toContain("code_verifier=");

    const me = await exports.default.fetch(`${APP}/api/me`, { headers: { cookie: session.split(";")[0]! } });
    expect(await me.json()).toMatchObject({ user: { email: "Founder@example.com" }, workspaces: [{ name: "My second brain" }] });
  });

  it("refuses an account that is not on the beta list", async () => {
    fakeGoogle({ sub: "g-2", email: "stranger@example.com", email_verified: true, name: "Stranger" });
    const { location, cookie } = await start();
    const callback = await exports.default.fetch(`${APP}/auth/google/callback?code=abc&state=${location.searchParams.get("state")}`, {
      headers: { cookie },
    });
    expect(callback.status).toBe(403);
    expect(callback.headers.getSetCookie().some((c) => c.startsWith("__Host-sb_session=") && !c.includes("Max-Age=0"))).toBe(false);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?").bind("stranger@example.com").first("n")).toBe(0);
  });

  it("refuses an unverified email", async () => {
    fakeGoogle({ sub: "g-3", email: "second@example.com", email_verified: false, name: "X" });
    const { location, cookie } = await start();
    const callback = await exports.default.fetch(`${APP}/auth/google/callback?code=abc&state=${location.searchParams.get("state")}`, {
      headers: { cookie },
    });
    expect(callback.status).toBe(403);
  });

  it("refuses a callback whose state does not match the browser's login", async () => {
    const google = fakeGoogle({ sub: "g-4", email: "founder@example.com", email_verified: true, name: "F" });
    const { cookie } = await start();
    const callback = await exports.default.fetch(`${APP}/auth/google/callback?code=abc&state=forged`, { headers: { cookie } });
    expect(callback.status).toBe(400);
    const noCookie = await exports.default.fetch(`${APP}/auth/google/callback?code=abc&state=forged`);
    expect(noCookie.status).toBe(400);
    expect(google).not.toHaveBeenCalled();
  });

  it("only returns to paths on this site", () => {
    expect(safeNext("/authorize?x=1")).toBe("/authorize?x=1");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  it("signs out", async () => {
    fakeGoogle({ sub: "g-5", email: "second@example.com", email_verified: true, name: "S" });
    const { location, cookie } = await start();
    const callback = await exports.default.fetch(`${APP}/auth/google/callback?code=abc&state=${location.searchParams.get("state")}`, {
      headers: { cookie },
      redirect: "manual",
    });
    const session = callback.headers.getSetCookie().find((c) => c.startsWith("__Host-sb_session="))!.split(";")[0]!;
    const out = await exports.default.fetch(`${APP}/auth/logout`, { method: "POST", headers: { cookie: session }, redirect: "manual" });
    expect(out.status).toBe(303);
    expect((await exports.default.fetch(`${APP}/api/me`, { headers: { cookie: session } })).status).toBe(401);
  });
});
