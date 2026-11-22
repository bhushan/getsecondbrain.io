/**
 * The public site on the www host: landing page, privacy policy, terms and the not-found page.
 * Server-rendered HTML with no inline scripts or styles: every page links `/tokens.css` and
 * `/site.css`, and the landing page loads `/site.js`, all from our own static files. The pages are
 * complete without JavaScript; the script only adds motion and a copy button.
 */

import { appLogo } from "../../web/appLogos";
import { connectGuides } from "../../web/connectGuides";

export const CONTACT = "hello@getsecondbrain.io";
const EFFECTIVE = "22 November 2026";

export const SITE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Where links on the site point: the app (sign in) and the site itself (absolute social image). */
export interface Origins {
  app: string;
  site: string;
}

interface Page {
  title: string;
  description: string;
  body: string;
  origins: Origins;
  /** The page's own path, for its canonical address. Null for pages search engines should skip. */
  path: string | null;
  script?: boolean;
  /** Structured data (schema.org) for search and answer engines. */
  structured?: unknown;
}

/** JSON for a data block inside HTML: `<` is escaped so no text can close the script element. */
const jsonForHtml = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

function shell({ title, description, body, origins, path, script = false, structured }: Page): string {
  const url = path === null ? null : `${origins.site}${path}`;
  const indexing = url ? `<link rel="canonical" href="${url}"><meta property="og:url" content="${url}">` : `<meta name="robots" content="noindex">`;
  return `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><meta name="description" content="${description}">
${indexing}
<meta name="color-scheme" content="dark"><meta name="theme-color" content="#09090b">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website"><meta property="og:site_name" content="Second Brain">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:image" content="${origins.site}/og/social.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Second Brain: one memory for every AI app you use.">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/site.css">${structured ? `\n<script type="application/ld+json">${jsonForHtml(structured)}</script>` : ""}${script ? `\n<script src="/site.js" defer></script>` : ""}</head><body>${body}</body></html>`;
}

/* Icons: 24px line icons drawn with currentColor, always decorative (the text beside them says it). */
const ICONS = {
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  browser: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>`,
  desktop: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>`,
  phone: `<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>`,
  editor: `<path d="m16 17 5-5-5-5M8 7l-5 5 5 5"/>`,
  terminal: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>`,
  plug: `<path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3"/>`,
  layers: `<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>`,
  pen: `<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/><path d="m14 6 3 3"/>`,
  shield: `<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>`,
  history: `<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>`,
  unplug: `<path d="m19 5 2-2M3 21l2-2M7 13l-2 2a3 3 0 0 0 4 4l2-2zM17 11l2-2a3 3 0 0 0-4-4l-2 2zM8 8l8 8"/>`,
  ban: `<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
  check: `<path d="m5 12 5 5 9-10"/>`,
  note: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>`,
} as const;
type IconName = keyof typeof ICONS;

const icon = (name: IconName, cls = "icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** An app's logo as an image; single-colour logos get `logo-mono` so a light theme can invert them. */
function logo(guideId: string, size = 20): string {
  const found = appLogo(guideId);
  if (!found) throw new Error(`No logo for ${guideId}`);
  return `<img src="${found.src}" alt="" width="${size}" height="${size}" class="app-logo${found.mono ? " logo-mono" : ""}">`;
}

const brand = () =>
  `<span class="brand-row"><a class="brand" href="/"><img src="/logo.svg" alt="" width="28" height="28">Second Brain</a><span class="beta-tag">Beta</span></span>`;

const NAV_LINKS: [string, string][] = [
  ["how", "How it works"],
  ["skills", "Skills"],
  ["integrations", "Integrations"],
  ["security", "Security"],
  ["faq", "FAQ"],
];
const navLinks = () => NAV_LINKS.map(([id, label]) => `<li><a href="/#${id}">${label}</a></li>`).join("");

/** Pill navigation. On phones the links move into a native disclosure menu, so it works without a script. */
const nav = (appOrigin: string) => `<nav class="nav" aria-label="Site">${brand()}
<ul class="nav-links">${navLinks()}</ul>
<a class="button primary small" href="${appOrigin}/">Sign in</a>
<details class="menu"><summary aria-label="Menu">${icon("menu")}</summary><ul>${navLinks()}</ul></details></nav>`;

const footer = (appOrigin: string) => `<footer class="footer"><div class="wrap">
<div class="foot-brand">${brand()}<p>One memory for every AI app you use.</p></div>
<div class="foot-cols">
<div><h2>Product</h2><ul>${navLinks()}</ul></div>
<div><h2>Legal</h2><ul><li><a href="/privacy">Privacy policy</a></li><li><a href="/terms">Terms of service</a></li></ul></div>
<div><h2>Contact</h2><ul><li><a href="mailto:${CONTACT}">${CONTACT}</a></li><li><a href="${appOrigin}/">Sign in</a></li></ul></div>
</div>
<p class="copyright"><span>© 2026 Second Brain. Private beta.</span><span><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span></p>
</div></footer>`;

/** The apps with a setup guide in the app, so the site and the guides never disagree. */
const GUIDED_APPS = connectGuides("https://example.invalid/mcp").filter((guide) => guide.id !== "other");
export const APP_NAMES = GUIDED_APPS.map((guide) => guide.name);

const appList = (hidden: boolean) =>
  `<ul class="marquee-track"${hidden ? ' aria-hidden="true"' : ""}>${GUIDED_APPS.map((app) => `<li class="app-pill">${logo(app.id)}${app.name}</li>`).join("")}<li class="app-pill any">${icon("plug", "icon app-logo")}Any MCP app</li></ul>`;

const appGrid = () =>
  `<ul class="app-grid">${GUIDED_APPS.map((app) => `<li class="app-card">${logo(app.id, 28)}<h3>${app.name}</h3><p>${app.where}</p></li>`).join("")}<li class="app-card any">${icon("plug", "icon app-logo")}<h3>Any MCP app</h3><p>Any app or agent that supports remote MCP connectors</p></li></ul>`;

const DEVICES: [IconName, string][] = [
  ["browser", "Browser"],
  ["desktop", "Desktop"],
  ["phone", "Phone"],
  ["editor", "Editor"],
  ["terminal", "Terminal"],
];
const deviceRow = () => `<ul class="devices" aria-label="Where it works">${DEVICES.map(([name, label]) => `<li>${icon(name)}${label}</li>`).join("")}</ul>`;

export const listInWords = (names: string[]) => `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export const FAQ: [string, string][] = [
  ["Which apps can connect?", `Any app or agent that supports MCP connectors. There are step-by-step guides for ${listInWords(APP_NAMES)}.`],
  ["Does it work on my phone?", "Yes. Second Brain lives online, so a connected app can reach your notes wherever it runs: in the browser, in desktop and phone apps, in your editor and in the terminal. In Claude, a connector you add on the web also works in the mobile app."],
  ["Do I need to install anything?", "No. You add one address to each app. Chat apps take it in their settings, and terminal agents add it with one command. Each guide in Second Brain shows exactly where it goes."],
  ["Can a connected app delete my notes?", "No. Apps can search, read and, if you allow it, save notes. Only you can move a note to the trash, and you can restore it from there."],
  ["What are skills?", "Instructions you write once, such as how to write a post in your voice or how you review code. Every connected app sees your skills, follows the one that fits a task, or uses the one you name. You can write a skill, paste a SKILL.md or group skills into bundles. Apps can use skills but can never change them."],
  ["Can I bring my Obsidian vault?", "Yes. Pick the vault folder and every note comes in with its links, tags and folders. Importing again skips notes that have not changed."],
  ["Who can read my notes?", "You, and the apps you connect to that workspace. Notes are encrypted at rest and in transit, but not end to end, because Second Brain has to read them to search and to answer your apps. Your notes are never used to train AI models."],
  ["How do I get access?", `Second Brain is in private beta and access is by invitation. Write to <a href="mailto:${CONTACT}">${CONTACT}</a> to ask for a place.`],
];

/** Text without markup, for structured data and llms.txt. */
export const plainText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export const SITE_SUMMARY =
  "Second Brain keeps your notes as one linked map that every AI app you connect can search, read and add to, through one MCP address. Save something in Claude, find it in ChatGPT, Cursor or your terminal. Write skills once and every connected app can follow them.";

/** schema.org data for the landing page: who makes it, what it is, and the FAQ as answers. */
function landingStructuredData(origins: Origins) {
  const home = `${origins.site}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${home}#organization`,
        name: "Second Brain",
        url: home,
        logo: `${origins.site}/logo-512.png`,
        email: CONTACT,
      },
      { "@type": "WebSite", "@id": `${home}#website`, name: "Second Brain", url: home, publisher: { "@id": `${home}#organization` } },
      {
        "@type": "SoftwareApplication",
        name: "Second Brain",
        url: home,
        description: SITE_SUMMARY,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Web",
        publisher: { "@id": `${home}#organization` },
        featureList: [
          "One memory shared by every AI app you connect",
          "Works with any app or agent that supports MCP, including " + listInWords(APP_NAMES),
          "Notes kept as a linked map, with every revision saved",
          "Skills: instructions you write once for every connected app",
          "Separate workspaces, read-only or read and write access, apps never delete",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: plainText(answer) },
        })),
      },
    ],
  };
}

/*
 * The hero map. Fixed coordinates; each note and link is classed by its distance (in links) from the
 * centre note, and site.css delays it by that level, so the map develops outward. The note an AI app
 * saved links in last.
 */
type MapNode = { x: number; y: number; r: number; label?: string };
const NODES: MapNode[] = [
  { x: 560, y: 300, r: 20, label: "Project notes" },
  { x: 330, y: 380, r: 15, label: "Reading list" },
  { x: 820, y: 170, r: 14, label: "Trips/Lisbon" },
  { x: 760, y: 410, r: 12, label: "Deploy checklist" },
  { x: 430, y: 170, r: 10 },
  { x: 250, y: 230, r: 6 },
  { x: 960, y: 470, r: 8 },
  { x: 640, y: 500, r: 7 },
  { x: 470, y: 505, r: 6 },
  { x: 170, y: 410, r: 7 },
  { x: 1010, y: 300, r: 9, label: "Travel ideas" },
  { x: 900, y: 70, r: 6 },
  { x: 660, y: 110, r: 8 },
  { x: 1110, y: 400, r: 5 },
  { x: 90, y: 310, r: 5 },
  { x: 330, y: 540, r: 5 },
  { x: 830, y: 540, r: 6 },
  { x: 1110, y: 170, r: 5 },
  { x: 200, y: 90, r: 6 },
  { x: 590, y: 410, r: 6 },
  { x: 1150, y: 520, r: 4 },
  { x: 70, y: 500, r: 4 },
];
const SAVED = 2;
const EDGES: [number, number][] = [
  [0, 1], [0, 3], [0, 4], [0, 19], [4, 5], [4, 18], [4, 12], [12, 11], [1, 9], [9, 14], [1, 15], [1, 8],
  [3, 6], [3, 7], [7, 8], [6, 13], [6, 16], [3, 10], [10, 17], [5, 14], [19, 3], [7, 16], [13, 20], [9, 21],
];
const SAVED_EDGES: [number, number][] = [[2, 0], [2, 12], [2, 10]];
/** site.css has a delay for levels 0 to MAX_LEVEL. */
const MAX_LEVEL = 6;

const nodeAt = (index: number): MapNode => {
  const node = NODES[index];
  if (!node) throw new Error(`No map node ${index}`);
  return node;
};

function levels(): Map<number, number> {
  const depth = new Map<number, number>([[0, 0]]);
  for (let frontier = [0]; frontier.length; ) {
    const next: number[] = [];
    for (const at of frontier)
      for (const [a, b] of EDGES) {
        const other = a === at ? b : b === at ? a : -1;
        if (other >= 0 && !depth.has(other)) depth.set(other, depth.get(at)! + 1), next.push(other);
      }
    frontier = next;
  }
  if (Math.max(...depth.values()) > MAX_LEVEL) throw new Error("Hero map is deeper than site.css animates");
  return depth;
}

function heroMap(): string {
  const depth = levels();
  const level = (node: number) => `lv${depth.get(node) ?? 0}`;
  const line = ([a, b]: [number, number], cls: string) =>
    `<path class="${cls}" pathLength="1" data-a="${a}" data-b="${b}" d="M${nodeAt(a).x} ${nodeAt(a).y}L${nodeAt(b).x} ${nodeAt(b).y}"/>`;
  const edges = EDGES.map((edge) => line(edge, `e ${depth.get(edge[0])! > depth.get(edge[1])! ? level(edge[0]) : level(edge[1])}`)).join("");
  const savedEdges = SAVED_EDGES.map((edge, i) => line(edge, `e late${i === 0 ? " saved-edge" : ""}`)).join("");
  const dots = NODES.map((n, i) => (i === SAVED ? "" : `<circle class="n ${level(i)}" data-i="${i}" cx="${n.x}" cy="${n.y}" r="${n.r}"/>`)).join("");
  const saved = nodeAt(SAVED);
  const labels = NODES.map((n, i) =>
    n.label ? `<text class="lbl ${i === SAVED ? "late saved-label" : level(i)}" data-for="${i}" x="${n.x + n.r + 10}" y="${n.y + 5}">${n.label}</text>` : "",
  ).join("");
  return `<svg class="map" viewBox="0 0 1200 600" role="img" aria-label="A map of notes joined by links. A new note saved by an AI app links into it last.">
<defs><linearGradient id="map-aurora" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6d5cff"/><stop offset=".55" stop-color="#d946ef"/><stop offset="1" stop-color="#ffb547"/></linearGradient></defs>
${edges}${savedEdges}${dots}
<circle class="ring late" data-ring="${SAVED}" cx="${saved.x}" cy="${saved.y}" r="${saved.r}"/>
<circle class="n saved late" data-i="${SAVED}" cx="${saved.x}" cy="${saved.y}" r="${saved.r}" fill="url(#map-aurora)"/>
${labels}</svg>`;
}

const HERO_MAP = heroMap();

/** The product window in the hero: a workspace bar over the living map. */
const productWindow = () => `<div class="window" aria-label="Second Brain showing the Personal workspace as a map of linked notes" role="group">
<div class="window-bar"><span class="ws"><span class="ws-dot" aria-hidden="true"></span>Personal</span>
<span class="window-search">${icon("search")}Search notes</span>
<span class="window-apps">${logo("claude", 18)}${logo("chatgpt", 18)}${logo("cursor", 18)}<span>3 apps connected</span></span></div>
${HERO_MAP}</div>`;

/** Small product moments floating around the hero window. Decorative: the map says the same thing. */
const floatingCards = () => `<div class="floats" aria-hidden="true">
<div class="float f1">${logo("claude")}<div><strong>Claude saved</strong><span>Trips/Lisbon</span></div><span class="tag">New</span></div>
<div class="float f2">${logo("cursor")}<div><strong>Cursor searched</strong><span>“deploy checklist”</span></div></div>
<div class="float f3"><div><strong>Personal workspace</strong><span class="perm"><span class="on">${icon("check")}Read</span><span class="on">${icon("check")}Write</span><span class="off">${icon("ban")}Delete</span></span></div></div>
<div class="float f4">${logo("chatgpt")}<div><strong>ChatGPT recalled</strong><span>Trips/Lisbon</span></div></div>
</div>`;

/* How it works: three steps, each with a small working piece of the product. */
const connectVisual = (mcpResource: string) => `<div class="mini dialog" aria-hidden="true">
<p class="mini-title">${logo("claude", 16)}Add custom connector</p>
<span class="mini-label">Name</span><span class="field">Second Brain</span>
<span class="mini-label">Server URL</span><span class="field mono">${mcpResource}</span>
<span class="mini-actions"><span class="mini-check">${icon("check")}Create and edit notes</span><span class="mini-button">Connect</span></span>
</div>`;

const saveVisual = () => `<div class="mini term" aria-hidden="true">
<p class="mini-title">${logo("claude-code", 16)}Claude Code</p>
<p class="term-line"><span class="prompt">›</span> remember: run the deploy checklist before every Friday release</p>
<p class="tool">${icon("note")}second-brain · save_note</p>
<p class="term-line muted">Saved to Work/Deploy checklist and linked it to Releases.</p>
</div>`;

const recallVisual = () => `<div class="mini search" aria-hidden="true">
<p class="mini-title">${logo("cursor", 16)}Cursor</p>
<p class="query">${icon("search")}deploy checklist</p>
<ul><li class="hit">${icon("note")}<span>Work/Deploy checklist</span><span class="from">Claude Code</span></li><li>${icon("note")}<span>Work/Releases</span></li><li>${icon("note")}<span>Projects/Site launch</span></li></ul>
</div>`;

export const RULES: [IconName, string, string][] = [
  ["layers", "Separate workspaces", "Each workspace is kept apart. An app only sees the one you chose when you connected it."],
  ["pen", "Read, or read and write", "You decide whether an app can only search and read, or can also save new notes."],
  ["shield", "Apps never delete", "Apps can never delete a note. Only you can, and the trash lets you take it back."],
  ["history", "Every change kept", "Each edit is saved as a revision, and the activity log shows which app did what."],
  ["unplug", "Disconnect any time", "See what each connected app did, and disconnect any app at any time."],
  ["ban", "Never used to train AI models", "Your notes are used only to run Second Brain for you. They are never sold and never used to train AI models."],
];

const SKILL_USES: [string, string, string, string][] = [
  ["claude-code", "Claude Code", "draft a post about the launch", "Followed Blog post: opened with the point, three short sections."],
  ["chatgpt", "ChatGPT", "use my blog post skill on these notes", "Wrote it in your voice, ending with one thing to try today."],
  ["cursor", "Cursor", "write up this release for the blog", "Picked your Blog post skill for this."],
];

const skillsShowcase = () => `<div class="skills-show">
<article class="skill-sheet" aria-label="A skill saved in Second Brain">
<p class="skill-path">Skills / Writing / Blog post</p>
<h3>Blog post</h3>
<p class="skill-when"><span>When to use it</span>Write a blog post in my voice. Use when I ask for a post or an article.</p>
<ol class="skill-steps"><li>Open with the point, not the backstory.</li><li>Short paragraphs, one idea each.</li><li>End with one thing the reader can do today.</li></ol>
</article>
<ul class="skill-uses" aria-label="The same skill used in three apps">${SKILL_USES.map(
  ([id, name, ask, reply]) =>
    `<li class="skill-use"><p class="mini-title">${logo(id, 16)}${name}</p><p class="term-line"><span class="prompt">›</span> ${ask}</p><p class="tool">${icon("note")}second-brain · use_skill</p><p class="term-line muted">${reply}</p></li>`,
).join("")}</ul>
</div>
<ul class="skill-points">
<li><h3>Write, paste or bundle</h3><p>Write a skill on the Skills page, paste a SKILL.md you already use, or group skills into bundles like Writing or Code.</p></li>
<li><h3>Used when it fits</h3><p>Apps see each skill's name and when to use it. They follow the one that fits a task, or the one you ask for.</p></li>
<li><h3>Only you change them</h3><p>Apps can use your skills but can never write or edit one, so no app can rewrite how the others behave.</p></li>
</ul>`;

const sectionHead = (eyebrow: string, title: string, intro: string) =>
  `<div class="section-head"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p class="intro">${intro}</p></div>`;

export function landingPage(origins: Origins, mcpResource: string): string {
  const app = `${origins.app}/`;
  return shell({
    title: "Second Brain: one memory for every AI app",
    description: "Keep your notes as one linked map, and let Claude, ChatGPT, Cursor and any other AI app or agent save and recall them through one MCP address.",
    origins,
    path: "/",
    script: true,
    structured: landingStructuredData(origins),
    body: `<header class="hero">
<div class="hero-glow" aria-hidden="true"></div>
${nav(origins.app)}
<div class="hero-copy">
<a class="eyebrow-pill" href="#integrations"><span class="pulse" aria-hidden="true"></span>Private beta. Works with any MCP app${icon("arrow")}</a>
<h1>One memory for every AI app you use.</h1>
<p class="lede">Save something in Claude, find it in ChatGPT, Cursor or your terminal. Second Brain keeps your notes as one linked map that every AI app you connect can search, read and add to.</p>
<div class="actions"><a class="button primary" href="${app}">Open Second Brain</a>
<a class="button ghost" href="#how">See how it works</a></div>
<p class="works-with">Works with any AI app or agent that supports MCP, on any device: in the browser, on desktop and phone, in your editor and in the terminal.</p>
</div>
<div class="stage">${productWindow()}${floatingCards()}</div>
</header>

<div class="marquee-band" aria-label="Apps with a setup guide">
<p class="marquee-label">Works with the AI apps you already use</p>
<div class="marquee">${appList(false)}${appList(true)}</div>
</div>

<main>
<section id="how" class="section"><div class="wrap">
${sectionHead("How it works", "Connect once. Remember everywhere.", "Add one address to each app. From then on, anything one app saves, every other app can find.")}
<ol class="how-grid">
<li class="how-card"><span class="num">1</span><h3>Connect one address</h3><p>Paste the Second Brain address into any AI app, sign in and pick a workspace.</p>${connectVisual(mcpResource)}</li>
<li class="how-card"><span class="num">2</span><h3>Save from any app</h3><p>Ask any connected app to remember something. It lands as a linked note in your map.</p>${saveVisual()}</li>
<li class="how-card"><span class="num">3</span><h3>Recall everywhere</h3><p>Any other app you connect can search and read the same notes, on any device.</p>${recallVisual()}</li>
</ol>
</div></section>

<section class="section relay-section"><div class="wrap">
${sectionHead("One memory, many apps", "Save it in one app. Find it in another.", "What Claude saves, ChatGPT can find. Your memory stops being locked inside one assistant.")}
<div class="relay">
<div class="relay-col"><div class="chat" aria-label="A conversation in Claude">
<h3>${logo("claude")}In Claude, on Monday</h3>
<p class="you" data-step="0">Save my Lisbon notes: we're staying in Alfama, and the 28 tram queue is shortest after 10.</p>
<p class="app" data-step="1">Saved to Trips/Lisbon and linked it to Travel ideas.</p>
</div><span class="link-line" data-step="2" aria-hidden="true"></span></div>
<article class="note" data-step="3" aria-label="The saved note">
<p class="path">Trips / Lisbon</p>
<h3>Lisbon</h3>
<p>Staying in Alfama. Take the 28 tram after 10, when the queue is short.</p>
<p>See <span class="wiki">[[Travel ideas]]</span></p>
</article>
<div class="relay-col right"><span class="link-line" data-step="4" aria-hidden="true"></span><div class="chat" aria-label="A conversation in ChatGPT">
<h3>${logo("chatgpt")}In ChatGPT, a week later</h3>
<p class="you" data-step="5">Where are we staying in Lisbon?</p>
<p class="app" data-step="6">In Alfama, from your note Trips/Lisbon. You also noted the 28 tram queue is shortest after 10.</p>
</div></div>
</div>
</div></section>

<section id="skills" class="section skills-section"><div class="wrap">
${sectionHead("Skills", "Teach it once. Every app follows it.", "Write down how you like things done, once. Claude, ChatGPT, Cursor and every other app you connect can use the same skill.")}
${skillsShowcase()}
</div></section>

<section id="integrations" class="section"><div class="wrap">
<div class="surface integrations">
<div class="surface-glow" aria-hidden="true"></div>
${sectionHead("Integrations", "Connect any AI app or agent, on any device", "Chat apps, code editors and terminal agents all connect the same way, and every one shares the same memory. Each has a step-by-step guide in Second Brain.")}
${deviceRow()}
${appGrid()}
<div class="connect">
<div class="connect-address"><p class="address-label">Your connector address</p>
<div class="address-row"><code class="address">${mcpResource}</code></div>
<p class="address-note">The same address for every app and every device.</p></div>
<ol class="steps">
<li class="step"><h3>Add the address</h3><p>Add it as a custom connector in your app, or with one command in a terminal agent.</p></li>
<li class="step"><h3>Sign in and choose</h3><p>Sign in to Second Brain when the app asks, pick a workspace, and choose read only or read and write.</p></li>
<li class="step"><h3>Save and recall</h3><p>Ask the app to save something, then ask any connected app to find it.</p></li>
</ol>
</div>
</div>
</div></section>

<section id="security" class="section"><div class="wrap">
${sectionHead("Security", "You stay in charge", "Apps get exactly the access you give them, and nothing more. You can see what they did and take it back.")}
<ul class="rules">${RULES.map(([name, title, text]) => `<li class="rule">${icon(name)}<h3>${title}</h3><p>${text}</p></li>`).join("")}</ul>
</div></section>

<section id="faq" class="section faq"><div class="wrap">
${sectionHead("FAQ", "Questions", "If yours is not here, write to us.")}
<div class="faq-list">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
</div></section>

<section class="section closing"><div class="wrap">
<div class="surface cta">
<div class="surface-glow" aria-hidden="true"></div>
<h2>Give every AI app the same memory.</h2>
<p class="intro">Second Brain is in private beta, by invitation.</p>
<div class="actions"><a class="button primary" href="${app}">Open Second Brain</a><a class="button ghost" href="mailto:${CONTACT}">Ask for an invite</a></div>
</div>
</div></section>
</main>${footer(origins.app)}`,
  });
}

/** Header card shared by the legal pages and the not-found page. */
const pageHead = (appOrigin: string, eyebrow: string, title: string, sub: string) => `<header class="hero page-head">
<div class="hero-glow" aria-hidden="true"></div>
${nav(appOrigin)}
<div class="hero-copy"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lede">${sub}</p></div>
</header>`;

const docPage = (origins: Origins, path: string, title: string, description: string, content: string) =>
  shell({
    title: `${title}, Second Brain`,
    description,
    origins,
    path,
    body: `${pageHead(origins.app, "Legal", title, `Effective ${EFFECTIVE}`)}
<main class="doc">${content}</main>${footer(origins.app)}`,
  });

export function notFoundPage(origins: Origins): string {
  return shell({
    title: "Page not found, Second Brain",
    description: "That page does not exist.",
    origins,
    path: null,
    body: `<header class="hero page-head not-found">
<div class="hero-glow" aria-hidden="true"></div>
${nav(origins.app)}
<div class="hero-copy"><p class="eyebrow">404</p><h1>That page does not exist.</h1><p class="lede">The link may be old, or the address may have a typo.</p>
<div class="actions"><a class="button primary" href="/">Go to the home page</a><a class="button ghost" href="/#faq">Read the FAQ</a></div></div>
</header>${footer(origins.app)}`,
  });
}

export function privacyPage(origins: Origins): string {
  return docPage(
    origins,
    "/privacy",
    "Privacy policy",
    "What Second Brain collects, why, and the choices you have.",
    `<p>Second Brain is a hosted notes service. This policy explains what we collect, how we use it, and what you can do about it. Questions go to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

<h2>What we collect</h2>
<ul>
<li><strong>Your Google account basics.</strong> When you sign in with Google we receive your name, email address and a Google account identifier. We do not receive your Google password or access to anything else in your Google account.</li>
<li><strong>Your content.</strong> The notes you write, import or save through a connected app, their earlier revisions, the links and tags inside them, and the names of your workspaces.</li>
<li><strong>Connected apps.</strong> Which apps you connected, the workspace and permissions you gave each one, and when.</li>
<li><strong>Activity.</strong> A log of what you and each connected app did in a workspace, such as creating, editing or searching notes, with the time.</li>
<li><strong>Technical data.</strong> Our hosting provider, Cloudflare, processes your IP address and browser details to deliver the service and keep it secure. Request logs are kept for a short time to fix problems.</li>
</ul>

<h2>How we use it</h2>
<p>Only to run Second Brain for you: to sign you in, store and show your notes, answer requests from the apps you connected, keep the service secure, and fix problems. We do not sell your data, we do not show ads, and we do not use your notes to train AI models.</p>

<h2>Google user data</h2>
<p>Second Brain's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. We use your Google name and email only to create your account, sign you in and show who is signed in. We do not transfer it to others except as needed to run the service, and we never use it for advertising.</p>

<h2>Apps you connect</h2>
<p>When you connect an AI app, the notes that app searches or reads are sent to it, and anything it saves is stored in your workspace. What the app then does with your notes is governed by that app's own privacy policy. You can see each app's activity in Second Brain and disconnect it at any time.</p>

<h2>Where your data lives</h2>
<p>Your data is stored with Cloudflare, which encrypts it at rest and in transit. Each workspace is stored separately from every other workspace. Your notes are not end-to-end encrypted, because the service has to read them to search them and to answer your connected apps. We look at your content only when you ask us to help with a problem, or when the law requires it.</p>

<h2>Cookies</h2>
<p>We use one cookie to keep you signed in and one short-lived cookie during sign-in. We do not use analytics, advertising or tracking cookies.</p>

<h2>How long we keep it</h2>
<p>Your notes stay until you delete them. Notes you move to the trash can be restored. If you delete a workspace, you can restore it for 30 days; after that its notes are erased. If you ask us to delete your account, we delete your notes, workspaces and account details; copies in our provider's recovery backups expire within 30 days.</p>

<h2>Your choices</h2>
<p>You can edit or remove your notes, disconnect apps, and ask us for a copy of your data or to delete your account by writing to <a href="mailto:${CONTACT}">${CONTACT}</a>. Depending on where you live, you may have further rights under laws such as the GDPR; we will honour them.</p>

<h2>Children</h2>
<p>Second Brain is not meant for children under 16, and we do not knowingly collect their data.</p>

<h2>Changes</h2>
<p>If we change this policy, we will update this page and its effective date, and tell you in the app before any change that reduces your rights.</p>`,
  );
}

export function termsPage(origins: Origins): string {
  const appOrigin = origins.app;
  return docPage(
    origins,
    "/terms",
    "Terms of service",
    "The rules for using Second Brain.",
    `<p>These terms apply when you use Second Brain at <a href="${appOrigin}/">${new URL(appOrigin).host}</a> and through its MCP connector. By using it you agree to them. Questions go to <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

<h2>The beta</h2>
<p>Second Brain is in private beta. Features may change, and the service may sometimes be unavailable. Keep your own copy of anything you cannot afford to lose.</p>

<h2>Your account</h2>
<p>You sign in with a Google account and are responsible for what happens under your account, including what the apps you connect do with the permissions you give them.</p>

<h2>Your content</h2>
<p>Your notes belong to you. You give us permission to store, process and display them only as needed to run the service for you, including sending them to the apps you connect. This permission ends when you delete the content or your account.</p>

<h2>Acceptable use</h2>
<p>Do not use Second Brain to break the law, to store content you have no right to store, to attack or overload the service, or to access workspaces that are not yours. We may suspend accounts that do.</p>

<h2>Connected apps</h2>
<p>AI apps you connect are run by other companies under their own terms. We are not responsible for what they do with the notes you let them read.</p>

<h2>Ending use</h2>
<p>You can stop using Second Brain at any time and ask us to delete your account. We may end the beta or close an account with reasonable notice, and we will give you a way to get your notes out first unless the law prevents it.</p>

<h2>No warranty</h2>
<p>The service is provided as it is, without warranties of any kind, to the extent the law allows.</p>

<h2>Limitation of liability</h2>
<p>To the extent the law allows, we are not liable for indirect or consequential losses, or for lost data or profits, arising from your use of the service.</p>

<h2>Changes</h2>
<p>We may update these terms. We will change the effective date above and tell you in the app before a change that affects your rights takes effect.</p>`,
  );
}
