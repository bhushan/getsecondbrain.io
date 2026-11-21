/** Step-by-step setup for each AI app, built around the workspace's MCP address. */

export interface GuideStep {
  text: string;
  /** Something to paste: a command, a config block or the address. */
  code?: string;
  /** Where the code goes, shown above it. */
  codeLabel?: string;
}

export interface Guide {
  id: string;
  name: string;
  /** Where it runs, shown under the name. */
  where: string;
  /** Plan or version requirements worth knowing before starting. */
  note?: string;
  steps: GuideStep[];
}

const NAME = "second-brain";

export function connectGuides(url: string): Guide[] {
  return [
    {
      id: "claude",
      name: "Claude",
      where: "claude.ai, desktop and mobile apps",
      note: "Add it once on the web or desktop app; it then works on your phone too. The Free plan allows one custom connector.",
      steps: [
        { text: "Open Claude and go to Settings, then Connectors. In some versions this is under Customize, then Connectors." },
        { text: "Choose Add custom connector. If Claude asks for a type, choose Web." },
        { text: "Give it the name Second Brain and paste this address as the server URL. Leave the OAuth fields empty.", code: url, codeLabel: "Server URL" },
        { text: "Choose Add, then Connect. A Second Brain window opens: sign in with Google if asked, pick the workspace, keep \"Create and edit notes\" ticked, and choose Connect." },
        { text: "In a chat, open the tools menu (the + or sliders button) and make sure Second Brain is switched on." },
      ],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      where: "terminal",
      steps: [
        { text: "Run this in a terminal. --scope user makes it available in every project.", code: `claude mcp add --scope user --transport http ${NAME} ${url}`, codeLabel: "Terminal" },
        { text: "Start Claude Code, type /mcp, choose second-brain, then Authenticate. Your browser opens the Second Brain sign-in and consent page; choose the workspace and Connect." },
        { text: "Back in Claude Code, /mcp should show second-brain as connected with 9 tools." },
      ],
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      where: "chatgpt.com",
      note: "Custom MCP connectors need developer mode. Which plans get it, and whether writing is allowed, changes often; on some plans ChatGPT can only read.",
      steps: [
        { text: "Open Settings, then Apps (called Apps and connectors or Connectors in some versions), then Advanced settings, and turn on Developer mode. On a Business or Enterprise workspace an admin may have to allow it first." },
        { text: "Back in Apps, choose Create (or Add app). Name it Second Brain and paste this address as the MCP server URL.", code: url, codeLabel: "MCP server URL" },
        { text: "Set Authentication to OAuth, tick that you trust the app, and choose Create." },
        { text: "ChatGPT opens Second Brain: sign in, pick the workspace and choose Connect." },
        { text: "In a new chat, choose + then Developer mode (or More), and switch Second Brain on for that chat." },
      ],
    },
    {
      id: "cursor",
      name: "Cursor",
      where: "editor",
      steps: [
        {
          text: "Open Cursor Settings, then MCP (Tools and MCP), and choose Add new MCP server. Cursor opens ~/.cursor/mcp.json. Add the second-brain entry; keep any servers already there.",
          code: JSON.stringify({ mcpServers: { [NAME]: { url } } }, null, 2),
          codeLabel: "~/.cursor/mcp.json",
        },
        { text: "Save the file. second-brain appears in the MCP list with a Needs login or Connect button: choose it, then sign in and choose Connect on the Second Brain page." },
        { text: "The dot next to second-brain turns green. Ask in Agent mode to use it." },
      ],
    },
    {
      id: "vscode",
      name: "VS Code",
      where: "GitHub Copilot agent mode",
      steps: [
        {
          text: "Open the Command Palette, run MCP: Open User Configuration, and add this server (keep any others).",
          code: JSON.stringify({ servers: { [NAME]: { type: "http", url } } }, null, 2),
          codeLabel: "mcp.json",
        },
        { text: "Choose Start above the entry. VS Code asks to sign in: allow it, then choose Connect on the Second Brain page." },
        { text: "In Copilot Chat, switch to Agent mode and enable the second-brain tools from the tools button." },
      ],
    },
    {
      id: "codex",
      name: "Codex",
      where: "OpenAI Codex CLI and IDE extension",
      steps: [
        { text: "Add the server.", code: `codex mcp add ${NAME} --url ${url}`, codeLabel: "Terminal" },
        { text: "Sign in by running codex mcp login second-brain. Your browser opens Second Brain; choose the workspace and Connect." },
        { text: "Start Codex and type /mcp to check that second-brain is listed with its tools." },
      ],
    },
    {
      id: "gemini",
      name: "Gemini CLI",
      where: "terminal",
      steps: [
        { text: "Add the server for every project. The HTTP transport matters: the default would try a different protocol.", code: `gemini mcp add --scope user --transport http ${NAME} ${url}`, codeLabel: "Terminal" },
        { text: "Start gemini and run /mcp auth second-brain. Sign in and choose Connect in the browser." },
        { text: "Run /mcp list to see second-brain and its tools." },
      ],
    },
    {
      id: "other",
      name: "Any other app",
      where: "anything that supports remote MCP",
      steps: [
        { text: "Add a remote MCP server (it may be called Streamable HTTP or HTTP, not SSE) with this address. There is no /mcp path.", code: url, codeLabel: "Server URL" },
        { text: "Choose OAuth for authentication and leave the client ID and secret empty: the app registers itself. API keys are not supported." },
        { text: "When the app opens Second Brain, sign in, choose a workspace and Connect." },
      ],
    },
  ];
}

/** Things to ask once connected, to check it works. */
export const TRY_PROMPTS = [
  "Save a note in Second Brain called \"Inbox/First note\" that says what we just talked about.",
  "Search my Second Brain for notes about my current project and summarise them.",
  "What notes are linked to \"Inbox/First note\" in my Second Brain?",
  "Add today's decisions to the end of my note \"Inbox/First note\".",
];
