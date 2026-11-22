/**
 * The public site on the www host: landing page, privacy policy and terms. Server-rendered HTML
 * with no inline scripts. The page is complete without JavaScript; `/site.js` (served from our own
 * static files, the only script the CSP allows) makes the hero map respond to the pointer.
 */

import { connectGuides } from "../../web/connectGuides";

export const CONTACT = "hello@getsecondbrain.io";
const EFFECTIVE = "22 November 2026";

export const SITE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/*
 * "Exposure": a cyanotype develops in light. The hero map develops once on load and the last
 * note to appear is the one an AI app saved. Everything below it is quiet paper.
 */
const STYLE = `
:root{--ground:#17324d;--ground-deep:#10263b;--line:#2b4a6b;--ground-ink:#dbe8f6;--print:#e8f1fb;--edge:#8fb3d9;--sun:#ffc857;--sun-ink:#1c1606;
--paper:#f5f8fc;--raised:#fff;--ink:#14202e;--muted:#586878;--rule:#d3deea;--action:#1d5ba3;--bubble:#e6eef7;
--serif:"Iowan Old Style","Charter","Sitka Text",Georgia,serif;--sans:"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
--mono:ui-monospace,"SF Mono",Menlo,monospace;--gutter:clamp(16px,4vw,40px);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0e1a27;--raised:#142233;--ink:#e4ecf5;--muted:#93a4b8;--rule:#223549;--action:#8fb3d9;--bubble:#1b2c40;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--action);text-underline-offset:3px}
a:focus-visible{outline:2px solid var(--sun);outline-offset:3px;border-radius:4px}
.wrap{max-width:72rem;margin:0 auto;padding:0 var(--gutter)}
.blueprint{background:linear-gradient(var(--line) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/48px 48px,var(--ground);color:var(--ground-ink)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 0}
.brand-row{display:inline-flex;align-items:center;gap:10px}
.beta-tag{font-size:.72rem;font-weight:600;letter-spacing:.02em;padding:3px 8px;border-radius:999px;color:var(--sun);background:rgba(255,200,87,.12);box-shadow:inset 0 0 0 1px rgba(255,200,87,.35)}
.pill{display:flex;align-items:center;gap:16px;margin:16px auto 0;max-width:56rem;padding:8px 8px 8px 16px;border-radius:999px;background:rgba(16,38,59,.72);border:1px solid var(--line);
-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);position:relative;z-index:3}
.pill .brand{color:#fff}
.pill-links{list-style:none;margin:0 0 0 auto;padding:0;display:flex;gap:4px}
.pill-links a{display:block;padding:8px 12px;border-radius:999px;color:var(--ground-ink);text-decoration:none;font-size:.95rem;opacity:.85}
.pill-links a:hover{opacity:1;background:var(--ground)}
.button.light{min-height:40px;padding:8px 18px;border-radius:999px;background:var(--print);color:#14202e}
.button.light:hover{background:#fff}
.brand{display:inline-flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:600;font-size:1.02rem;letter-spacing:.005em}
.brand img{width:32px;height:32px;border-radius:8px;box-shadow:0 0 0 1px #3d5f84}
.button{display:inline-flex;align-items:center;min-height:44px;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:500;border:1px solid transparent;transition:transform .15s ease,background-color .15s ease}
.button.sun{background:var(--sun);color:var(--sun-ink);box-shadow:0 8px 24px -10px rgba(255,200,87,.7)}
.button.sun:hover{transform:translateY(-1px)}
.button.quiet{border-color:var(--line);color:var(--ground-ink);background:rgba(16,38,59,.6)}
.button.quiet:hover{background:var(--ground-deep)}

/* Hero: the map is the picture and the stage */
.hero,.print{margin:12px;border-radius:28px}
.hero{position:relative;overflow:hidden;min-height:min(calc(100svh - 24px),960px);display:flex;flex-direction:column}
.hero::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
background:linear-gradient(90deg,var(--ground) 0,rgba(23,50,77,.92) 32%,transparent 58%),radial-gradient(120% 90% at 72% 45%,transparent 40%,var(--ground) 92%)}
.hero>.wrap{position:relative;z-index:2;width:100%}
.hero-copy{position:relative;z-index:2;flex:1;display:flex;align-items:center;width:100%}
.hero-copy .wrap{padding-top:clamp(24px,6vh,72px);padding-bottom:clamp(48px,10vh,120px)}
.hero-copy .wrap{width:100%}
.hero-copy .wrap>*{max-width:min(34rem,44vw)}
.hero-copy .wrap>h1{max-width:min(44rem,50vw)}
.hero h1{font:400 clamp(2.6rem,4.8vw,4.6rem)/1.02 var(--serif);letter-spacing:-.018em;color:#fff;margin:0 0 24px;text-wrap:balance}
.hero p{font-size:clamp(1.05rem,1.5vw,1.2rem);max-width:31rem;margin:0 0 32px;color:var(--ground-ink)}
.works-with{font-size:.95rem!important;margin:24px 0 0!important;padding-left:14px;border-left:2px solid var(--sun);opacity:.85}
.map{position:absolute;z-index:0;right:-2vw;top:50%;width:min(58vw,940px);height:auto;transform:translateY(-46%);overflow:visible}
.map text{font:500 15px var(--sans);fill:var(--ground-ink)}
.map .sun-label{fill:var(--sun);font-weight:600}
.e{fill:none;stroke:var(--edge);stroke-opacity:.5;stroke-width:1.6;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:draw .7s ease-out forwards;animation-delay:var(--d)}
.e.sun-edge{stroke:var(--sun);stroke-opacity:1;stroke-width:3}
.n{fill:var(--print);opacity:0;transform-box:fill-box;transform-origin:center;animation:pop .55s cubic-bezier(.2,.9,.3,1.35) forwards;animation-delay:var(--d)}
.n.sun{fill:var(--sun)}
.ring{fill:none;stroke:var(--sun);stroke-width:2;opacity:0;transform-box:fill-box;transform-origin:center;animation:ring 1.6s ease-out forwards;animation-delay:var(--d)}
.lbl{opacity:0;animation:fade .6s ease-out forwards;animation-delay:var(--d)}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
@keyframes ring{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(3.4)}}
@keyframes fade{to{opacity:1}}

/* Relay: save in one app, find in another */
section{padding:clamp(72px,11vw,140px) 0}
h2{font:400 clamp(2rem,3.8vw,3rem)/1.08 var(--serif);letter-spacing:-.012em;margin:0 0 16px;text-wrap:balance}
.intro{max-width:36rem;color:var(--muted);margin:0 0 clamp(40px,6vw,64px)}
.relay{display:grid;grid-template-columns:1fr minmax(240px,.9fr) 1fr;align-items:center;gap:0;position:relative}
.chat{display:grid;gap:10px;padding:22px;border:1px solid var(--rule);border-radius:18px;background:var(--raised);position:relative;z-index:1}
.chat h3{font:600 .88rem/1.3 var(--sans);color:var(--muted);margin:0 0 4px}
.chat p{margin:0;padding:10px 14px;border-radius:14px;max-width:92%;font-size:.95rem;line-height:1.5}
.chat .you{justify-self:end;background:var(--action);color:#fff;border-bottom-right-radius:4px}
@media (prefers-color-scheme:dark){.chat .you{color:#0e1a27}}
.chat .app{justify-self:start;background:var(--bubble);border-bottom-left-radius:4px}
.link-line{height:2px;background:repeating-linear-gradient(90deg,var(--edge) 0 8px,transparent 8px 14px)}
.relay .note{position:relative;margin:0 -1px;padding:26px 24px 22px;background:var(--ground);color:var(--ground-ink);border-radius:6px;box-shadow:0 30px 60px -30px rgba(16,38,59,.55);z-index:2;
background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:24px 24px}
.note .path{display:flex;align-items:center;gap:8px;font-size:.82rem;opacity:.8;margin:0 0 8px}
.note .path::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--sun);box-shadow:0 0 0 4px rgba(255,200,87,.2)}
.note h3{font:400 1.6rem/1.15 var(--serif);color:#fff;margin:0 0 10px}
.note p{margin:0 0 8px;font:1rem/1.55 var(--serif)}
.note .wiki{color:var(--sun)}
.js .relay [data-step]{opacity:0}
.js .relay.in [data-step]{animation:rise .55s cubic-bezier(.2,.8,.3,1) forwards;animation-delay:calc(var(--s) * .55s)}
.js .relay.in .link-line{animation:fade .3s forwards,flow .6s linear 3;animation-delay:calc(var(--s) * .55s),calc(var(--s) * .55s)}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes flow{to{background-position:14px 14px}}
.relay-col{display:grid;grid-template-columns:1fr 32px;align-items:center}
.relay-col.right{grid-template-columns:32px 1fr}

/* Charge: what apps can and cannot do */
.charge{border-top:1px solid var(--rule)}
.charge .wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:clamp(32px,6vw,96px);align-items:start}
.charge .intro{margin:0}
.rules{margin:0;display:grid}
.rules div{display:grid;grid-template-columns:minmax(0,13rem) minmax(0,1fr);gap:8px 24px;padding:20px 0;border-bottom:1px solid var(--rule)}
.rules div:first-child{border-top:1px solid var(--rule)}
.rules dt{font-weight:600}
.rules dd{margin:0;color:var(--muted)}

/* Integrations: the apps scroll past, the address is the call to action */
.print{position:relative;overflow:hidden}
.print h2{color:#fff}
.print .intro{color:var(--ground-ink);opacity:.85}
.marquee{position:relative;z-index:2;display:flex;overflow:hidden;padding:0 0 clamp(20px,3vw,32px);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.marquee-track{list-style:none;margin:0;padding:0 6px;display:flex;justify-content:space-around;gap:12px;flex:none;min-width:100%;animation:slide 36s linear infinite}
.marquee:hover .marquee-track{animation-play-state:paused}
@keyframes slide{to{transform:translateX(-100%)}}
.app-pill{display:inline-flex;align-items:center;gap:10px;padding:12px 20px 12px 16px;border-radius:999px;background:var(--ground-deep);border:1px solid var(--line);color:#fff;font-weight:500;white-space:nowrap}
.app-pill::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--print);box-shadow:0 0 0 4px rgba(232,241,251,.12)}
.app-pill.any{color:var(--sun)}
.app-pill.any::before{background:var(--sun);box-shadow:0 0 0 4px rgba(255,200,87,.18)}
.app-grid{list-style:none;margin:0 0 clamp(48px,7vw,80px);padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.app-card{padding:20px 22px;background:var(--ground)}
.app-card h3{font:600 1.05rem/1.3 var(--sans);color:#fff;margin:0 0 4px;display:flex;align-items:center;gap:10px}
.app-card h3::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--print)}
.app-card p{margin:0;font-size:.92rem;opacity:.75}
.app-card.any h3{color:var(--sun)}
.app-card.any h3::before{background:var(--sun)}
.address-label{margin:0 0 10px;font-weight:600;color:#fff}
.address{display:block;width:fit-content;max-width:100%;margin:0 0 clamp(40px,6vw,64px);padding:14px 20px;border:1px solid var(--line);border-radius:12px;background:var(--ground-deep);
font:500 clamp(1.05rem,3.2vw,2rem)/1.3 var(--mono);color:var(--sun);overflow-wrap:anywhere;user-select:all}
.steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(24px,4vw,48px);counter-reset:step}
.steps li{counter-increment:step;border-top:1px solid var(--line);padding-top:18px}
.steps li::before{content:counter(step);display:block;font:400 2.2rem/1 var(--serif);color:var(--sun);margin-bottom:12px}
.steps code{font-family:var(--mono);font-size:.88em;color:#fff;overflow-wrap:anywhere}

/* Questions: native disclosure, no script */
.faq .wrap{max-width:48rem}
.faq h2{text-align:center;margin-bottom:clamp(32px,5vw,48px)}
.faq-list{display:grid;gap:10px}
details{border:1px solid var(--rule);border-radius:16px;background:var(--raised)}
summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px;font-weight:600;min-height:44px}
summary::-webkit-details-marker{display:none}
summary::after{content:"";flex:none;width:12px;height:12px;background:linear-gradient(currentColor,currentColor) center/12px 2px no-repeat,linear-gradient(currentColor,currentColor) center/2px 12px no-repeat;color:var(--muted);transition:transform .2s ease}
details[open] summary::after{transform:rotate(45deg)}
summary:focus-visible{outline:2px solid var(--sun);outline-offset:2px;border-radius:16px}
details p{margin:0;padding:0 22px 20px;color:var(--muted);max-width:40rem}

.closing{text-align:center}
.closing h2{font-size:clamp(2.2rem,5vw,3.8rem);max-width:14em;margin:0 auto 32px}

footer{padding:clamp(48px,7vw,80px) 0 calc(32px + env(safe-area-inset-bottom));color:var(--muted);font-size:.95rem}
footer .wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:40px}
footer .brand{color:var(--ink)}
footer .beta-tag{color:#7a5600;background:rgba(255,200,87,.22);box-shadow:inset 0 0 0 1px rgba(196,140,20,.4)}
@media (prefers-color-scheme:dark){footer .beta-tag{color:var(--sun)}}
.foot-brand p{margin:12px 0 0}
.foot-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.foot-cols h2{font:600 .95rem/1.3 var(--sans);color:var(--ink);margin:0 0 10px}
.foot-cols ul{list-style:none;margin:0;padding:0}
.foot-cols a{display:inline-block;padding:5px 0;color:var(--muted);text-decoration:none;overflow-wrap:anywhere}
.foot-cols a:hover{color:var(--ink)}
.copyright{grid-column:1/-1;margin:16px 0 0;padding-top:24px;border-top:1px solid var(--rule);font-size:.88rem}

/* Legal pages: paper, one readable column */
.doc-head{padding-bottom:clamp(40px,6vw,72px)}
.doc-head .brand{color:#fff}
.doc-head h1{font:400 clamp(2.4rem,5vw,3.6rem)/1.05 var(--serif);letter-spacing:-.015em;color:#fff;margin:clamp(16px,4vw,40px) 0 8px}
.doc-head .when{margin:0;opacity:.75}
.doc{max-width:42rem;margin:0 auto;padding:clamp(40px,6vw,72px) var(--gutter) 96px;font:18px/1.7 var(--serif)}
.doc h2{font:600 1.1rem/1.3 var(--sans);letter-spacing:0;margin:44px 0 10px}
.doc ul{padding-left:1.2em}
.doc li{margin-bottom:8px}

@media (max-width:860px){
.hero,.print{margin:8px;border-radius:20px}
.pill-links{display:none}
.pill{justify-content:space-between}
footer .wrap,.foot-cols{grid-template-columns:1fr}
.hero{min-height:auto}
.hero-copy{flex:none}
.hero-copy .wrap{padding-bottom:0}
.map{position:relative;right:auto;top:auto;transform:none;width:118%;margin:-8px -9% 8px;max-height:none}
.hero::after{background:linear-gradient(180deg,transparent 70%,var(--ground) 100%)}
.hero-copy .wrap>*,.hero-copy .wrap>h1{max-width:none}
.map text{font-size:22px}
.relay{grid-template-columns:1fr;justify-items:stretch}
.relay-col,.relay-col.right{grid-template-columns:1fr;grid-template-rows:auto 28px}
.relay-col.right{grid-template-rows:28px auto}
.link-line{width:2px;height:100%;justify-self:center;background:repeating-linear-gradient(180deg,var(--edge) 0 8px,transparent 8px 14px)}
.relay .note{margin:-1px 0}
.charge .wrap{grid-template-columns:1fr}
.rules div{grid-template-columns:1fr}
.steps{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){
.e,.n,.lbl,.ring,.js .relay [data-step]{animation:none!important;opacity:1}
.marquee{-webkit-mask-image:none;mask-image:none}
.marquee-track{animation:none;flex:1 1 auto;flex-wrap:wrap;justify-content:flex-start;padding:0 var(--gutter)}
.marquee-track[aria-hidden]{display:none}
summary::after{transition:none}
.e{stroke-dashoffset:0}.n,.lbl{opacity:1}
.button{transition:none}
}
`;

function shell(title: string, description: string, body: string, script = false): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><meta name="description" content="${description}">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#17324d">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:image" content="/logo-512.png">
<style>${STYLE}</style>${script ? `<script src="/site.js" defer></script>` : ""}</head><body>${body}</body></html>`;
}

const brand = () =>
  `<span class="brand-row"><a class="brand" href="/"><img src="/logo.svg" alt="" width="32" height="32">Second Brain</a><span class="beta-tag">Beta</span></span>`;

const nav = (appOrigin: string) => `<nav class="pill" aria-label="Site">${brand()}
<ul class="pill-links"><li><a href="/#how">How it works</a></li><li><a href="/#integrations">Integrations</a></li><li><a href="/#faq">FAQ</a></li></ul>
<a class="button light" href="${appOrigin}/">Sign in</a></nav>`;

const footer = () => `<footer><div class="wrap">
<div class="foot-brand">${brand()}<p>Your notes, linked, for every AI app.</p></div>
<div class="foot-cols">
<div><h2>Product</h2><ul><li><a href="/#how">How it works</a></li><li><a href="/#integrations">Integrations</a></li><li><a href="/#faq">FAQ</a></li></ul></div>
<div><h2>Legal</h2><ul><li><a href="/privacy">Privacy policy</a></li><li><a href="/terms">Terms of service</a></li></ul></div>
<div><h2>Contact</h2><ul><li><a href="mailto:${CONTACT}">${CONTACT}</a></li></ul></div>
</div>
<p class="copyright">© 2026 Second Brain. Private beta.</p>
</div></footer>`;

/** The apps with a setup guide in the app, so the site and the guides never disagree. */
const GUIDED_APPS = connectGuides("https://example.invalid/mcp").filter((guide) => guide.id !== "other");
const APP_NAMES = GUIDED_APPS.map((guide) => guide.name);

const appGrid = () =>
  `<ul class="app-grid">${GUIDED_APPS.map((app) => `<li class="app-card"><h3>${app.name}</h3><p>${app.where}</p></li>`).join("")}<li class="app-card any"><h3>Any MCP app</h3><p>Any app or agent that supports remote MCP connectors</p></li></ul>`;

const appList = (hidden: boolean) =>
  `<ul class="marquee-track"${hidden ? ' aria-hidden="true"' : ""}>${APP_NAMES.map((name) => `<li class="app-pill">${name}</li>`).join("")}<li class="app-pill any">Any MCP app</li></ul>`;

const listInWords = (names: string[]) => `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

const FAQ: [string, string][] = [
  ["Which apps can connect?", `Any app that supports MCP connectors. There are step-by-step guides for ${listInWords(APP_NAMES)}.`],
  ["Can a connected app delete my notes?", "No. Apps can search, read and, if you allow it, save notes. Only you can move a note to the trash, and you can restore it from there."],
  ["Can I bring my Obsidian vault?", "Yes. Pick the vault folder and every note comes in with its links, tags and folders. Importing again skips notes that have not changed."],
  ["Who can read my notes?", "You, and the apps you connect to that workspace. Notes are encrypted at rest and in transit, but not end to end, because Second Brain has to read them to search and to answer your apps. Your notes are never used to train AI models."],
  ["How do I get access?", `Second Brain is in private beta and access is by invitation. Write to <a href="mailto:${CONTACT}">${CONTACT}</a> to ask for a place.`],
];

/*
 * The hero map. Fixed coordinates; each note and link gets an animation delay from its distance to
 * the centre note, so the map develops outward. The sun note, saved by an AI app, links in last.
 */
type MapNode = { x: number; y: number; r: number; label?: string };
const NODES: MapNode[] = [
  { x: 380, y: 330, r: 22, label: "Project notes" },
  { x: 230, y: 440, r: 16, label: "Reading list" },
  { x: 575, y: 235, r: 15, label: "Saved by Claude" },
  { x: 520, y: 455, r: 13 },
  { x: 290, y: 205, r: 10 },
  { x: 170, y: 270, r: 6 },
  { x: 660, y: 530, r: 8 },
  { x: 445, y: 570, r: 7 },
  { x: 320, y: 575, r: 6 },
  { x: 110, y: 470, r: 7 },
  { x: 705, y: 345, r: 9 },
  { x: 610, y: 115, r: 6 },
  { x: 460, y: 150, r: 8 },
  { x: 770, y: 455, r: 5 },
  { x: 70, y: 360, r: 5 },
  { x: 230, y: 640, r: 5 },
  { x: 575, y: 650, r: 6 },
  { x: 745, y: 210, r: 5 },
  { x: 150, y: 130, r: 6 },
  { x: 405, y: 455, r: 6 },
];
const SUN = 2;
const nodeAt = (index: number): MapNode => {
  const node = NODES[index];
  if (!node) throw new Error(`No map node ${index}`);
  return node;
};
const EDGES: [number, number][] = [
  [0, 1], [0, 3], [0, 4], [0, 19], [4, 5], [4, 18], [4, 12], [12, 11], [1, 9], [9, 14], [1, 15], [1, 8],
  [3, 6], [3, 7], [7, 8], [6, 13], [6, 16], [3, 10], [10, 17], [5, 14], [19, 3], [7, 16],
];
const SUN_EDGES: [number, number][] = [[2, 0], [2, 12], [2, 10]];

function heroMap(): string {
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
  const delay = (node: number) => 0.3 + (depth.get(node) ?? 0) * 0.42;
  const sunDelay = Math.max(...[...depth.values()].map((d) => 0.3 + d * 0.42)) + 0.9;
  const line = ([a, b]: [number, number], cls: string, d: number) =>
    `<path class="${cls}" pathLength="1" data-a="${a}" data-b="${b}" style="--d:${d.toFixed(2)}s" d="M${nodeAt(a).x} ${nodeAt(a).y}L${nodeAt(b).x} ${nodeAt(b).y}"/>`;
  const edges = EDGES.map((edge) => line(edge, "e", Math.min(delay(edge[0]), delay(edge[1])) + 0.12)).join("");
  const sunEdges = SUN_EDGES.map((edge, i) => line(edge, i === 0 ? "e sun-edge" : "e", sunDelay + i * 0.15)).join("");
  const dots = NODES.map((n, i) =>
    i === SUN ? "" : `<circle class="n" data-i="${i}" style="--d:${delay(i).toFixed(2)}s" cx="${n.x}" cy="${n.y}" r="${n.r}"/>`,
  ).join("");
  const sun = nodeAt(SUN);
  const labels = NODES.map((n, i) =>
    n.label
      ? `<text class="lbl${i === SUN ? " sun-label" : ""}" data-for="${i}" style="--d:${(i === SUN ? sunDelay + 0.5 : delay(i) + 0.3).toFixed(2)}s" x="${n.x + n.r + 10}" y="${n.y + 5}">${n.label}</text>`
      : "",
  ).join("");
  return `<svg class="map" viewBox="0 60 840 640" role="img" aria-label="A map of notes joined by links. A new note saved by an AI app links into it last.">
${edges}${sunEdges}${dots}
<circle class="ring" data-ring="${SUN}" style="--d:${(sunDelay + 0.35).toFixed(2)}s" cx="${sun.x}" cy="${sun.y}" r="${sun.r}"/>
<circle class="n sun" data-i="${SUN}" style="--d:${(sunDelay + 0.3).toFixed(2)}s" cx="${sun.x}" cy="${sun.y}" r="${sun.r}"/>
${labels}</svg>`;
}

const HERO_MAP = heroMap();

export function landingPage(appOrigin: string, mcpResource: string): string {
  return shell(
    "Second Brain: your notes, linked, for every AI app",
    "Keep your markdown notes as one linked map, and let Claude, ChatGPT and other AI apps read and write them through MCP.",
    `<header class="hero blueprint">
<div class="wrap">${nav(appOrigin)}</div>
<div class="hero-copy"><div class="wrap">
<h1>Your notes, linked. Remembered by every AI app you use.</h1>
<p>Second Brain keeps your markdown notes as one linked map. Claude, ChatGPT, Cursor and other AI apps can search it, read it and add to it, but only in the workspace you choose.</p>
<a class="button sun" href="${appOrigin}/">Open Second Brain</a>
<p class="works-with">Connects to any AI app or agent that supports MCP: in the browser, on desktop and phone, in your editor and in the terminal.</p>
</div></div>
${HERO_MAP}
<div class="marquee" aria-label="Apps with a setup guide">${appList(false)}${appList(true)}</div>
</header>
<main>
<section id="how"><div class="wrap">
<h2>Save it in one app. Find it in another.</h2>
<p class="intro">Connect an app once and it can recall your notes and save new ones. What Claude saves, ChatGPT can find. Your memory stops being locked inside one assistant.</p>
<div class="relay">
<div class="relay-col"><div class="chat" aria-label="A conversation in Claude">
<h3>In Claude, on Monday</h3>
<p class="you" data-step style="--s:0">Save my Lisbon notes: we're staying in Alfama, and the 28 tram queue is shortest after 10.</p>
<p class="app" data-step style="--s:1">Saved to Trips/Lisbon and linked it to Travel ideas.</p>
</div><span class="link-line" data-step style="--s:2" aria-hidden="true"></span></div>
<article class="note" data-step style="--s:3" aria-label="The saved note">
<p class="path">Trips / Lisbon</p>
<h3>Lisbon</h3>
<p>Staying in Alfama. Take the 28 tram after 10, when the queue is short.</p>
<p>See <span class="wiki">[[Travel ideas]]</span></p>
</article>
<div class="relay-col right"><span class="link-line" data-step style="--s:4" aria-hidden="true"></span><div class="chat" aria-label="A conversation in ChatGPT">
<h3>In ChatGPT, a week later</h3>
<p class="you" data-step style="--s:5">Where are we staying in Lisbon?</p>
<p class="app" data-step style="--s:6">In Alfama, from your note Trips/Lisbon. You also noted the 28 tram queue is shortest after 10.</p>
</div></div>
</div>
</div></section>

<section id="integrations" class="print blueprint">
<div class="wrap">
<h2>Connect any AI app or agent, on any device</h2>
<p class="intro">Chat apps, code editors and terminal agents all connect the same way: add one address, sign in, choose a workspace. Every app you connect shares the same memory, and each has a step-by-step guide in Second Brain.</p>
${appGrid()}
<p class="address-label">Your connector address</p>
<span class="address">${mcpResource}</span>
<ol class="steps">
<li>Add <code>${mcpResource}</code> as a custom connector in your app.</li>
<li>Sign in to Second Brain when the app asks, choose a workspace, and choose read only or read and write.</li>
<li>Ask the app to save something, then ask any connected app to find it.</li>
</ol>
</div>
</section>

<section class="charge"><div class="wrap">
<div><h2>You stay in charge</h2>
<p class="intro">Every note and every link between notes, drawn as a map you can search and edit. Apps get exactly the access you give them, and nothing more.</p></div>
<dl class="rules">
<div><dt>Separate workspaces</dt><dd>Each workspace is kept apart. An app only sees the one you chose when you connected it.</dd></div>
<div><dt>Read, or read and write</dt><dd>You decide whether an app can only search and read, or can also save new notes.</dd></div>
<div><dt>No deleting</dt><dd>Apps can never delete a note. Only you can, and the trash lets you take it back.</dd></div>
<div><dt>Every change kept</dt><dd>Each edit is saved as a revision, and the activity log shows which app did what.</dd></div>
<div><dt>Bring your vault</dt><dd>Import an Obsidian vault in one step. Links, tags and folders come with it.</dd></div>
</dl>
</div></section>

<section id="faq" class="faq"><div class="wrap">
<h2>Questions</h2>
<div class="faq-list">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
</div></section>

<section class="print blueprint closing"><div class="wrap">
<h2>Give every AI app the same memory.</h2>
<a class="button sun" href="${appOrigin}/">Open Second Brain</a>
</div></section>
</main>${footer()}`,
    true,
  );
}

const docPage = (title: string, description: string, content: string) =>
  shell(
    `${title}, Second Brain`,
    description,
    `<header class="blueprint doc-head print"><div class="wrap"><div class="bar">${brand()}</div><h1>${title}</h1><p class="when">Effective ${EFFECTIVE}</p></div></header>
<main class="doc">${content}</main>${footer()}`,
  );

export function privacyPage(): string {
  return docPage(
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
<p>Your notes stay until you delete them. Notes you move to the trash can be restored. If you ask us to delete your account, we delete your notes, workspaces and account details; copies in our provider's recovery backups expire within 30 days.</p>

<h2>Your choices</h2>
<p>You can edit or remove your notes, disconnect apps, and ask us for a copy of your data or to delete your account by writing to <a href="mailto:${CONTACT}">${CONTACT}</a>. Depending on where you live, you may have further rights under laws such as the GDPR; we will honour them.</p>

<h2>Children</h2>
<p>Second Brain is not meant for children under 16, and we do not knowingly collect their data.</p>

<h2>Changes</h2>
<p>If we change this policy, we will update this page and its effective date, and tell you in the app before any change that reduces your rights.</p>`,
  );
}

export function termsPage(appOrigin: string): string {
  return docPage(
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
