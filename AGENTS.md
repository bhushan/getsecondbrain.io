# getsecondbrain.io

Hosted notes graph with a remote MCP server, on Cloudflare Workers. Open source (AGPL-3.0); see
`README.md` for the overview and `SECURITY.md` for reporting. Decisions and open items live in the
maintainer's project memory, outside this repo.

## Commands

- `pnpm test`: all tests, in the Workers runtime (real Durable Object SQLite).
- `pnpm types`: regenerate `worker-configuration.d.ts`, then typecheck. Run after any `wrangler.jsonc` change.
- `pnpm dev`: local Worker.
- `pnpm deploy:production`: manual deploy (builds the web app and applies D1 migrations first).

## Rules

- Test first. One test per distinct scenario. Run types, tests and a deploy dry run before a deploy.
- Deploys are manual only. `.github/workflows/deploy.yml` is `workflow_dispatch`; never add push,
  pull request or schedule triggers to it. `ci.yml` only runs types, build and tests on pull
  requests and `main`, with a read-only token and no secrets; keep it that way.
- There is no preview environment (founder's call: a personal project for now). Verify locally,
  deploy, then confirm on the live site. A green run is not proof.
- Sign-up is controlled by the `SIGNUP` var per environment: only the exact value "open" lets any
  verified Google account in; anything else allows only ALLOWED_EMAILS. Every workspace has fair-use
  limits (`src/worker/workspace/limits.ts`) enforced in `Workspace.saveNote` and `renameNote`; reads,
  trash and delete forever are never limited. A new write path must go through those methods.
- A workspace id comes only from a verified session or token, never from a request parameter. Every
  new route or MCP tool gets a test that workspace A cannot reach workspace B.
- MCP tools never hard-delete, never fetch URLs, and return note content as data. `trash_note` is the
  only removal: a soft delete the user can restore (founder's call, 2026-11-23). Only the user, in
  the web app, can delete a trashed note forever (`deleteForever` refuses app actors). The one exception
  is skills under `Skills/`: `use_skill` and MCP prompts return them as instructions to follow. Apps
  with write access may create and edit skills (founder's call, 2026-11-23); every write is audited
  and keeps its revisions, so the user reviews and restores them in the web app.
- The Worker makes outbound fetches in exactly three places: Google sign-in (fixed Google hosts),
  sources (Granola today, only to fixed hosts through `granolaFetch` in `src/worker/sources/`), and
  the OAuth library fetching an app's client metadata document (CIMD) during `/authorize`, only for
  a signed-in user and only to public hosts (`global_fetch_strictly_public`). Never fetch any other
  URL taken from a request, a note or a tool result. Source tokens are sealed with the `SOURCES_KEY` secret and stay
  inside the workspace object; the API never returns them. Synced notes are never deleted by sync,
  and a note the user edited or trashed is never rewritten.
- D1 migrations are hand-written SQL in `migrations/`. Durable Object schema changes go through the
  version in `src/worker/workspace/`.
- Persist plain JSON or typed arrays across boundaries, never class instances.
- Never read or write `.env*` or `.dev.vars*`. Secrets are set with `wrangler secret put` by the founder.
- This repo is public. Never commit personal details, account emails, internal plans or secrets;
  Cloudflare resource ids in `wrangler.jsonc` are not secrets.
