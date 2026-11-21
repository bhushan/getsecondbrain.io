/** Hostnames and origins, from `vars` in wrangler.jsonc. */
export interface Hosts {
  /** Web app, JSON API and authorization server, for example https://app.getsecondbrain.io */
  appOrigin: string;
  /** MCP endpoint and token audience, for example https://mcp.getsecondbrain.io */
  mcpResource: string;
  appHost: string;
  mcpHost: string;
  /** Public site: landing page, privacy and terms, for example www.getsecondbrain.io */
  siteHost: string;
}

export function hosts(env: Pick<Env, "APP_ORIGIN" | "MCP_RESOURCE" | "SITE_ORIGIN">): Hosts {
  const app = new URL(env.APP_ORIGIN);
  const mcp = new URL(env.MCP_RESOURCE);
  const site = new URL(env.SITE_ORIGIN);
  return { appOrigin: app.origin, mcpResource: env.MCP_RESOURCE, appHost: app.host, mcpHost: mcp.host, siteHost: site.host };
}
