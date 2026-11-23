import { signupOpen } from "../control/accounts";
import { hosts } from "../config";
import { llmsTxt, siteRobots, sitemap } from "./discovery";
import { SITE_CSP, landingPage, notFoundPage, privacyPage, termsPage } from "./pages";

/** Static files the site may serve. Nothing else of the app is exposed here. */
const SITE_FILES = new Set(["/site.js", "/site.css", "/tokens.css", "/logo.svg", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/logo-512.png", "/og/social.png"]);
/** Folders served whole: the font and the app logos. Names are plain, so no path tricks get through. */
const SITE_FOLDERS = /^\/(fonts|logos)\/[a-z0-9-]+\.(woff2|svg)$/;
/** Files that change with the page markup expire with the page; the rest rarely change. */
const PAGE_ASSETS = new Set(["/site.js", "/site.css", "/tokens.css"]);

const PAGE_CACHE = "public, max-age=300";

const textFile = (body: string, type: string) =>
  new Response(body, { headers: { "content-type": `${type}; charset=utf-8`, "cache-control": PAGE_CACHE, "x-content-type-options": "nosniff" } });

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": SITE_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "DENY",
      "cache-control": PAGE_CACHE,
    },
  });
}

/** The brand icons, also served on the MCP host so apps that look up its favicon find the logo. */
export const ICON_FILES = new Set(["/logo.svg", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/logo-512.png"]);

/** Serves one of the brand icons, or the favicon.ico redirect to the PNG. Returns null for any other path. */
export async function serveIcon(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/favicon.ico") return Response.redirect(new URL("/favicon-32.png", request.url).toString(), 301);
  if (!ICON_FILES.has(path)) return null;
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set("cache-control", "public, max-age=86400");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}

/** The www host: a static marketing site with no session, API or sign-in routes. */
export async function handleSite(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const path = new URL(request.url).pathname;
  const { appOrigin, mcpResource } = hosts(env);
  const origins = { app: appOrigin, site: new URL(env.SITE_ORIGIN).origin, open: signupOpen(env) };
  if (path === "/") return html(landingPage(origins, mcpResource));
  if (path === "/privacy") return html(privacyPage(origins));
  if (path === "/terms") return html(termsPage(origins));
  if (path === "/robots.txt") return textFile(siteRobots(origins.site), "text/plain");
  if (path === "/sitemap.xml") return textFile(sitemap(origins.site), "application/xml");
  if (path === "/llms.txt") return textFile(llmsTxt(origins.site, appOrigin, origins.open), "text/markdown");
  if (path === "/favicon.ico") return Response.redirect(new URL("/favicon-32.png", request.url).toString(), 301);
  if (SITE_FILES.has(path) || SITE_FOLDERS.test(path)) {
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set("cache-control", PAGE_ASSETS.has(path) ? PAGE_CACHE : "public, max-age=86400");
    response.headers.set("x-content-type-options", "nosniff");
    return response;
  }
  return html(notFoundPage(origins), 404);
}
