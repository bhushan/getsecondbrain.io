import { handleApi } from "./api/routes";
import { readCookie, hostCookie, SESSION_COOKIE } from "./auth/cookies";
import { CALLBACK_PATH, finishLogin, startLogin } from "./auth/google";
import { handleAuthorize, servers } from "./auth/oauth";
import { webPrincipal } from "./auth/principal";
import { hosts } from "./config";
import { deleteSession, signupOpen } from "./control/accounts";
import { eraseDeletedWorkspaces } from "./control/workspaceDeletion";
import { privateRobots } from "./site/discovery";
import { handleSite } from "./site/handler";
import { GRANOLA_CALLBACK_PATH } from "./sources/granolaClient";
import { finishGranolaConnect } from "./sources/routes";
import { syncAllSources } from "./sources/schedule";

export { Workspace } from "./workspace/workspace";

/** Matches the hourly entry in `triggers.crons` (wrangler.jsonc, both environments). */
const SOURCES_CRON = "41 * * * *";

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("content-security-policy", APP_CSP);
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("referrer-policy", "same-origin");
  secured.headers.set("x-frame-options", "DENY");
  // The app is all signed-in pages: nothing in it belongs in search results.
  secured.headers.set("x-robots-tag", "noindex, nofollow");
  return secured;
}

async function handleApp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") return Response.json({ ok: true });
  if (path === "/robots.txt") return new Response(privateRobots, { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (path === "/authorize") return handleAuthorize(request, env);
  if (path === "/oauth/register" && request.method === "POST") {
    const { success } = await env.REGISTER_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
    if (!success) return Response.json({ error: "too_many_requests", error_description: "Too many app registrations. Try again in a minute." }, { status: 429 });
  }
  if (path.startsWith("/oauth/") || path.startsWith("/.well-known/")) {
    return servers(env).authorization.fetch(request, env, ctx);
  }
  if (path === "/auth/login" && request.method === "GET") return startLogin(request, env);
  if (path === CALLBACK_PATH && request.method === "GET") return finishLogin(request, env);
  if (path === GRANOLA_CALLBACK_PATH && request.method === "GET") return finishGranolaConnect(request, env);
  if (path === "/auth/logout" && request.method === "POST") {
    if (request.headers.get("origin") !== hosts(env).appOrigin) return new Response("Cross-site request refused", { status: 403 });
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await deleteSession(env.DB, token);
    return new Response(null, { status: 303, headers: { location: "/", "set-cookie": hostCookie(SESSION_COOKIE, "", 0) } });
  }

  if (path.startsWith("/api/")) {
    // Writes must come from our own pages; the session cookie is SameSite=Lax as a second line.
    if (request.method !== "GET" && request.headers.get("origin") !== hosts(env).appOrigin) {
      return Response.json({ error: "Cross-site request refused" }, { status: 403 });
    }
    const caller = await webPrincipal(request, env);
    // The sign-in screen reads `signup` to say whether anyone can join.
    if (caller.status === "signed_out") return Response.json({ error: "Sign in required", signup: signupOpen(env) ? "open" : "invite" }, { status: 401 });
    if (caller.status === "forbidden") return Response.json({ error: "Not a member of that workspace" }, { status: 403 });
    return handleApi(request, env, caller.user, caller.principal);
  }

  return withSecurityHeaders(cacheBuiltAsset(new URL(request.url).pathname, await env.ASSETS.fetch(request)));
}

/** Vite names every file under /assets/ by its content hash, so a found one never changes. */
function cacheBuiltAsset(path: string, response: Response): Response {
  const found = response.ok && !(response.headers.get("content-type") ?? "").startsWith("text/html");
  if (!path.startsWith("/assets/") || !found) return response;
  const cached = new Response(response.body, response);
  cached.headers.set("cache-control", "public, max-age=31536000, immutable");
  return cached;
}

/** Server-rendered pages (sign-in errors) get the app's headers; a page that sets its own CSP (consent) keeps it. */
async function handleAppPages(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const response = await handleApp(request, env, ctx);
  const isPage = (response.headers.get("content-type") ?? "").startsWith("text/html");
  return isPage && !response.headers.has("content-security-policy") ? withSecurityHeaders(response) : response;
}

/** Every host is HTTPS only. Not `preload`: that list is hard to leave. */
function withHsts(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return secured;
}

async function handleMcpHost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const { appOrigin, mcpPath } = hosts(env);
  if (url.pathname === "/robots.txt") return new Response(privateRobots, { headers: { "content-type": "text/plain; charset=utf-8" } });
  // Someone opening the MCP address (or the bare host) in a browser gets the how-to-connect page.
  const wantsPage =
    request.method === "GET" &&
    (url.pathname === "/" || url.pathname === mcpPath) &&
    !request.headers.has("authorization") &&
    (request.headers.get("accept") ?? "").includes("text/html");
  if (wantsPage) return Response.redirect(`${appOrigin}/connect`, 302);
  return servers(env).resource.fetch(request, env, ctx);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { appHost, mcpHost, siteHost } = hosts(env);
    const host = new URL(request.url).host;
    if (host === mcpHost) return withHsts(await handleMcpHost(request, env, ctx));
    if (host === appHost) return withHsts(await handleAppPages(request, env, ctx));
    if (host === siteHost) return withHsts(await handleSite(request, env));
    return new Response("Not found", { status: 404 });
  },

  /** Hourly: sync connected sources. Daily: erase workspaces whose recovery period has ended. */
  async scheduled(controller, env): Promise<void> {
    if (controller.cron === SOURCES_CRON) await syncAllSources(env);
    else await eraseDeletedWorkspaces(env);
  },
} satisfies ExportedHandler<Env>;
