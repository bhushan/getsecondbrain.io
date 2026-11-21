# Milestone 0 spike results

Measured 2026-11-22 against the deployed `getsecondbrain-spike` Worker on the personal Cloudflare
account, with `sh spike/run.sh <url>` plus a burst of repeated requests. The account's plan was not
read from the API; the intermittent 503s on the Worker are consistent with the free-plan CPU limit.

| Question | Result | Consequence |
| --- | --- | --- |
| Does a Durable Object get more CPU than the 10 ms Worker limit? | Yes. 20 back-to-back requests of about 0.4 s CPU each all returned 200, and one request of about 7.7 s returned 200 | Indexing, search and graph snapshots run inside the workspace object. No paid plan needed for CPU |
| Is the Worker limit enforced? | Loosely. Single heavy requests passed; under 20 back-to-back heavy requests 8 returned 503 | The Worker only routes and checks tokens. Never rely on the slack |
| Is the FTS5 trigram tokenizer available in Durable Objects? | Yes, substring match works in production | `titles_fts` uses trigram |
| Rows written per note save | 26 for a note with 3 links and 2 tags (note 4, revision 2, links 9, tags 6, FTS 1, change 2, audit 2) | About 3,800 saves a day on the free plan. Secondary indexes double the count, so add them sparingly |
| Largest blob in one row | 4 MB stored in one row write (larger sizes not tried) | A 50k-note layout (about 400 KB) is one row |

Still open: which MCP protocol revision and registration method each client uses. The spike Worker
serves a bare `/mcp` endpoint (no auth, one `ping` tool) that logs the request headers; connect
Claude Code, claude.ai, ChatGPT and Cursor to it and read the logs with
`pnpm wrangler tail --config spike/wrangler.jsonc`. Delete the Worker afterwards:
`pnpm wrangler delete --config spike/wrangler.jsonc`.
