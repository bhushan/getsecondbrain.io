import { createSession, isAllowed, upsertGoogleUser } from "../control/accounts";
import { hosts } from "../config";
import { hostCookie, LOGIN_COOKIE, readCookie, SESSION_COOKIE } from "./cookies";
import { type Action, messagePage } from "./pages";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const LOGIN_TTL = 600;

export const CALLBACK_PATH = "/auth/google/callback";

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

/**
 * A path on our own site to return to after sign-in. Anything else becomes "/".
 * Backslashes and control characters are refused outright: browsers turn "\\" into "/" and drop
 * tabs and newlines from a Location value, so "/\\evil" or "/<tab>/evil" would leave the site.
 */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}

/** GET /auth/login: sends the browser to Google, remembering state, PKCE verifier and where to return. */
export async function startLogin(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID) return new Response("Sign-in is not configured yet.", { status: 503 });
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const state = random();
  const verifier = random();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${hosts(env).appOrigin}${CALLBACK_PATH}`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      "set-cookie": hostCookie(LOGIN_COOKIE, JSON.stringify({ state, verifier, next }), LOGIN_TTL),
      "cache-control": "no-store",
    },
  });
}

const SIGN_IN_AGAIN = { href: "/auth/login", label: "Sign in again" };
const OTHER_ACCOUNT = { href: "/auth/login", label: "Use another account" };

const page = (status: number, title: string, message: string, action: Action) =>
  new Response(messagePage(title, message, action), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "set-cookie": hostCookie(LOGIN_COOKIE, "", 0) },
  });

const expired = () =>
  page(400, "This sign-in link expired", "Sign-in links last ten minutes. Start again and it only takes a moment.", SIGN_IN_AGAIN);
const googleFailed = () => page(502, "Google sign-in did not finish", "Google could not complete the sign-in. Please try again.", SIGN_IN_AGAIN);

/** GET /auth/google/callback: checks state, exchanges the code, signs the user in. */
export async function finishLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let saved: { state: string; verifier: string; next: string };
  try {
    saved = JSON.parse(readCookie(request, LOGIN_COOKIE) ?? "");
  } catch {
    console.warn("login: no login cookie");
    return expired();
  }
  const state = url.searchParams.get("state");
  if (!state || state !== saved.state) {
    console.warn("login: state mismatch");
    return expired();
  }
  const code = url.searchParams.get("code");
  if (!code) return page(400, "Sign-in was cancelled", "Nothing was changed. Sign in whenever you are ready.", { href: "/auth/login", label: "Sign in" });

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${hosts(env).appOrigin}${CALLBACK_PATH}`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  if (!tokenResponse.ok) {
    // Google's error code and description only; they never contain the code or the secret.
    const failure = (await tokenResponse.json().catch(() => ({}))) as { error?: string; error_description?: string };
    console.warn("login: token exchange failed", tokenResponse.status, failure.error, failure.error_description);
    return googleFailed();
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  const profileResponse = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!profileResponse.ok) {
    console.warn("login: userinfo failed", profileResponse.status);
    return googleFailed();
  }
  const profile = (await profileResponse.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!profile.sub || !profile.email || profile.email_verified !== true) return page(403, "This Google account has no verified email", "Second Brain needs a verified email address. Verify it with Google, or sign in with another account.", OTHER_ACCOUNT);
  if (!isAllowed(env, profile.email)) {
    console.warn("login: email not on the allowlist");
    return page(403, "You are not on the list yet", "Second Brain is in private beta and opens by invitation. This Google account is not on the list yet.", OTHER_ACCOUNT);
  }

  const user = await upsertGoogleUser(env.DB, { sub: profile.sub, email: profile.email, name: profile.name ?? profile.email });
  if (!user) {
    return page(409, "This email belongs to another account", "A different Google account already signed in to Second Brain with this email address. Sign in with that Google account, or write to hello@getsecondbrain.io.", OTHER_ACCOUNT);
  }
  const session = await createSession(env.DB, user.id);
  const headers = new Headers({ location: safeNext(saved.next), "cache-control": "no-store" });
  headers.append("set-cookie", hostCookie(LOGIN_COOKIE, "", 0));
  headers.append("set-cookie", hostCookie(SESSION_COOKIE, session.token, session.maxAge));
  return new Response(null, { status: 302, headers });
}
