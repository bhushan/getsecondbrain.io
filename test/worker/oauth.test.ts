import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createWorkspace } from "../../src/worker/control/accounts";
import { APP, MCP, MCP_ORIGIN, signIn } from "./helpers";

const REDIRECT = "https://client.example/callback";
const fetchApp = (path: string, init?: RequestInit) => exports.default.fetch(`${APP}${path}`, { redirect: "manual", ...init });

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function registerClient(name = "Test Client") {
  const response = await fetchApp("/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

function authorizeUrl(clientId: string, challenge: string, resource: string | null = MCP) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: "notes:read notes:write",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (resource !== null) params.set("resource", resource);
  return `/authorize?${params}`;
}

/** Runs the whole connect flow for a signed-in user and returns an access token. */
async function connect(options: { write?: boolean; workspace?: string; resource?: string | null; who?: Awaited<ReturnType<typeof signIn>> } = {}) {
  const who = options.who ?? (await signIn());
  const clientId = await registerClient();
  const { verifier, challenge } = await pkce();
  const page = await fetchApp(authorizeUrl(clientId, challenge, options.resource === undefined ? MCP : options.resource), {
    headers: { cookie: who.cookie },
  });
  expect(page.status).toBe(200);
  const html = await page.text();
  const handle = /name="handle" value="([^"]+)"/.exec(html)![1]!;
  const consentCookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  const form = new URLSearchParams({ handle, decision: "approve", workspace: options.workspace ?? who.workspaceId });
  if (options.write !== false) form.set("write", "on");
  const approved = await fetchApp("/authorize", {
    method: "POST",
    headers: { cookie: `${who.cookie}; ${consentCookie}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (approved.status !== 302) return { who, html, approved, token: null as string | null };
  const redirect = new URL(approved.headers.get("location")!);
  expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
  expect(redirect.searchParams.get("state")).toBe("client-state");

  const tokenResponse = await fetchApp("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code")!,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      ...(options.resource === undefined ? { resource: MCP } : options.resource === null ? {} : { resource: options.resource }),
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const token = ((await tokenResponse.json()) as { access_token: string }).access_token;
  return { who, html, approved, token };
}

function mcp(token: string | null, method: string, params: unknown = {}, url = MCP) {
  return exports.default.fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      // Real requests always carry Host; the in-process test fetch does not add it.
      host: "mcp.test",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function rpc(token: string, method: string, params: unknown = {}, url = MCP): Promise<any> {
  const response = await mcp(token, method, params, url);
  const text = await response.text();
  if (response.status !== 200) console.log("RPC", response.status, text.slice(0, 400));
  const body = text.trimStart().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:")) ?? "").slice(5);
  return JSON.parse(body);
}

const callTool = async (token: string, name: string, args: Record<string, unknown>) =>
  (await rpc(token, "tools/call", { name, arguments: args })).result as { content: { text: string }[]; isError?: boolean };

describe("discovery", () => {
  it("challenges an MCP request without a token and points at the resource metadata", async () => {
    const response = await mcp(null, "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(`resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
    expect((await mcp("not-a-real-token", "tools/list")).status).toBe(401);
  });

  it("publishes resource metadata on the MCP host and server metadata on the app host", async () => {
    const resource = (await (await exports.default.fetch(`${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, unknown>;
    expect(resource).toMatchObject({ resource: MCP, authorization_servers: [APP] });
    const server = (await (await fetchApp("/.well-known/oauth-authorization-server")).json()) as Record<string, unknown>;
    expect(server).toMatchObject({
      issuer: APP,
      authorization_endpoint: `${APP}/authorize`,
      token_endpoint: `${APP}/oauth/token`,
      registration_endpoint: `${APP}/oauth/register`,
      client_id_metadata_document_supported: true,
    });
  });

  it("sends a browser that opens the MCP address to the connect page", async () => {
    for (const url of [MCP, `${MCP_ORIGIN}/`]) {
      const response = await exports.default.fetch(url, { headers: { accept: "text/html" }, redirect: "manual" });
      expect(response.status, url).toBe(302);
      expect(response.headers.get("location"), url).toBe(`${APP}/connect`);
    }
  });
});

describe("connecting an app", () => {
  it("sends a signed-out user to sign in first, then back to the same request", async () => {
    const clientId = await registerClient();
    const { challenge } = await pkce();
    const url = authorizeUrl(clientId, challenge);
    const response = await fetchApp(url);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/auth/login?next=${encodeURIComponent(url)}`);
  });

  it("shows the app name escaped, the destination host and the user's workspaces", async () => {
    const who = await signIn();
    await createWorkspace(env.DB, who.user.id, "Work <notes>");
    const clientId = await registerClient('<script>alert("x")</script>');
    const { challenge } = await pkce();
    const page = await fetchApp(authorizeUrl(clientId, challenge), { headers: { cookie: who.cookie } });
    const html = await page.text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&#60;script&#62;");
    expect(html).toContain("client.example");
    expect(html).toContain("My second brain");
    expect(html).toContain("Work &#60;notes&#62;");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
  });

  it("issues a token that reads and writes only the chosen workspace", async () => {
    const { token, who } = await connect();
    const tools = (await rpc(token!, "tools/list")).result.tools.map((tool: { name: string }) => tool.name);
    expect(tools).toContain("save_note");

    expect((await callTool(token!, "save_note", { path: "From Claude", body: "hello [[Other]]" })).content[0]!.text).toBe(
      "Saved From Claude (rev 1).",
    );
    const note = await env.WORKSPACE.getByName(who.workspaceId).getNote({ path: "From Claude" });
    expect(note).toMatchObject({ body: "hello [[Other]]" });
    const revisions = await env.WORKSPACE.getByName(who.workspaceId).listAudit(5);
    expect(revisions[0]).toMatchObject({ actor: { kind: "app", app: "Test Client" }, action: "create" });
  });

  it("issues a read-only token when the user unticks writing", async () => {
    const { token } = await connect({ write: false });
    const result = await callTool(token!, "save_note", { path: "Nope", body: "x" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/read-only/i);
    expect((await callTool(token!, "list_recent", {})).isError).toBeFalsy();
  });

  it("audits reads made by a connected app", async () => {
    const { token, who } = await connect();
    await callTool(token!, "search", { query: "anything" });
    const audit = await env.WORKSPACE.getByName(who.workspaceId).listAudit(5);
    expect(audit[0]).toMatchObject({ action: "read:search", actor: { app: "Test Client" } });
  });

  it("refuses a workspace the user does not belong to, even if posted directly", async () => {
    const stranger = await signIn();
    const { approved, token } = await connect({ workspace: stranger.workspaceId });
    expect(token).toBeNull();
    expect(approved.status).toBe(403);
  });

  it("keeps two users' connections apart", async () => {
    const alice = await connect();
    const bob = await connect();
    await callTool(alice.token!, "save_note", { path: "Alice private", body: "okapi" });
    expect((await callTool(bob.token!, "search", { query: "okapi" })).content[0]!.text).toMatch(/no notes/i);
    expect((await callTool(bob.token!, "get_note", { path: "Alice private" })).isError).toBe(true);
  });

  it("accepts the resource named exactly, or left out", async () => {
    for (const resource of [MCP, null]) {
      const { token } = await connect({ resource });
      expect(token, String(resource)).toBeTruthy();
      expect((await mcp(token, "tools/list")).status, String(resource)).toBe(200);
    }
  });

  it("stops working once the user disconnects the app", async () => {
    const { token, who } = await connect();
    const list = (await (await who.api("/api/connections")).json()) as { connections: { id: string; app: string; canWrite: boolean }[] };
    expect(list.connections).toMatchObject([{ app: "Test Client", canWrite: true }]);
    expect((await who.api(`/api/connections?id=${list.connections[0]!.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await mcp(token, "tools/list")).status).toBe(401);
  });

  it("stops working if the user leaves the workspace", async () => {
    const { token, who } = await connect();
    await env.DB.prepare("DELETE FROM memberships WHERE user_id = ?").bind(who.user.id).run();
    expect((await mcp(token, "tools/list")).status).toBe(403);
  });

  it("refuses an MCP request whose Host header names another site", async () => {
    const { token } = await connect();
    const response = await exports.default.fetch(MCP, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "evil.test", authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(403);
  });

  it("refuses a token sent to the app host's API instead of a session", async () => {
    const { token } = await connect();
    expect((await fetchApp("/api/stats", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

describe("the MCP endpoint path", () => {
  it("serves MCP only at /mcp, not at the bare host", async () => {
    const { token } = await connect();
    expect((await mcp(token, "tools/list", {}, `${MCP_ORIGIN}/`)).status).toBe(404);
    expect((await mcp(token, "tools/list")).status).toBe(200);
  });
});
