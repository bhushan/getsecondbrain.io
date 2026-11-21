import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  APP_ORIGIN: "https://app.test",
                  MCP_RESOURCE: "https://mcp.test",
                  SITE_ORIGIN: "https://www.test",
                  GOOGLE_CLIENT_ID: "google-client-id",
                  GOOGLE_CLIENT_SECRET: "google-client-secret",
                  ALLOWED_EMAILS: "founder@example.com, second@example.com",
                  TEST_MIGRATIONS: migrations,
                },
              },
            }),
          ],
          test: { name: "worker", include: ["test/worker/**/*.test.ts"], setupFiles: ["./test/worker/setup.ts"] },
        },
        {
          plugins: [cloudflareTest({ wrangler: { configPath: "./spike/wrangler.jsonc" } })],
          test: { name: "spike", include: ["test/spike/**/*.test.ts"] },
        },
      ],
    },
  };
});
