import { handleApi } from "./api/routes";
import { readCookie, hostCookie, SESSION_COOKIE } from "./auth/cookies";
import { CALLBACK_PATH, finishLogin, startLogin } from "./auth/google";
import { handleAuthorize, servers } from "./auth/oauth";
import { webPrincipal } from "./auth/principal";
import { hosts } from "./config";
import { deleteSession } from "./control/accounts";
import { handleSite } from "./site/handler";

export { Workspace } from "./workspace/workspace";

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
  return secured;
}

async function handleApp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") return Response.json({ ok: true });
  if (path === "/authorize") return handleAuthorize(request, env);
  if (path.startsWith("/oauth/") || path.startsWith("/.well-known/")) {
    return servers(env).authorization.fetch(request, env, ctx);
  }
  if (path === "/auth/login" && request.method === "GET") return startLogin(request, env);
  if (path === CALLBACK_PATH && request.method === "GET") return finishLogin(request, env);
  if (path === "/auth/logout" && request.method === "POST") {
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
    if (caller.status === "signed_out") return Response.json({ error: "Sign in required" }, { status: 401 });
    if (caller.status === "forbidden") return Response.json({ error: "Not a member of that workspace" }, { status: 403 });
    return handleApi(request, env, caller.user, caller.principal);
  }

  return withSecurityHeaders(await env.ASSETS.fetch(request));
}

async function handleMcpHost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  // Someone opening the MCP address in a browser gets the how-to-connect page.
  const wantsPage =
    request.method === "GET" &&
    url.pathname === "/" &&
    !request.headers.has("authorization") &&
    (request.headers.get("accept") ?? "").includes("text/html");
  if (wantsPage) return Response.redirect(`${hosts(env).appOrigin}/connect`, 302);
  return servers(env).resource.fetch(request, env, ctx);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { appHost, mcpHost, siteHost } = hosts(env);
    const host = new URL(request.url).host;
    if (host === mcpHost) return handleMcpHost(request, env, ctx);
    if (host === appHost) return handleApp(request, env, ctx);
    if (host === siteHost) return handleSite(request, env);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
