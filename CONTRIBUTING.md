# Contributing

Thanks for helping improve Second Brain. Bug reports, ideas and pull requests are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Security issues go through private reporting, never a public issue: see [SECURITY.md](SECURITY.md).
- Read [AGENTS.md](AGENTS.md). It lists the project's rules, and coding agents read it too.

## Set up

Requires Node 24 and pnpm. See "Run it locally" in the [README](README.md) for sign-in secrets.

```sh
pnpm install
pnpm build   # the site tests read the built files
pnpm test
```

## Making a change

- Write the test first, then the code. Keep one test per distinct scenario.
- Tests run in the Workers runtime against real Durable Object SQLite, so test through the real
  store, not mocks.
- A workspace id only ever comes from a verified session or token. Every new route or MCP tool needs
  a test that workspace A cannot reach workspace B.
- A new write path goes through `Workspace.saveNote` or `renameNote`, so fair-use limits apply.
- MCP tools never hard-delete and never fetch URLs; note content is returned as data.
- D1 changes are new hand-written SQL files in `migrations/`. Durable Object schema changes bump the
  version in `src/worker/workspace/`.
- Run `pnpm types` and `pnpm test` before opening a pull request. CI runs both.

## Pull requests

Keep each pull request to one change, explain what it does and why, and say how you tested it. By
contributing you agree that your contribution is licensed under the
[AGPL-3.0](LICENSE), like the rest of the project.

## Code of conduct

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
