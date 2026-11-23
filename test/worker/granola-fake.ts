import { vi } from "vitest";
import { ACCOUNT_JSON, getMeetingsXml } from "./granola-fixtures";

export interface FakeMeeting {
  id: string;
  title: string;
  meetingAt?: string;
  updatedAt: string;
  summary?: string;
  privateNotes?: string;
}

/**
 * A stand-in for Granola's sign-in server and MCP server, behind a `fetch` spy. Refresh tokens
 * rotate on every use, like the real one. Every request is recorded in `calls`.
 */
export function fakeGranola() {
  let n = 0;
  const meetings = new Map<string, FakeMeeting>();
  const refreshTokens = new Set<string>();
  const accessTokens = new Set<string>();
  const calls: { url: string; tool?: string; args?: Record<string, unknown>; form?: Record<string, string> }[] = [];
  const fake = {
    meetings,
    calls,
    refreshTokens,
    /** Seconds until an access token expires; 0 makes every sync refresh first. */
    expiresIn: 3600,
    /** When set, the token endpoint answers a refresh with this. */
    tokenFailure: null as null | { status: number; body: unknown },
    /** Ids left out of a batched get_meetings answer (still returned when asked for alone). */
    dropFromBatch: new Set<string>(),
    /** Ids get_meetings never returns. */
    neverReturn: new Set<string>(),
    /** When set, the MCP endpoint answers with this status. */
    mcpStatus: null as null | number,
    add(meeting: FakeMeeting) {
      meetings.set(meeting.id, meeting);
    },
    toolCalls(tool: string) {
      return calls.filter((call) => call.tool === tool);
    },
    otherHosts() {
      return calls.filter((call) => !/^https:\/\/(mcp|mcp-auth)\.granola\.ai\//.test(call.url));
    },
  };

  const issue = () => {
    n++;
    const access = `granola-access-${n}`;
    const refresh = `granola-refresh-${n}`;
    accessTokens.add(access);
    refreshTokens.add(refresh);
    return Response.json({ token_type: "bearer", access_token: access, refresh_token: refresh, expires_in: fake.expiresIn });
  };

  const tool = (name: string, args: Record<string, unknown>): { text: string; isError?: boolean } => {
    if (name === "get_account_info") return { text: ACCOUNT_JSON };
    if (name === "search_meetings") {
      const after = Date.parse(String(args.updated_after ?? "1970-01-01T00:00:00Z"));
      const all = [...meetings.values()].filter((m) => Date.parse(m.updatedAt) > after).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const start = Number(args.cursor ?? 0);
      const page = all.slice(start, start + 2);
      const more = start + 2 < all.length;
      const pagination = more ? `<pagination has_more="true" next_cursor="${start + 2}" />` : `<pagination has_more="false" />`;
      const rows = page.map((m) => `<meeting id="${m.id}" title="${m.title}" meeting_at="${m.meetingAt ?? m.updatedAt}" updated_at="${m.updatedAt}">\n<folders />\n</meeting>`);
      return { text: `${pagination}\n\n<meetings_data count="${page.length}">\n${rows.join("\n\n")}\n</meetings_data>` };
    }
    if (name === "get_meetings") {
      const asked = (args.meeting_ids as string[]) ?? [];
      const kept = asked.filter((id) => !fake.neverReturn.has(id) && !(asked.length > 1 && fake.dropFromBatch.has(id)));
      return { text: getMeetingsXml(kept.flatMap((id) => (meetings.has(id) ? [meetings.get(id)!] : []))) };
    }
    return { text: `Unknown tool ${name}`, isError: true };
  };

  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = request.url;
    const entry: (typeof calls)[number] = { url };
    calls.push(entry);

    if (url === "https://mcp-auth.granola.ai/oauth2/register" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      return Response.json({ ...body, client_id: "granola-client-1" }, { status: 201 });
    }
    if (url === "https://mcp-auth.granola.ai/oauth2/token" && request.method === "POST") {
      const form = Object.fromEntries(new URLSearchParams(await request.text()));
      entry.form = form;
      if (form.grant_type === "authorization_code") return form.code === "good-code" ? issue() : Response.json({ error: "invalid_grant" }, { status: 400 });
      if (fake.tokenFailure) return Response.json(fake.tokenFailure.body, { status: fake.tokenFailure.status });
      if (!refreshTokens.delete(form.refresh_token!)) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return issue();
    }
    if (url === "https://mcp-auth.granola.ai/oauth2/revoke" && request.method === "POST") {
      const form = Object.fromEntries(new URLSearchParams(await request.text()));
      entry.form = form;
      refreshTokens.delete(form.token!);
      return new Response(null, { status: 200 });
    }
    if (url === "https://mcp.granola.ai/mcp" && request.method === "POST") {
      if (fake.mcpStatus) return new Response("unavailable", { status: fake.mcpStatus });
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (!accessTokens.has(token)) return Response.json({ message: "Unauthorized" }, { status: 401 });
      const message = (await request.json()) as { id?: number; method: string; params?: { name: string; arguments: Record<string, unknown> } };
      if (message.id === undefined) return new Response(null, { status: 202 });
      if (message.method === "initialize") {
        return Response.json(
          { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "granola-mcp" }, capabilities: {} } },
          { headers: { "mcp-session-id": "session-1" } },
        );
      }
      if (message.method === "tools/call") {
        entry.tool = message.params!.name;
        entry.args = message.params!.arguments;
        const result = tool(message.params!.name, message.params!.arguments ?? {});
        // Answer as an event stream, the way streamable HTTP servers may.
        const event = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: result.text }], isError: result.isError } })}\n\n`;
        return new Response(event, { headers: { "content-type": "text/event-stream" } });
      }
      return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "no" } });
    }
    return new Response("unexpected host in test", { status: 599 });
  });

  return Object.assign(fake, { spy });
}
