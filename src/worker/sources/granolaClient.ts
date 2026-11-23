/**
 * Talks to Granola: its OAuth server (to connect and keep the connection alive) and its MCP server
 * (to read meeting notes). The only outbound requests the Worker makes, and only to these hosts.
 */

export const GRANOLA_AUTH = "https://mcp-auth.granola.ai";
export const GRANOLA_MCP = "https://mcp.granola.ai/mcp";
export const GRANOLA_CALLBACK_PATH = "/sources/granola/callback";
const SCOPE = "openid profile email offline_access";
const ALLOWED_HOSTS = new Set(["mcp-auth.granola.ai", "mcp.granola.ai"]);

/** `fetch`, refusing anything but https to Granola's own hosts, and never following redirects. */
export async function granolaFetch(url: string, init: RequestInit): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.host)) throw new Error(`Refusing to fetch ${target.origin}`);
  return fetch(target.toString(), { ...init, redirect: "manual" });
}

export interface Tokens {
  access: string;
  refresh: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

export type TokenResult = { ok: true; tokens: Tokens } | { ok: false; revoked: boolean; error: string };

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Registers Second Brain as a client of Granola for this redirect address; returns its client id. */
export async function registerClient(redirectUri: string): Promise<string> {
  const response = await granolaFetch(`${GRANOLA_AUTH}/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Second Brain",
      client_uri: "https://www.getsecondbrain.io",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { client_id?: unknown };
  if (!response.ok || typeof body.client_id !== "string") throw new Error(`Granola registration failed (${response.status})`);
  return body.client_id;
}

export function authorizeUrl(input: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const url = new URL(`${GRANOLA_AUTH}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    state: input.state,
    scope: SCOPE,
    resource: GRANOLA_MCP,
  }).toString();
  return url.toString();
}

async function tokenRequest(params: Record<string, string>, now: number): Promise<TokenResult> {
  const response = await granolaFetch(`${GRANOLA_AUTH}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, resource: GRANOLA_MCP }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok && typeof body.access_token === "string" && typeof body.refresh_token === "string") {
    const seconds = typeof body.expires_in === "number" ? body.expires_in : 3600;
    return { ok: true, tokens: { access: body.access_token, refresh: body.refresh_token, expiresAt: now + seconds * 1000 } };
  }
  // Only invalid_grant means the grant is gone for good; anything else may pass.
  return { ok: false, revoked: body.error === "invalid_grant", error: `Granola sign-in answered ${response.status}${body.error ? ` (${String(body.error)})` : ""}` };
}

export const exchangeCode = (input: { clientId: string; code: string; redirectUri: string; verifier: string }, now = Date.now()) =>
  tokenRequest({ grant_type: "authorization_code", client_id: input.clientId, code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier }, now);

export const refreshTokens = (clientId: string, refresh: string, now = Date.now()) =>
  tokenRequest({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh }, now);

/** Revokes one refresh token; other connections of the same Granola account keep working. */
export async function revokeToken(clientId: string, token: string): Promise<void> {
  await granolaFetch(`${GRANOLA_AUTH}/oauth2/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, token, token_type_hint: "refresh_token" }),
  });
}

export class GranolaAuthError extends Error {}

/** A short MCP session with Granola over streamable HTTP. */
export class GranolaMcp {
  private session: string | null = null;
  private nextId = 1;

  private constructor(private readonly access: string) {}

  static async open(access: string): Promise<GranolaMcp> {
    const mcp = new GranolaMcp(access);
    await mcp.send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "second-brain", version: "1" } });
    await mcp.send("notifications/initialized", {}, true);
    return mcp;
  }

  /** Calls a tool and returns its text. Throws when the tool reports an error. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.send("tools/call", { name, arguments: args })) as { content?: { type: string; text?: string }[]; isError?: boolean };
    const text = (result?.content ?? []).map((part) => part.text ?? "").join("\n");
    if (result?.isError) throw new Error(`Granola ${name} failed: ${text.slice(0, 200)}`);
    return text;
  }

  private async send(method: string, params: unknown, notification = false): Promise<unknown> {
    const id = notification ? undefined : this.nextId++;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.access}`,
      "mcp-protocol-version": "2025-06-18",
    };
    if (this.session) headers["mcp-session-id"] = this.session;
    const response = await granolaFetch(GRANOLA_MCP, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    this.session = response.headers.get("mcp-session-id") ?? this.session;
    const text = await response.text();
    if (response.status === 401) throw new GranolaAuthError("Granola refused the access token");
    if (!response.ok) throw new Error(`Granola answered ${response.status}`);
    if (notification) return null;
    const messages = (response.headers.get("content-type") ?? "").includes("text/event-stream")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => JSON.parse(line.slice(5)) as { id?: number; result?: unknown; error?: { message?: string } })
      : [JSON.parse(text) as { id?: number; result?: unknown; error?: { message?: string } }];
    const reply = messages.find((message) => message.id === id);
    if (!reply) throw new Error(`Granola sent no answer to ${method}`);
    if (reply.error) throw new Error(`Granola ${method} failed: ${reply.error.message ?? "unknown error"}`);
    return reply.result;
  }
}
