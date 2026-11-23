import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Matches a module inside one of the named packages, whatever the pnpm store path around it. */
const packages = (...names: string[]) => new RegExp(`[\\\\/]node_modules[\\\\/](?:${names.join("|")})[\\\\/]`);
/** Lezer grammars that only the markdown language (and the languages it embeds) use. */
const EDITOR_LANGUAGES = "markdown|html|css|javascript";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Vendor code sits in a few stable chunks, so a deploy that only changes app code keeps them
        // cached. The graph and editor chunks are reached only through dynamic imports (App.tsx), so
        // the sign-in screen and the app shell download neither.
        codeSplitting: {
          groups: [
            { name: "react", test: packages("react", "react-dom", "scheduler") },
            { name: "graph", test: packages("sigma", "graphology[^\\\\/]*", "events", "obliterator", "pandemonium", "mnemonist") },
            // CodeMirror in two chunks to stay under the size warning: the core first (a group also
            // takes the modules its members import, so the core must claim them before the languages).
            {
              name: "editor",
              test: packages(
                "codemirror",
                `@codemirror[\\\\/](?!lang-)[^\\\\/]+`,
                `@lezer[\\\\/](?!${EDITOR_LANGUAGES})[^\\\\/]+`,
                "@marijn[\\\\/][^\\\\/]+",
                "style-mod",
                "w3c-keyname",
                "crelt",
              ),
            },
            { name: "editor-languages", test: packages("@codemirror[\\\\/]lang-[^\\\\/]+", `@lezer[\\\\/](?:${EDITOR_LANGUAGES})`) },
          ],
        },
      },
    },
  },
  server: {
    // `pnpm dev:web` proxies API and auth calls to `wrangler dev` on port 8787.
    proxy: { "/api": "http://localhost:8787", "/auth": "http://localhost:8787", "/authorize": "http://localhost:8787" },
  },
});
