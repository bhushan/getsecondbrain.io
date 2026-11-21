import { hosts } from "../config";
import { SITE_CSP, landingPage, privacyPage, termsPage } from "./pages";

/** Brand files the site may serve from the static assets; nothing else of the app is exposed here. */
const BRAND_FILES = new Set(["/logo.svg", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/logo-512.png"]);

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": SITE_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "DENY",
      "cache-control": "public, max-age=300",
    },
  });
}

/** The www host: a static marketing site with no session, API or sign-in routes. */
export async function handleSite(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const path = new URL(request.url).pathname;
  const { appOrigin, mcpResource } = hosts(env);
  if (path === "/") return html(landingPage(appOrigin, mcpResource));
  if (path === "/privacy") return html(privacyPage());
  if (path === "/terms") return html(termsPage(appOrigin));
  if (path === "/favicon.ico") return Response.redirect(new URL("/favicon-32.png", request.url).toString(), 301);
  if (BRAND_FILES.has(path)) {
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set("cache-control", "public, max-age=86400");
    response.headers.set("x-content-type-options", "nosniff");
    return response;
  }
  return html(`<!doctype html><title>Not found</title><p>That page does not exist. <a href="/">Go to Second Brain</a>.</p>`, 404);
}
