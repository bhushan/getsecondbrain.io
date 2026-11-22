import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import type { Principal } from "../auth/principal";
import { hosts } from "../config";
import { SERVER_INSTRUCTIONS, TOOLS, runTool } from "./tools";

/** Built once per isolate: a stateless server whose tools read the verified caller from the auth context. */
function createServer(): McpServer {
  const server = new McpServer(
    { name: "Second Brain", version: "0.1.0" },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
      async (args: unknown) => {
        const principal = getMcpAuthContext()?.props as Principal | undefined;
        if (!principal?.workspaceId) throw new Error("No verified caller");
        const result = await runTool(env, principal, tool.name, args);
        return { content: [{ type: "text" as const, text: result.text }], isError: result.isError };
      },
    );
  }
  return server;
}

const handlers = new Map<string, ReturnType<typeof createMcpHandler>>();

/** Serves one MCP request for a caller the resource server already verified. */
export function handleMcp(request: Request, env: Env, ctx: ExecutionContext, principal: Principal): Promise<Response> {
  const { mcpHost, mcpPath } = hosts(env);
  let handler = handlers.get(mcpHost);
  if (!handler) {
    handler = createMcpHandler(createServer, { route: mcpPath, allowedHostnames: [mcpHost.split(":")[0]!] });
    handlers.set(mcpHost, handler);
  }
  // The verified caller travels as `props`, the way the handler reads it into the auth context.
  const callerCtx = {
    waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException(),
    props: { ...principal },
  } as unknown as ExecutionContext;
  logClient(request);
  return handler(request, env, callerCtx);
}

/** Records how each client connects, for the client compatibility check. Never logs tokens. */
function logClient(request: Request): void {
  console.log(
    JSON.stringify({
      event: "mcp-request",
      method: request.method,
      userAgent: request.headers.get("user-agent"),
      protocolVersion: request.headers.get("mcp-protocol-version"),
      mcpMethod: request.headers.get("mcp-method"),
      hasSession: request.headers.has("mcp-session-id"),
    }),
  );
}
