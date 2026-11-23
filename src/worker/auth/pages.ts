/**
 * Server-rendered auth pages on the app host: the consent screen an AI app opens when it
 * connects, and the calm one-action pages for sign-in and connect errors.
 * Pure string builders: no responses, headers or cookies. Every interpolated value is escaped.
 */
import { appLogo } from "../../web/appLogos";

export const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export interface ConsentView {
  clientName: string;
  /** Set only when the app's metadata document is verified on that domain. */
  clientDomain?: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  /** Whether the app asked for write access. Write stays on by default either way; the page says when it did not. */
  requestedWrite: boolean;
  handle: string;
  email: string;
  workspaces: { id: string; name: string }[];
}

export interface Action {
  href: string;
  label: string;
}

/** Client names we recognise exactly (after lowercasing and collapsing punctuation), mapped to a logo. */
const KNOWN_APPS: Record<string, string> = {
  claude: "claude",
  "claude ai": "claude",
  "claude code": "claude-code",
  chatgpt: "chatgpt",
  cursor: "cursor",
  "vs code": "vscode",
  vscode: "vscode",
  "visual studio code": "vscode",
  codex: "codex",
  "gemini cli": "gemini",
};

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const icon = (paths: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  search: icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  pencil: icon('<path d="M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>'),
  shield: icon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
  verified: icon('<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>'),
  alert: icon('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
  send: icon('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'),
  laptop: icon('<path d="M18 5a2 2 0 0 1 2 2v8.53a2 2 0 0 0 .21.9l1.07 2.12a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.07-2.12a2 2 0 0 0 .21-.9V7a2 2 0 0 1 2-2z"/><path d="M20.05 16H3.95"/>'),
  info: icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
};

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;background:var(--background);color:var(--foreground);font:400 var(--text-base)/1.5 var(--font-sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:radial-gradient(var(--border) 1px,transparent 1px);background-size:24px 24px;mask-image:radial-gradient(80% 60% at 50% 0%,#000,transparent 75%);-webkit-mask-image:radial-gradient(80% 60% at 50% 0%,#000,transparent 75%)}
.glow{position:fixed;left:50%;top:-220px;width:min(900px,140vw);height:520px;transform:translateX(-50%);background:var(--aurora-soft);filter:blur(40px);opacity:.55;pointer-events:none}
.wrap{position:relative;max-width:30rem;margin:0 auto;padding:var(--space-8) var(--space-4) var(--space-12);display:flex;flex-direction:column;gap:var(--space-6)}
.brand{display:flex;align-items:center;justify-content:center;gap:var(--space-2);font-weight:600;font-size:var(--text-sm);letter-spacing:-.01em}
.brand img{width:24px;height:24px;border-radius:7px}
.card{background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:var(--radius-xl);box-shadow:var(--shadow-lg);padding:var(--space-8) var(--space-6)}
h1{margin:0;font-size:var(--text-2xl);line-height:1.2;font-weight:600;letter-spacing:var(--tracking-tight);text-align:center;overflow-wrap:anywhere}
p{margin:0}
strong{font-weight:600;overflow-wrap:anywhere}
.lede{margin-top:var(--space-3);color:var(--muted-foreground);text-align:center;overflow-wrap:anywhere}
.icon{width:18px;height:18px;flex:none}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 var(--space-6);border-radius:var(--radius-pill);font:500 var(--text-sm)/1 var(--font-sans);text-decoration:none;cursor:pointer;border:1px solid transparent;transition:background-color .15s,border-color .15s,opacity .15s}
.btn.primary{background:var(--primary);color:var(--primary-foreground)}
.btn.primary:hover{opacity:.9}
.btn.secondary{background:transparent;color:var(--foreground);border-color:var(--border)}
.btn.secondary:hover{background:var(--accent)}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.foot{text-align:center;color:var(--muted-foreground);font-size:var(--text-sm);overflow-wrap:anywhere}
.foot strong{color:var(--foreground);font-weight:500}

/* Consent */
.pair{display:flex;align-items:center;justify-content:center;gap:var(--space-3);margin-bottom:var(--space-6)}
.tile{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;flex:none;background:var(--muted);border:1px solid var(--border);overflow:hidden}
.tile img{width:32px;height:32px}
.tile.brand-tile{background:none;border:0}
.tile.brand-tile img{width:56px;height:56px}
.monogram{font-size:var(--text-2xl);font-weight:600;color:var(--foreground)}
.dots{display:flex;gap:5px}
.dots i{width:4px;height:4px;border-radius:50%;background:var(--muted-foreground);opacity:.5}
.dots i:nth-child(2){opacity:.8}
.facts{list-style:none;margin:var(--space-6) 0 0;padding:0;display:grid;gap:var(--space-2);font-size:var(--text-sm);color:var(--muted-foreground)}
.facts li{display:flex;gap:var(--space-2);align-items:flex-start;min-width:0}
.facts li span{min-width:0;overflow-wrap:anywhere}
.facts .icon{width:16px;height:16px;margin-top:2px}
.facts strong{color:var(--foreground)}
.facts .ok .icon{color:var(--success)}
.facts .unverified .icon{color:var(--warning)}
.callout{margin-top:var(--space-4);display:flex;gap:var(--space-3);padding:var(--space-3) var(--space-4);border-radius:var(--radius);border:1px solid color-mix(in srgb,var(--warning) 40%,transparent);background:color-mix(in srgb,var(--warning) 10%,transparent);font-size:var(--text-sm)}
.callout .icon{color:var(--warning);margin-top:1px}
.group{border:0;margin:var(--space-6) 0 0;padding:0;min-width:0}
.group legend{padding:0;margin-bottom:var(--space-2);font-size:var(--text-sm);font-weight:600}
.options{display:grid;gap:var(--space-2)}
.option{position:relative;display:flex;align-items:center;gap:var(--space-3);min-height:56px;padding:var(--space-2) var(--space-4) var(--space-2) var(--space-2);border:1px solid var(--border);border-radius:var(--radius-lg);cursor:pointer;transition:border-color .15s,background-color .15s,box-shadow .15s}
.option:hover{background:var(--accent)}
.option:has(input:checked){border-color:var(--foreground);box-shadow:0 0 0 1px var(--foreground)}
.option:has(input:focus-visible){outline:2px solid var(--ring);outline-offset:2px}
.ws-mark{width:40px;height:40px;border-radius:var(--radius);display:grid;place-items:center;flex:none;background:var(--muted);font-weight:600}
.option:has(input:checked) .ws-mark{background:var(--aurora);color:#fff}
.option-name{flex:1;min-width:0;font-weight:500;overflow-wrap:anywhere}
.radio{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--ring);flex:none;display:grid;place-items:center}
.option:has(input:checked) .radio{border-color:var(--foreground)}
.option:has(input:checked) .radio::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--foreground)}
.perms{border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
.perm{display:flex;align-items:center;gap:var(--space-3);min-height:64px;padding:var(--space-3) var(--space-4)}
.perm + .perm{border-top:1px solid var(--border)}
label.perm{cursor:pointer}
label.perm:hover{background:var(--accent)}
.perm-icon{width:36px;height:36px;border-radius:var(--radius);display:grid;place-items:center;flex:none;background:var(--muted);color:var(--foreground)}
.perm-text{flex:1;min-width:0}
.perm-title{display:block;font-weight:500;font-size:var(--text-sm)}
.perm-desc{display:block;color:var(--muted-foreground);font-size:var(--text-sm);line-height:1.45}
.tag{flex:none;font-size:var(--text-xs);font-weight:500;color:var(--muted-foreground);background:var(--muted);border-radius:var(--radius-pill);padding:var(--space-1) var(--space-2)}
.switch{appearance:none;-webkit-appearance:none;margin:0;flex:none;position:relative;width:44px;height:26px;border-radius:var(--radius-pill);background:var(--ring);cursor:pointer;transition:background-color .15s}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:var(--shadow-sm);transition:transform .15s}
.perm-note{display:block;margin-top:6px;color:var(--foreground);font-weight:500}
.switch:checked{background:var(--primary)}
.switch:checked::after{transform:translateX(18px);background:var(--primary-foreground)}
.if-read{display:none}
body:has(#write:not(:checked)) .if-read{display:inline}
body:has(#write:not(:checked)) .if-write{display:none}
.promise{margin-top:var(--space-4);display:flex;gap:var(--space-3);align-items:flex-start;padding:var(--space-3) var(--space-4);border-radius:var(--radius-lg);background:var(--muted);font-size:var(--text-sm);color:var(--muted-foreground)}
.promise .icon{color:var(--foreground);margin-top:1px}
.promise strong{color:var(--foreground)}
.promise p,.callout p{min-width:0;overflow-wrap:anywhere}
.actions{display:flex;flex-direction:row-reverse;gap:var(--space-3);margin-top:var(--space-6)}
.actions .btn{flex:1}
@media (max-width:420px){
  .wrap{padding-top:var(--space-6)}
  .card{padding:var(--space-6) var(--space-4);border-radius:var(--radius-lg)}
  h1{font-size:var(--text-xl)}
  .actions{flex-direction:column}
  .btn{min-height:48px}
}

/* Message */
.message{text-align:center}
.message .badge{width:48px;height:48px;margin:0 auto var(--space-4);border-radius:var(--radius-lg);display:grid;place-items:center;background:var(--muted);color:var(--foreground)}
.message .badge .icon{width:22px;height:22px}
.message .lede{margin-bottom:var(--space-6)}
.message .btn{width:100%}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/tokens.css">
<style>${STYLE}</style></head>
<body><div class="glow" aria-hidden="true"></div>
<main class="wrap">
<div class="brand"><img src="/logo.svg" alt="" width="24" height="24"><span>Second Brain</span></div>
${body}
</main></body></html>`;
}

/**
 * The app's own logo when its name exactly matches a known app AND its domain is verified, otherwise its
 * first letter. A self-registered name is not proof, so it never borrows a real app's logo.
 */
function appTile(clientName: string, verified: boolean): string {
  const id = verified ? KNOWN_APPS[normalise(clientName)] : undefined;
  const logo = id ? appLogo(id) : undefined;
  if (logo) return `<span class="tile"><img src="${logo.src}" alt=""${logo.mono ? ' class="logo-mono"' : ""} width="32" height="32"></span>`;
  return `<span class="tile"><span class="monogram">${escape([...clientName][0] ?? "?")}</span></span>`;
}

const first = (name: string) => escape(([...name][0] ?? "?").toUpperCase());

export function consentPage(view: ConsentView): string {
  const name = escape(view.clientName);
  const publisher = view.clientDomain
    ? `<li class="ok">${ICONS.verified}<span>Published by <strong>${escape(view.clientDomain)}</strong></span></li>`
    : `<li class="unverified">${ICONS.alert}<span>This app registered itself, so its name is not verified.</span></li>`;
  const loopback = view.redirectIsLoopback
    ? `<div class="callout" role="note">${ICONS.laptop}<p><strong>Access goes to an app on your computer.</strong> Continue only if you just started connecting from it.</p></div>`
    : "";
  const workspaces = view.workspaces
    .map(
      (workspace, index) =>
        `<label class="option"><input class="sr" type="radio" name="workspace" value="${escape(workspace.id)}"${index === 0 ? " checked" : ""}><span class="ws-mark" aria-hidden="true">${first(workspace.name)}</span><span class="option-name">${escape(workspace.name)}</span><span class="radio" aria-hidden="true"></span></label>`,
    )
    .join("");
  return shell(
    `Connect ${view.clientName}`,
    `<section class="card" aria-labelledby="title">
<div class="pair" aria-hidden="true">${appTile(view.clientName, Boolean(view.clientDomain))}<span class="dots"><i></i><i></i><i></i></span><span class="tile brand-tile"><img src="/logo.svg" alt="" width="56" height="56"></span></div>
<h1 id="title">Connect ${name} to Second Brain</h1>
<p class="lede" aria-live="polite"><span class="if-write">${name} will be able to search, read, create and edit notes in the workspace you choose.</span><span class="if-read">${name} will be able to search and read notes in the workspace you choose.</span></p>
<ul class="facts">${publisher}<li>${ICONS.send}<span>Access will be sent to <strong>${escape(view.redirectHost)}</strong></span></li></ul>
${loopback}
<form method="post">
<input type="hidden" name="handle" value="${escape(view.handle)}">
<fieldset class="group"><legend>Workspace</legend><div class="options">${workspaces}</div></fieldset>
<fieldset class="group"><legend>What it can do</legend><div class="perms">
<div class="perm"><span class="perm-icon">${ICONS.search}</span><span class="perm-text"><span class="perm-title">Search and read notes</span><span class="perm-desc">Find your notes and read them to answer you.</span></span><span class="tag">Always on</span></div>
<label class="perm" for="write"><span class="perm-icon">${ICONS.pencil}</span><span class="perm-text"><span class="perm-title">Create and edit notes</span><span class="perm-desc">Save new notes and update existing ones. Every edit is kept as a revision.${view.requestedWrite ? "" : `<span class="perm-note">${name} asked only to read your notes. Turn this off to keep it read only.</span>`}</span></span><input class="switch" type="checkbox" role="switch" id="write" name="write" value="on" checked></label>
</div></fieldset>
<div class="promise">${ICONS.shield}<p><strong>Apps can never delete your notes for good.</strong> Anything they trash waits for you to restore. You can disconnect ${name} any time from Connected apps.</p></div>
<div class="actions"><button class="btn primary" name="decision" value="approve">Connect</button><button class="btn secondary" name="decision" value="deny">Cancel</button></div>
</form>
</section>
<p class="foot">Signed in as <strong>${escape(view.email)}</strong></p>`,
  );
}

/** A calm page that says what happened and offers one way forward. */
export function messagePage(title: string, message: string, action: Action): string {
  return shell(
    title,
    `<section class="card message" aria-labelledby="title">
<div class="badge">${ICONS.info}</div>
<h1 id="title">${escape(title)}</h1>
<p class="lede">${escape(message)}</p>
<a class="btn primary" href="${escape(action.href)}">${escape(action.label)}</a>
</section>`,
  );
}
