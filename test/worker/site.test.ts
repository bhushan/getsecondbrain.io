import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { appLogo } from "../../src/web/appLogos";
import { connectGuides } from "../../src/web/connectGuides";
import { plainText } from "../../src/worker/site/pages";

const SITE = "https://www.test";

describe("public site on the www host", () => {
  it("serves the landing page with a sign-in link to the app", async () => {
    const response = await exports.default.fetch(`${SITE}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Second Brain");
    expect(html).toContain('href="https://app.test/"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("shows one app saving a note and another app recalling it", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain("Save it in one app. Find it in another.");
    expect(html).toContain('class="relay"');
  });

  it("explains skills: written once by the user, used by every connected app", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('<section id="skills"');
    expect(html).toContain('href="/#skills"');
    expect(html).toContain("use_skill");
    expect(html).toMatch(/<summary>[^<]*skill[^<]*<\/summary>/i);
  });

  it("signs every page's footer: crafted with love and a beating heart (the founder's signature, never remove)", async () => {
    for (const path of ["/", "/privacy", "/terms"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html).toMatch(/<footer[^]*Crafted with love\s*<svg class="heart"[^>]*aria-hidden="true"[^]*<\/footer>/);
    }
    const css = await (await exports.default.fetch(`${SITE}/site.css`)).text();
    expect(css).toContain("@keyframes heartbeat");
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*\{[^]*\.heart[^]*animation: none/);
  });

  it("marks the product as in beta next to the name", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toMatch(/class="brand"[^]*?Second Brain<\/a><span class="beta-tag">Beta<\/span>/);
  });

  it("lists every app that has a setup guide in the app", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    const apps = connectGuides("https://mcp.test").filter((guide) => guide.id !== "other");
    expect(apps.length).toBeGreaterThan(5);
    for (const app of apps) expect(html).toMatch(new RegExp(`<li class="app-pill"><img src="/logos/${app.id}\\.svg"[^>]*>${app.name}</li>`));
  });

  it("says plainly that any AI app or agent can connect, on any device", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain("Connect any AI app or agent, on any device");
    expect(html).toMatch(/class="works-with"[^<]*any AI app or agent/);
    for (const app of connectGuides("https://mcp.test").filter((guide) => guide.id !== "other")) {
      expect(html).toContain(`<h3>${app.name}</h3><p>${app.where}</p>`);
    }
  });

  it("answers common questions without needing a script", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('id="faq"');
    expect(html.match(/<details/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps every page free of inline scripts, event handlers and outside assets", async () => {
    for (const path of ["/", "/privacy", "/terms", "/nope"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html).not.toMatch(/<script(?![^>]*\bsrc="\/site\.js")(?![^>]*type="application\/ld\+json")/i);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/(src|href)="https?:\/\/(?!app\.test|www\.test\/|developers\.google\.com|github\.com\/bhushan\/getsecondbrain\.io")/);
      expect(html).not.toContain("data:");
    }
  });

  it("holds the landing animation still for people who ask for reduced motion", async () => {
    const css = await (await exports.default.fetch(`${SITE}/site.css`)).text();
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("serves the privacy policy with the Google Limited Use statement", async () => {
    const response = await exports.default.fetch(`${SITE}/privacy`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Privacy policy");
    expect(html).toContain("Limited Use");
  });

  it("serves the terms of service", async () => {
    const response = await exports.default.fetch(`${SITE}/terms`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Terms of service");
  });

  it("answers 404 for an unknown page", async () => {
    expect((await exports.default.fetch(`${SITE}/nope`)).status).toBe(404);
  });

  it("allows only the site's own script file, never inline or outside scripts", async () => {
    const response = await exports.default.fetch(`${SITE}/`);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*(unsafe|https?:)/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("draws the hero as a glowing neural network of real notes joined by real links", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    const map = html.match(/<svg class="map"[\s\S]*?<\/svg>/)?.[0] ?? "";
    const cores = new Set([...map.matchAll(/<circle class="n [^"]*" data-i="(\d+)"/g)].map((m) => m[1]));
    const links = [...map.matchAll(/data-a="(\d+)" data-b="(\d+)"/g)];
    expect(cores.size).toBeGreaterThan(15);
    expect(links.length).toBeGreaterThan(20);
    for (const [, a, b] of links) {
      expect(cores.has(a!), `link ${a}-${b}`).toBe(true);
      expect(cores.has(b!), `link ${a}-${b}`).toBe(true);
    }
    // Every note has a soft halo, tinted by its cluster, and the signal halos are defined for the script.
    expect([...map.matchAll(/class="halo /g)].length).toBe(cores.size);
    for (const tint of ["violet", "fuchsia", "amber", "sky", "teal"]) expect(map).toContain(`id="halo-${tint}"`);
    // The CSP forbids inline styles, so the markup carries none.
    expect(map).not.toMatch(/\sstyle=/);
  });

  it("fills the hero with a full-grown brain of hundreds of neurons joined by links, the same on every load", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    const brain = html.match(/<g class="brain"[\s\S]*?<\/g>/)?.[0] ?? "";
    const neurons = [...brain.matchAll(/<circle class="bn b-(\w+)" cx="([\d.]+)" cy="([\d.]+)"/g)];
    expect(neurons.length).toBeGreaterThanOrEqual(300);
    for (const [, , x, y] of neurons) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThanOrEqual(1200);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeLessThanOrEqual(600);
    }
    const pairs = (brain.match(/data-edges="([\d,;]+)"/)?.[1] ?? "").split(";").map((pair) => pair.split(",").map(Number));
    expect(pairs.length).toBeGreaterThanOrEqual(neurons.length * 1.5);
    for (const [a, b] of pairs) expect(a! < neurons.length && b! < neurons.length && a !== b).toBe(true);
    // Several regions, each with its own tint, like lobes.
    expect(new Set(neurons.map(([, tint]) => tint)).size).toBeGreaterThanOrEqual(4);
    expect(await (await exports.default.fetch(`${SITE}/`)).text()).toBe(html);
    // Still a light page: the whole landing page stays under 160 KB before compression.
    expect(html.length).toBeLessThan(160_000);
  });

  it("keeps the hero map surface deep-space dark and the signals styled in site.css", async () => {
    const css = await (await exports.default.fetch(`${SITE}/site.css`)).text();
    expect(css).toContain("#05040d");
    expect(css).toContain("#fff6e0");
    const script = await (await exports.default.fetch(`${SITE}/site.js`)).text();
    expect(script).toContain("IntersectionObserver");
    expect(script).not.toMatch(/\.style\b|setAttribute\(["']style/);
  });

  it("serves the map script that brings the landing page to life", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('<script src="/site.js" defer></script>');
    const script = await exports.default.fetch(`${SITE}/site.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
  });

  it("caches the map script no longer than the page, so the two never drift apart", async () => {
    const script = await exports.default.fetch(`${SITE}/site.js`);
    expect(script.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("serves the shared design tokens, the font and the app logos from its own origin", async () => {
    for (const [path, type] of [["/tokens.css", "text/css"], ["/site.css", "text/css"], ["/fonts/inter-var.woff2", "font/woff2"], ["/logos/claude.svg", "image/svg+xml"]] as const) {
      const response = await exports.default.fetch(`${SITE}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toContain(type);
    }
  });

  it("does not serve other app files from the www host", async () => {
    expect((await exports.default.fetch(`${SITE}/index.html`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/logos/../index.html`)).status).toBe(404);
  });

  it("allows fonts and stylesheets only from its own origin", async () => {
    const csp = (await exports.default.fetch(`${SITE}/`)).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("font-src 'self'");
    expect(csp).toMatch(/style-src 'self'/);
  });

  it("never exposes the API or sign-in routes on the www host", async () => {
    expect((await exports.default.fetch(`${SITE}/api/me`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/auth/login`)).status).toBe(404);
    expect((await exports.default.fetch(`${SITE}/authorize`)).status).toBe(404);
  });

  it("styles every page from its own stylesheets only, with no inline styles", async () => {
    const csp = (await exports.default.fetch(`${SITE}/`)).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("style-src 'self';");
    expect(csp).not.toContain("unsafe-inline");
    for (const path of ["/", "/privacy", "/terms", "/nope"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html, path).not.toMatch(/<style/i);
      expect(html, path).not.toMatch(/\sstyle=/i);
      expect(html, path).toMatch(/<link rel="stylesheet" href="\/tokens\.css">\s*<link rel="stylesheet" href="\/site\.css">/);
    }
  });

  it("always shows the site in the dark theme", async () => {
    for (const path of ["/", "/privacy", "/terms", "/nope"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html, path).toContain('<html lang="en" data-theme="dark">');
      expect(html, path).toContain('<meta name="color-scheme" content="dark">');
    }
  });

  it("links every section from the navigation", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    for (const id of ["how", "integrations", "security", "faq"]) {
      expect(html).toContain(`href="/#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("offers a way to see how it works next to the main call to action", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toMatch(/href="https:\/\/app\.test\/"[^>]*>Open Second Brain<\/a>\s*<a[^>]*href="#how"[^>]*>See how it works<\/a>/);
  });

  it("shows each guided app's real logo next to its name", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    for (const app of connectGuides("https://mcp.test").filter((guide) => guide.id !== "other")) {
      const logo = appLogo(app.id);
      expect(logo, app.id).toBeDefined();
      expect(html).toMatch(new RegExp(`<img src="${logo!.src}"[^>]*class="[^"]*${logo!.mono ? "logo-mono" : ""}[^"]*"[^>]*><h3>${app.name}</h3>`));
    }
  });

  it("shows the connector address with the steps to connect", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('<code class="address">https://mcp.test/mcp</code>');
    expect(html.match(/<li class="step">/g)?.length).toBe(3);
  });

  it("explains what apps can and cannot do, including that notes never train models", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    for (const rule of ["Separate workspaces", "Read, or read and write", "Only you delete for good", "Every change kept", "Disconnect any time", "Never used to train AI models"]) {
      expect(html).toContain(`<h3>${rule}</h3>`);
    }
  });

  it("shares a social card image from the site's own origin", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain('<meta property="og:image" content="https://www.test/og/social.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    const image = await exports.default.fetch(`${SITE}/og/social.png`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/png");
  });

  it("shows a styled page with a way home for an unknown page", async () => {
    const response = await exports.default.fetch(`${SITE}/nope`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).toContain("<title>Page not found, Second Brain</title>");
    expect(html).toMatch(/<a class="button primary" href="\/">Go to the home page<\/a>/);
  });
});

describe("plainText", () => {
  it("leaves no markup behind, even from nested or broken tags", () => {
    expect(plainText('Write to <a href="mailto:x">us</a>.')).toBe("Write to us.");
    expect(plainText("<<a>script>alert(1)<</a>/script>")).not.toMatch(/[<>]/);
  });
});

describe("open source", () => {
  const REPO = "https://github.com/bhushan/getsecondbrain.io";

  it("links the source code from the navigation and the footer of every page", async () => {
    for (const path of ["/", "/privacy", "/terms"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html.match(new RegExp(`href="${REPO}"`, "g"))?.length, path).toBeGreaterThanOrEqual(2);
    }
  });

  it("says it is open source in the FAQ, the structured data and llms.txt", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    expect(html).toContain("Is Second Brain open source?");
    expect(html).toContain(`"sameAs":["${REPO}"]`);
    const llms = await (await exports.default.fetch(`${SITE}/llms.txt`)).text();
    expect(llms).toContain(REPO);
  });

  it("tells answer engines that apps allowed to write can update skills", async () => {
    const llms = await (await exports.default.fetch(`${SITE}/llms.txt`)).text();
    expect(llms).not.toContain("can never change them");
    expect(llms).toContain("every change keeps its earlier version");
  });
});

describe("search engines and answer engines", () => {
  const SITE_ORIGIN = "https://www.test";

  it("gives every page a canonical address on the site host", async () => {
    for (const path of ["/", "/privacy", "/terms"]) {
      const html = await (await exports.default.fetch(`${SITE}${path}`)).text();
      expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}${path}">`);
      expect(html).toContain(`<meta property="og:url" content="${SITE_ORIGIN}${path}">`);
      expect(html).not.toContain('name="robots" content="noindex"');
    }
  });

  it("keeps the not-found page out of search results", async () => {
    const html = await (await exports.default.fetch(`${SITE}/nope`)).text();
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it("describes the product and answers the FAQ as structured data", async () => {
    const html = await (await exports.default.fetch(`${SITE}/`)).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    const graph = blocks.flatMap((block) => block["@graph"] ?? [block]);
    const types = graph.map((item: { "@type": string }) => item["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]));
    const faq = graph.find((item: { "@type": string }) => item["@type"] === "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toContain("What are skills?");
    for (const q of faq.mainEntity) expect(q.acceptedAnswer.text).not.toMatch(/<[a-z]/i);
  });

  it("serves robots.txt that allows crawling and points at the sitemap", async () => {
    const response = await exports.default.fetch(`${SITE}/robots.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toMatch(/User-agent: \*\nAllow: \//);
    expect(text).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  it("lists the public pages in sitemap.xml", async () => {
    const response = await exports.default.fetch(`${SITE}/sitemap.xml`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const xml = await response.text();
    for (const path of ["/", "/privacy", "/terms"]) expect(xml).toContain(`<loc>${SITE_ORIGIN}${path}</loc>`);
  });

  it("serves llms.txt: a plain summary for AI answer engines", async () => {
    const response = await exports.default.fetch(`${SITE}/llms.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const text = await response.text();
    expect(text).toMatch(/^# Second Brain\n\n> /);
    expect(text).toContain("MCP");
    expect(text).toContain("## FAQ");
    expect(text).toContain(`${SITE_ORIGIN}/privacy`);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it("keeps the app and the MCP host out of search results", async () => {
    const appRobots = await exports.default.fetch("https://app.test/robots.txt");
    expect(appRobots.headers.get("content-type")).toContain("text/plain");
    expect(await appRobots.text()).toMatch(/User-agent: \*\nDisallow: \//);
    const mcpRobots = await exports.default.fetch("https://mcp.test/robots.txt", { headers: { host: "mcp.test" } });
    expect(await mcpRobots.text()).toMatch(/User-agent: \*\nDisallow: \//);
    const appPage = await exports.default.fetch("https://app.test/connect");
    expect(appPage.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
