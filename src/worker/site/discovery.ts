import { APP_NAMES, CONTACT, FAQ, listInWords, plainText, RULES, SITE_SUMMARY } from "./pages";

/** Public pages, for the sitemap. */
export const PUBLIC_PATHS = ["/", "/privacy", "/terms"];

export const siteRobots = (site: string) => `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`;

/** The app and MCP hosts hold only signed-in pages and an API, so search engines skip them. */
export const privateRobots = "User-agent: *\nDisallow: /\n";

export const sitemap = (site: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map(
    (path) => `  <url><loc>${site}${path}</loc></url>`,
  ).join("\n")}\n</urlset>\n`;

/** llms.txt (llmstxt.org): the site in plain Markdown, for AI answer engines. */
export const llmsTxt = (site: string, app: string) => `# Second Brain

> ${SITE_SUMMARY}

Second Brain is in private beta, by invitation. Write to ${CONTACT} to ask for a place.

## How it works

1. Connect one address: add the Second Brain MCP address to any AI app, sign in and pick a workspace.
2. Save from any app: ask a connected app to remember something. It lands as a linked note in your map.
3. Recall everywhere: any other connected app can search and read the same notes, on any device.

## Works with

Any app or agent that supports MCP connectors, in the browser, on desktop and phone, in the editor and in the terminal. There are step-by-step guides for ${listInWords(APP_NAMES)}.

## Skills

Skills are instructions you write once, such as how to write a post in your voice or how you review code. Every connected app sees your skills, follows the one that fits a task, or uses the one you name. You can write a skill, paste a SKILL.md or group skills into bundles. Apps can use skills but can never change them.

## Security

${RULES.map(([, title, text]) => `- ${title}: ${text}`).join("\n")}

## FAQ

${FAQ.map(([question, answer]) => `### ${question}\n\n${plainText(answer)}`).join("\n\n")}

## Links

- [Home](${site}/)
- [Privacy policy](${site}/privacy)
- [Terms of service](${site}/terms)
- [Open Second Brain](${app}/)
`;
