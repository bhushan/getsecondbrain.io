/**
 * The public site on the www host: landing page, privacy policy and terms. Server-rendered HTML
 * with no scripts, so the site's CSP can forbid them entirely.
 */

export const CONTACT = "hello@getsecondbrain.io";
const EFFECTIVE = "22 November 2026";

export const SITE_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const STYLE = `
:root{--ground:#17324d;--ground-deep:#10263b;--line:#2b4a6b;--ground-ink:#dbe8f6;--sun:#ffc857;
--paper:#f5f8fc;--ink:#14202e;--muted:#586878;--rule:#d3deea;--action:#1d5ba3;
--serif:"Iowan Old Style","Charter","Sitka Text",Georgia,serif;--sans:"Avenir Next","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#0e1a27;--ink:#e4ecf5;--muted:#93a4b8;--rule:#223549;--action:#8fb3d9}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--action)}
a:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
.wrap{max-width:68rem;margin:0 auto;padding:0 24px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 0}
.brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:600;font-size:1.05rem}
.brand img{width:32px;height:32px;border-radius:8px;box-shadow:0 0 0 1px #3d5f84}
.button{display:inline-block;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500;border:1px solid transparent}
.button.sun{background:var(--sun);color:#1c1606}
.button.quiet{border-color:var(--line);color:var(--ground-ink)}
.hero{background:linear-gradient(var(--line) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/48px 48px,var(--ground);color:var(--ground-ink)}
.hero .bar .brand{color:#fff}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;padding:48px 0 72px}
.hero h1{font:400 clamp(2.4rem,5.4vw,4rem)/1.05 var(--serif);margin:0 0 20px;color:#fff;letter-spacing:-.01em}
.hero p{font-size:1.15rem;max-width:34rem;margin:0 0 28px;color:var(--ground-ink)}
.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.hero .beta{font-size:.9rem;opacity:.8;margin:18px 0 0}
.map{width:100%;height:auto;display:block}
.address{display:inline-block;margin-top:6px;padding:4px 10px;border-radius:6px;background:var(--ground-deep);font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.95rem;color:#fff}
section.points{padding:72px 0 24px}
.points-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
.points h2{font:400 1.6rem/1.2 var(--serif);margin:0 0 10px}
.points p{margin:0;color:var(--muted)}
section.connect{padding:40px 0 80px}
.connect-box{border-top:1px solid var(--rule);padding-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
.connect h2{font:400 2rem/1.15 var(--serif);margin:0 0 12px}
.connect ol{margin:0;padding-left:1.2em;color:var(--muted)}
.connect li{margin-bottom:10px}
.connect code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.9em;color:var(--ink)}
footer{border-top:1px solid var(--rule);padding:28px 0 40px;color:var(--muted);font-size:.9rem}
footer .wrap{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between}
footer nav{display:flex;gap:20px}
.doc{max-width:44rem;padding:32px 24px 72px;margin:0 auto}
.doc .bar{padding:0 0 32px}
.doc h1{font:400 2.6rem/1.1 var(--serif);margin:0 0 8px}
.doc .when{color:var(--muted);margin:0 0 32px}
.doc h2{font:600 1.1rem/1.3 var(--sans);margin:36px 0 8px}
.doc p,.doc li{color:var(--ink)}
.doc ul{padding-left:1.2em}
.doc li{margin-bottom:6px}
@media (max-width:820px){.hero-grid,.points-grid,.connect-box{grid-template-columns:1fr}.hero-grid{padding:24px 0 56px}.map{max-width:420px}}
`;

function shell(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${description}">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#17324d">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:image" content="/logo-512.png">
<style>${STYLE}</style></head><body>${body}</body></html>`;
}

const brand = () =>
  `<a class="brand" href="/"><img src="/logo.svg" alt="" width="32" height="32">Second Brain</a>`;

const footer = () => `<footer><div class="wrap"><span>Second Brain, private beta</span>
<nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:${CONTACT}">${CONTACT}</a></nav></div></footer>`;

/** A small blueprint of linked notes: the hero picture. Fixed coordinates, no script. */
const MAP = `<svg class="map" viewBox="0 0 480 400" role="img" aria-label="Notes drawn as dots on a blueprint, joined by the links between them">
<g stroke="#8fb3d9" stroke-opacity=".55" stroke-width="2" stroke-linecap="round">
<path d="M120 250 240 170M240 170 360 110M240 170 330 270M120 250 200 320M330 270 420 300M360 110 430 170M240 170 170 90M170 90 90 120M330 270 250 330M360 110 300 50"/>
</g>
<g stroke="#ffc857" stroke-width="3" stroke-linecap="round"><path d="M240 170 360 110"/></g>
<g fill="#e8f1fb">
<circle cx="120" cy="250" r="16"/><circle cx="330" cy="270" r="13"/><circle cx="200" cy="320" r="8"/><circle cx="420" cy="300" r="7"/>
<circle cx="430" cy="170" r="8"/><circle cx="170" cy="90" r="10"/><circle cx="90" cy="120" r="6"/><circle cx="250" cy="330" r="6"/><circle cx="300" cy="50" r="6"/>
</g>
<circle cx="240" cy="170" r="22" fill="#e8f1fb"/>
<circle cx="360" cy="110" r="15" fill="#ffc857"/>
<g fill="#dbe8f6" font-family="Avenir Next,Segoe UI,system-ui,sans-serif" font-size="14">
<text x="268" y="176">Project notes</text><text x="345" y="80" text-anchor="middle">Saved by Claude</text><text x="40" y="282">Reading list</text>
</g></svg>`;

export function landingPage(appOrigin: string, mcpResource: string): string {
  const mcpHost = new URL(mcpResource).host;
  return shell(
    "Second Brain: your notes, linked, for every AI app",
    "Keep your markdown notes as one linked map, and let Claude, ChatGPT and other AI apps read and write them through MCP.",
    `<header class="hero"><div class="wrap">
<div class="bar">${brand()}<a class="button quiet" href="${appOrigin}/">Sign in</a></div>
<div class="hero-grid"><div>
<h1>Your notes, linked. Remembered by every AI app you use.</h1>
<p>Second Brain keeps your markdown notes as one linked map. Claude, ChatGPT, Cursor and other AI apps can search it, read it and add to it, but only in the workspace you choose.</p>
<div class="actions"><a class="button sun" href="${appOrigin}/">Open Second Brain</a></div>
<p class="beta">Private beta. Sign in with Google; access is by invitation for now.</p>
</div>${MAP}</div></div></header>
<main>
<section class="points"><div class="wrap points-grid">
<div><h2>One map of what you know</h2><p>Every note and every link between notes, drawn as a map you can search and edit. Bring an Obsidian vault in one step; links, tags and folders come with it.</p></div>
<div><h2>Every AI app, one memory</h2><p>Connect an app once and it can recall your notes and save new ones. What Claude saves, Cursor can find. Your memory stops being locked inside one assistant.</p></div>
<div><h2>You stay in charge</h2><p>Each workspace is kept separate. You choose what an app can see and whether it can write. Apps can never delete a note, every change is kept as a revision, and you can disconnect an app at any time.</p></div>
</div></section>
<section class="connect"><div class="wrap connect-box">
<div><h2>Connect an app in a minute</h2><p>Add one address to any app that supports MCP connectors:</p><span class="address">${mcpHost}</span></div>
<ol>
<li>Add <code>https://${mcpHost}</code> as a custom connector in Claude, ChatGPT, Cursor or another MCP app.</li>
<li>Sign in to Second Brain when the app asks, choose a workspace, and choose read only or read and write.</li>
<li>Ask the app to save something, then ask any connected app to find it.</li>
</ol>
</div></section>
</main>${footer()}`,
  );
}

const docPage = (title: string, description: string, content: string) =>
  shell(
    `${title}, Second Brain`,
    description,
    `<main class="doc"><div class="bar">${brand()}</div><h1>${title}</h1><p class="when">Effective ${EFFECTIVE}</p>${content}</main>${footer()}`,
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
