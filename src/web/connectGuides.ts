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
  /** Makes Second Brain the app's only memory: where the rule goes and how to switch off the app's own memory. */
  memory: GuideStep[];
}

const NAME = "second-brain";

/** Always-on rule the user pastes into each app, so it uses Second Brain as its only memory. */
export const MEMORY_RULE = [
  "Second Brain (the second-brain MCP server) is my only memory and the source of truth about me.",
  "Before answering anything about me, my work, projects, people, decisions or preferences, search Second Brain and read the relevant notes first.",
  "When I tell you something worth keeping, save it to Second Brain: search first, then update or append to an existing note instead of making a duplicate.",
  "Do not use your built-in memory, memory files or other note tools to store or recall facts about me.",
  "If Second Brain is not connected or a call fails, tell me instead of guessing.",
].join(" ");

/** A shell command that appends the rule to a CLI's global instructions file. */
const appendRule = (file: string) => `mkdir -p ${file.slice(0, file.lastIndexOf("/"))} && cat >> ${file} <<'EOF'\n\n## Memory\n\n${MEMORY_RULE}\nEOF`;

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
      memory: [
        { text: "Go to Settings, then Profile, and paste this into \"What personal preferences should Claude consider in responses?\". Claude reads it in every chat.", code: MEMORY_RULE, codeLabel: "Personal preferences" },
        { text: "Go to Settings, then Capabilities, and turn off memory (\"Generate memory from chat history\" and \"Search and reference chats\"), so Claude does not keep a second memory of its own." },
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
      memory: [
        { text: "Add the rule to your global instructions, which Claude Code loads in every project.", code: appendRule("~/.claude/CLAUDE.md"), codeLabel: "Terminal" },
        { text: "In Claude Code, type /memory and turn auto-memory off, so it stops writing its own memory files." },
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
      memory: [
        { text: "Go to Settings, then Personalization, then Custom instructions, and paste this in.", code: MEMORY_RULE, codeLabel: "Custom instructions" },
        { text: "On the same Personalization page, turn off memory (\"Reference saved memories\" and \"Reference chat history\")." },
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
      memory: [
        { text: "Open Cursor Settings, then Rules, and add this as a User Rule. It applies in every project.", code: MEMORY_RULE, codeLabel: "User Rules" },
        { text: "On the same Rules page, turn off Memories, so Cursor does not keep facts of its own." },
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
      memory: [
        {
          text: "Run Chat: New Instructions File from the Command Palette, choose your user data folder so it applies everywhere, and replace its contents with this.",
          code: `---\napplyTo: "**"\n---\n\n${MEMORY_RULE}`,
          codeLabel: "second-brain.instructions.md",
        },
        { text: "If your Copilot has a memory feature, turn it off in Settings (search for memory)." },
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
      memory: [
        { text: "Add the rule to your global AGENTS.md, which Codex reads in every project.", code: appendRule("~/.codex/AGENTS.md"), codeLabel: "Terminal" },
        { text: "If your Codex version has memories, turn them off, so Second Brain stays the only memory." },
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
      memory: [
        { text: "Add the rule to your global GEMINI.md, which Gemini CLI loads in every session.", code: appendRule("~/.gemini/GEMINI.md"), codeLabel: "Terminal" },
        { text: "Gemini's save_memory tool writes facts into GEMINI.md instead. To turn that memory off, add save_memory to the excluded tools in ~/.gemini/settings.json." },
      ],
    },
    {
      id: "other",
      name: "Any other app",
      where: "anything that supports remote MCP",
      steps: [
        { text: "Add a remote MCP server (it may be called Streamable HTTP or HTTP, not SSE) with this address, including the /mcp at the end.", code: url, codeLabel: "Server URL" },
        { text: "Choose OAuth for authentication and leave the client ID and secret empty: the app registers itself. API keys are not supported." },
        { text: "When the app opens Second Brain, sign in, choose a workspace and Connect." },
      ],
      memory: [
        { text: "Paste this into the app's custom instructions, system prompt or rules, wherever it keeps instructions for every chat. If the app has its own memory, consider turning it off.", code: MEMORY_RULE, codeLabel: "Instructions" },
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

/** Prompts that use the skill library from a connected app. */
export const SKILL_PROMPTS = [
  "List my skills in Second Brain.",
  "Use my Second Brain skill \"Meeting notes\" on the notes I just pasted.",
];
