import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true, sourcemap: false },
  server: {
    // `pnpm dev:web` proxies API and auth calls to `wrangler dev` on port 8787.
    proxy: { "/api": "http://localhost:8787", "/auth": "http://localhost:8787", "/authorize": "http://localhost:8787" },
  },
});
