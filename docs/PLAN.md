# getsecondbrain.io: research findings and build plan

Role: tech lead, with a product strategist's lens on scope.

## Context

A new product on the freshly bought domain getsecondbrain.io: a hosted hub of linked markdown notes
with a visual graph, where AI apps connect through a remote MCP server to save and recall notes.
The repo (`~/code/getsecondbrain.io`) is empty. Decisions already made by the founder:

- Each user has isolated workspaces. Data is only ever fetched inside one workspace. MCP connects by
  OAuth and the user picks the workspace during consent. The server can read notes (no end-to-end
  encryption), so search and MCP recall work.
- Multi-user architecture from day one, launched as a private beta with the founder as the only
  user, importing the real Obsidian vault (measured today: 274 notes, 1.5 MB, 965 wikilinks).
- MCP-first hub with a light markdown editor, one-time Obsidian import, markdown export. Not a full
  Obsidian replacement.
- Cloudflare free plan first, Workers Paid ($5/month) when a named limit is hit.

## What the research says (checked 2026-11-21)

### Market

- Graph plus MCP at a personal price already exists, so that alone is not the opening. Recall has
  a graph and MCP on its free plan ($10/month Plus), but it is a read-later app and whether its MCP
  can write is unverified. Capacities has a graph on all plans and MCP on Pro (about $10 to $12,
  beta). MIND has both from $29/month. Hjarni is the closest in intent (hosted notes your AIs read
  and write, $12/month, no confirmed graph view). Basic Memory Cloud is a markdown graph over MCP
  at $19/month with no graph view found. Supermemory, Mem0 and Zep are developer memory APIs with
  no graph for the end user.
- What none of them lead with: a store built MCP-first, where AI apps are the main writers, every
  write is attributed and reversible, and the user sees and edits the result as a graph.
- Other note apps treat MCP as an extra: Tana and Heptabase put it behind the paid plan; Obsidian
  has no official MCP; Roam, Logseq and Anytype are local only. Notion has hosted MCP but no graph.
- The real substitute is memory built into Claude, ChatGPT and Gemini. None of them sync memory
  across assistants, show it as linked notes, or let the user own it outside the platform.
- Evidence-backed openings: (1) assistant-neutral, write-capable memory you can see and edit as a
  graph, with MCP on the free plan; (2) a web graph that stays fast where Obsidian's stalls (users report about 25k notes);
  (3) people leaving Mem (closing 2027-01-15) and Obsidian users who want hosted MCP. Speculative:
  (4) per-app permissions plus a log of what each AI saved.
- Pricing norm: $8 to $15/month for personal notes tools. Hjarni and Recall include MCP on the free
  plan; most others charge for it. Pricing is not decided in this plan.
- Naming risk, needs a check before any public launch (not before the private beta): a registered
  SECONDBRAIN mark for software development services, a pending SECOND BRAIN application reported
  to cover AI and software goods (owner not verified), Forte Labs' BUILDING A SECOND BRAIN mark for
  education, and getsecondbrain.com parked by an unknown owner. Do a USPTO TSDR search and get a
  lawyer's view first.

### Cloudflare free plan, sized against one heavy user

| Limit | Value | Reading for this product |
| --- | --- | --- |
| Worker requests | 100,000/day; static assets free and unlimited | Only API and MCP calls count |
| Worker CPU | 10 ms per request | Worker only routes and checks tokens; no password hashing (sign-in is delegated) |
| Durable Objects | SQLite only; 100k requests, 5M rows read, 100k rows written per day; 5 GB per account | About 4,000 note saves a day if a save costs 25 rows (my estimate; measured in milestone 0). The current vault import would be about 7k rows |
| Storage per object | Docs conflict: 1 GB or 10 GB | Assume 1 GB per workspace. The current vault needs a few MB |
| Vectorize storage | 5M stored dimensions; 1,000 namespaces per index | Tightest limit: about 4,880 chunks at 1,024 dimensions. The current vault is roughly 1,000 to 1,500 chunks (estimate) |
| Vectorize queries | 30M queried dimensions/month, counted as (queries + stored vectors) x dimensions | Under 1,000 semantic searches a day at 1,024 dimensions. As-you-type search stays keyword-only; semantic runs on Enter and on MCP `search` |
| Workers AI | 10,000 neurons/day; embeddings $0.0017 to $0.012 per million tokens | The whole vault (about 0.4M tokens) embeds within one day's free allowance |
| KV | 1,000 writes/day | OAuth tokens live here; fine for a beta |
| D1 | 10 databases, 500 MB each | Enough for the small control database |

Triggers to move to Workers Paid ($5/month): more than about 4,800 embedded chunks across all
workspaces, more than about 900 semantic searches a day, a bulk import above about 4,000 notes in
one day, more than 1,000 workspaces (namespace cap), or KV writes near 1,000/day. On paid, 100k notes with 3 chunks each costs cents per month.

Other facts that shape the design:

- MCP spec 2026-07-28 is stateless. Cloudflare's `McpAgent` is deprecated; the current path is
  `createMcpHandler` with MCP SDK v2 over Streamable HTTP.
- MCP auth is OAuth 2.1 with PKCE and protected resource metadata. Client ID Metadata Documents are
  preferred (Claude, ChatGPT); Dynamic Client Registration is deprecated but Cursor and Gemini CLI
  still use it. `@cloudflare/workers-oauth-provider` v1 supports both, plus Google or GitHub as the
  upstream sign-in.
- Durable Object SQLite includes FTS5 and 30-day point-in-time recovery.
- Cloudflare Agent Memory (private beta, no pricing) and AI Search (billing starts 2026-12-01, hides
  the structure a graph needs) are not used.

Unverified, settled by spikes in milestone 0: whether a free-plan Durable Object gets 30 s CPU per
request (the docs page says so without a plan split; the Workers page says 10 ms on free), whether
the FTS5 trigram tokenizer is enabled in Durable Objects, and which MCP clients already speak the
2026-07-28 protocol (the handler must also serve clients still on the 2025 revisions).

If the spike shows a free Durable Object gets only 10 ms CPU, indexing a long note and building the
graph snapshot will not fit. The fallback is to start on Workers Paid at $5/month; that is the
founder's call and I will stop and ask rather than redesign around it.

## Architecture

One Worker serves everything: the web app (static assets), the JSON API, the OAuth server and the
MCP endpoint.

```
Browser (React)          AI apps (Claude, ChatGPT, Cursor, Gemini CLI)
      |  session cookie            |  OAuth access token bound to one workspace
      v                            v
 Worker: router, token check, rate limit, OAuth provider (KV), MCP handler (stateless)
      |                                     |
      v                                     v
 Workspace Durable Object (one per workspace, own SQLite)      D1 control database
 notes, revisions, links, tags, FTS5, change log, audit,       users, workspaces, memberships,
 embedding outbox + alarm                                      connected apps
      |
      v
 Workers AI (embeddings) -> Vectorize (one namespace per workspace)     R2 (exports, later)
```

- **Isolation**: a workspace is one Durable Object with its own SQLite database, so note content
  has no shared table to leak across. The object id is derived from the workspace id, which comes
  only from the verified session or token, never from a request parameter. Two stores are shared
  and are guarded differently:
  - Vectorize is one index with a namespace per workspace. Only the workspace object queries it,
    always with its own namespace. A vector hit carries only a chunk id, which is then looked up
    inside that workspace's SQLite, so a stray id from another namespace resolves to nothing.
    Vectors hold no note text. Trashing a note or deleting a workspace deletes its vectors.
  - D1 holds accounts and memberships only, never note content. Every query is keyed by the
    session's user id.
- **Sign-in**: Google as the upstream identity through workers-oauth-provider. No passwords, so
  nothing to hash inside 10 ms. (The founder creates the Google OAuth client; that is the one manual
  step.)
- **MCP connection**: the app opens our authorize page, the user signs in, picks a workspace and a
  permission (read, or read and write), and the issued token carries user id, workspace id and
  scopes. A Connected apps page lists and revokes them.
- **Hostnames**: `app.getsecondbrain.io` for the web app and API, and `mcp.getsecondbrain.io` for
  MCP (founder's choice: served at the root, no `/mcp` path), both routed to the same Worker. On
  the MCP host, the OAuth endpoints keep their own paths (`/authorize`, `/token`, `/.well-known/`),
  and a plain browser visit to the root shows a short how-to-connect page. The apex is left for a
  landing page later.

### Workspace schema (Durable Object SQLite)

- `notes(id, path UNIQUE, title, body, frontmatter, rev, source_app, created_at, updated_at,
  deleted_at)`; ids are ULIDs. `path` (folder plus name) is the unique key and `title` is indexed
  but not unique: the vault already has two `README.md` files.
- `note_revisions(note_id, rev, body, actor, at)`: every write keeps the previous version.
- `links(src_id, dst_id, dst_ref, kind)`, indexed both ways, one row per distinct source and
  target. The scanner handles `[[note]]`, `[[note|alias]]` (180 in the vault), `[[note#heading]]`,
  path-qualified links and `![[embeds]]`, and skips code fences. A bare name resolves the Obsidian
  way: exact path first, then a unique title, then the nearest folder. Links are stored by note
  id, so a rename rewrites source text in one transaction and backlinks never break. Unresolved
  links keep the reference and resolve when that note appears.
- `layouts(version, positions BLOB, communities BLOB, ranks BLOB, at_seq)`: node positions and
  graph metrics as packed arrays, one row per save, not a row per note. A 50k-note layout is about
  400 KB in one row write (the row size limit is checked in milestone 0; split into a few chunk
  rows if needed). The built graph snapshot is cached by change-log sequence.
- `tags(note_id, tag)`, `chunks(id, note_id, ord, heading, text, hash)`.
- `notes_fts` (FTS5, title weighted above body, prefix indexes for autocomplete) and `titles_fts`
  (trigram for fuzzy titles, if the spike confirms it; otherwise prefix only).
- `changes(seq, kind, note_id, at)`: append-only log; clients ask for everything after their cursor.
- `audit(seq, actor, app, tool, note_id, at)`: what each connected app read and wrote.
- `outbox(chunk_id, op)`: embedding jobs drained by the object's alarm, so no Queues dependency.

### MCP tools

`search` (hybrid), `get_note`, `list_recent`, `get_linked` (k-hop neighbours), `list_tags`,
`save_note`, `append_to_note`, `update_note` (requires the expected `rev`), `link_notes`.
(`trash_note` is held back, see the choice below.)

Safety rules (from the vault's rule that write tools must treat every text they read as hostile):

- Writes only ever land in the token's own private workspace, are attributed to the app, versioned
  and revertable from the web app.
- MCP cannot hard-delete. `trash_note` is a soft delete restorable for 30 days; permanent deletion
  and workspace deletion exist only in the web app behind the user's own session.
- **Choice for the founder to confirm**: the vault rule says any deletion by an AI tool must wait
  for a confirmation the model cannot produce. This plan reads a restorable trash as outside that
  rule, because nothing is lost and the note stays private. The stricter option is to leave
  `trash_note` out of MCP entirely and trash only from the web app. I recommend shipping without
  `trash_note` in the beta and adding it only if the lack is felt.
- No tool fetches a URL. Note content is returned as data with a clear boundary, never as tool
  instructions.
- The web app does not auto-load remote images or embeds from note content (strict CSP), which
  closes the exfiltration channel.
- Tokens are audience-bound to our server; no token passthrough; exact redirect URI matching;
  per-token rate limit.
- An independent security review (`/security-audit` plus a separate reviewer) runs before any user
  other than the founder is admitted.

### Web app

React with Vite, built by the Cloudflare Vite plugin into the Worker's static assets.

- **Graph**: sigma.js v4 with graphology (WebGL, MIT, about 97 KB). Good to roughly 50k nodes.
  Layout is ForceAtlas2 with Barnes-Hut in a web worker; positions are saved back to the workspace
  so later loads draw instantly with no layout pass. New notes are placed at the centroid of their
  neighbours and settled with a short local pass.
- **Graph transport**: one binary snapshot (Float32 positions, Uint32 CSR edges, string table),
  ETag set to the change-log sequence, then deltas by cursor. A hibernating WebSocket pushes changes
  so a note saved from an AI app appears in the open graph.
- **Editor**: CodeMirror 6, markdown as the source of truth, with wikilink autocomplete.
- **Search**: command palette with as-you-type results.
- **Saves**: optimistic, with the note's `rev`. On a mismatch the server attempts a three-way merge
  and otherwise keeps both versions as a conflict copy. No CRDT.
- UI work uses the frontend-design skill, per the vault rule.

### Search

Hybrid: FTS5 BM25 and Vectorize results fused with Reciprocal Rank Fusion (k = 60). Notes are
chunked by heading with the title and path prepended to each chunk. Embedding model: `bge-m3`
(1,024 dimensions) to start; a chunk's SHA-256 hash skips re-embedding unchanged text.

## Data structures and algorithms, and where each earns its place

| Technique | Used for | In from |
| --- | --- | --- |
| B-tree unique index on title | Resolve `[[link]]` to id in O(log n) | Day one |
| Two-way indexed edge table | Links and backlinks in O(log n + k) | Day one |
| Single-pass scanner (skips code fences) | Extract links, tags, frontmatter within the CPU budget | Day one |
| Inverted index, BM25, prefix indexes | Ranked full-text search and autocomplete | Day one |
| Trigram index | Fuzzy and substring title match | Day one if the spike passes |
| Append-only log with monotonic cursor | Delta sync, live updates, ETag | Day one |
| Content hashing | Skip unchanged embeddings, detect duplicate saves | Day one |
| BFS with depth limit (recursive CTE) | Local graph and `get_linked` | Day one |
| CSR adjacency in typed arrays | Compact graph transfer with zero decode cost | Day one |
| Barnes-Hut quadtree force layout in a worker | O(n log n) layout off the main thread | Day one |
| GPU picking, label culling, level of detail | Hover and zoom at tens of thousands of nodes | Day one (built into sigma) |
| Approximate nearest neighbour index, RRF | Semantic recall fused with keyword results | Milestone 4 |
| Louvain communities, PageRank | Cluster colours and node size (938 ms for 50k nodes in graphology) | Milestone 3, in the worker |
| Three-way merge (diff-match-patch) | Concurrent edits to one note | Milestone 3 |
| Token bucket | Per-token rate limiting | Milestone 2 |

Deferred, with the reason:

- GPU force layout (cosmos.gl): only above about 50k nodes in one workspace.
- Cross-encoder reranking: add if retrieval tests on the real vault show misses.
- CRDTs (Yjs, Loro): only if real-time shared editing becomes a feature.
- Offline SQLite in the browser (OPFS): only if offline use is requested.
- Tries and Bloom filters: FTS5 prefix indexes and SQLite indexes already cover those cases.
- Leiden: no maintained JS implementation; Louvain is enough for colouring.

## Repository layout

```
~/code/getsecondbrain.io
  AGENTS.md                 commands, conventions, deploy rules
  wrangler.jsonc            Worker, assets, DO, D1, KV, Vectorize, AI bindings; preview + production
  src/worker/index.ts       router
  src/worker/auth/          OAuth provider setup, Google upstream, consent + workspace picker
  src/worker/mcp/           createMcpHandler, tool definitions
  src/worker/workspace/     Durable Object: schema.ts, notes.ts, links.ts, search.ts, graph.ts, embed.ts
  src/worker/lib/markdown.ts  link, tag, frontmatter scanner
  src/web/                  React app: graph/, editor/, search/, settings/
  scripts/import-obsidian.ts  reads a vault folder, posts notes through the API
  migrations/               hand-written SQL for D1 (same convention as Austa)
  test/                     Vitest with the Workers pool
  .github/workflows/deploy.yml  workflow_dispatch only
```

## Milestones (each ends with something to look at)

0. **Setup and spikes.** Create the vault hub `Projects/getsecondbrain.io/getsecondbrain.io memory.md`
   and link it from `Agent Brain.md`, with the decisions above. Scaffold, `AGENTS.md`, preview and
   production environments, manual deploy workflow. Spikes on the free plan: Durable Object CPU
   budget, trigram tokenizer, rows written per note save, maximum row size for the layout blob,
   and a bare MCP endpoint connected from Claude Code, claude.ai, ChatGPT and Cursor to record
   which protocol revision and registration method each uses. Checkpoint: spike results table,
   and a stop for the founder if the CPU result forces the paid plan.
1. **Workspace core.** Schema, note create/read/update/trash, scanner, links and backlinks, FTS,
   change log, revisions, import script. Tests first for each. Checkpoint: the real vault imported
   into preview with 274 notes, and an edge count equal to what the same scanner reports when run
   locally over the vault folder (a raw grep gives 965 link occurrences and 928 distinct
   source-target pairs, before code fences are skipped), plus keyword search answering.
2. **Sign-in and MCP.** Google sign-in, OAuth provider with CIMD and DCR, consent with workspace
   picker, the MCP tools, audit log, rate limit, Connected apps page. Checkpoint: Claude Code and
   claude.ai both connected, a note saved from one and recalled from the other.
3. **Web app.** Graph, search palette, editor, conflict handling, live updates. Checkpoint: the real
   vault's graph in preview, plus a synthetic 50k-note workspace with measured load time and frame
   rate.
4. **Semantic search.** Chunking, outbox and alarm, embeddings, Vectorize, RRF. Checkpoint: a small
   set of real questions against the vault, keyword-only versus hybrid, side by side.
5. **Hardening.** Markdown export (zip), restore from point-in-time recovery rehearsed once,
   security audit and independent review, usage counters against the free limits. Then the decision
   on public signup, pricing and the name check.

## Verification

- Unit and integration tests in Vitest's Workers pool (real Durable Object SQLite): scanner cases,
  rename keeps backlinks, FTS ranking, cursor deltas, rev conflicts, soft delete and restore.
- Isolation tests: a token for workspace A cannot read, search or write workspace B through the
  API or any MCP tool, including semantic search (a vector planted in B's namespace never appears
  in A's results); a revoked token fails; a read-only token cannot write; trashing a note and
  deleting a workspace remove their vectors.
- OAuth conformance: protected resource metadata, PKCE, audience check, exact redirect match, both
  CIMD and DCR registration paths.
- End to end in preview (never a local stack): import the vault, connect Claude Code and claude.ai,
  save and recall, watch the note appear in the open graph.
- Performance budget, measured on the 50k synthetic workspace: graph first paint under 1 s from
  stored positions, search under 100 ms server time, note save under 50 ms server time.
- After each deploy, confirm on the live site (fetch the page, grep the bundle), not by the green
  run. Types, tests and the real build run before every deploy.

## Rollback

- Code: `wrangler rollback` to the previous Worker version.
- Data: per-workspace point-in-time recovery (30 days), per-note revisions, 30-day trash, and the
  markdown export. The founder's Obsidian vault stays untouched as the source during the beta.
- Cost: everything is on the free plan; nothing here creates a fixed monthly charge.

## Needed from the founder during the build

- A Google OAuth client (id and secret set as Worker secrets by the founder).
- Running the deploy commands the agent is not allowed to run, handed over one per line.
- Before public launch only: the trademark check on the name.
