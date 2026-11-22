import type { McpServer } from "@modelcontextprotocol/server";
import { ProtocolError } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import type { Principal } from "../auth/principal";
import { openWorkspace, skillText } from "./tools";

const INVALID_PARAMS = -32602;

/**
 * Offers the user's skills as MCP prompts, which apps such as Claude Code show as slash commands.
 * The list depends on the caller's workspace, so the handlers read the verified caller per request
 * instead of registering fixed prompts.
 */
export function serveSkillPrompts(server: McpServer, env: Env): void {
  server.server.registerCapabilities({ prompts: {} });

  server.server.setRequestHandler("prompts/list", async () => {
    const workspace = await callerWorkspace(env, "list_skills");
    const skills = await workspace.listSkills();
    return {
      prompts: skills.map((skill) => ({
        name: skill.slug,
        title: skill.name,
        description: skill.description,
        arguments: [{ name: "request", description: "What you want done with this skill", required: false }],
      })),
    };
  });

  server.server.setRequestHandler("prompts/get", async (request) => {
    const workspace = await callerWorkspace(env, "use_skill");
    const skill = await workspace.getSkill(request.params.name);
    if (!skill) throw new ProtocolError(INVALID_PARAMS, `No skill called "${request.params.name}".`);
    return {
      description: skill.description,
      messages: [{ role: "user" as const, content: { type: "text" as const, text: skillText(skill, request.params.arguments?.request) } }],
    };
  });
}

async function callerWorkspace(env: Env, action: string) {
  const principal = getMcpAuthContext()?.props as Principal | undefined;
  if (!principal?.workspaceId) throw new ProtocolError(INVALID_PARAMS, "No verified caller");
  const gate = await openWorkspace(env, principal, action, "read");
  if ("refused" in gate) throw new ProtocolError(INVALID_PARAMS, gate.refused.text);
  return gate.workspace;
}
