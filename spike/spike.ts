// Milestone 0 spikes. Throwaway code: measures free-plan behaviour that the docs leave unclear.
// Deployed as its own Worker (spike/wrangler.jsonc) so the real Worker's migrations stay clean.
import { DurableObject } from "cloudflare:workers";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";

interface SpikeEnv {
  SPIKE: DurableObjectNamespace<SpikeObject>;
}

/** Pure CPU work. Date.now() does not advance without I/O in Workers, so work is counted, not timed. */
function burn(iters: number): number {
  let x = 1;
  for (let i = 0; i < iters; i++) x = (Math.imul(x, 1664525) + 1013904223) | 0;
  return x;
}

export class SpikeObject extends DurableObject<SpikeEnv> {
  cpu(iters: number): number {
    return burn(iters);
  }

  trigram(): { supported: boolean; matches?: string[]; error?: string } {
    const sql = this.ctx.storage.sql;
    try {
      sql.exec("DROP TABLE IF EXISTS titles_fts");
      sql.exec("CREATE VIRTUAL TABLE titles_fts USING fts5(title, tokenize='trigram')");
      sql.exec("INSERT INTO titles_fts (title) VALUES (?), (?)", "Durable Objects on the free plan", "Graph layout");
      const rows = sql.exec<{ title: string }>("SELECT title FROM titles_fts WHERE titles_fts MATCH ?", "rable Obj");
      return { supported: true, matches: rows.toArray().map((row) => row.title) };
    } catch (error) {
      return { supported: false, error: String(error) };
    }
  }

  /** A note save shaped like the planned schema: note, revision, 3 links, 2 tags, FTS row, change, audit. */
  rows(): { rowsWritten: number; breakdown: Record<string, number> } {
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, path TEXT UNIQUE, title TEXT, body TEXT, rev INTEGER, updated_at INTEGER);
      CREATE INDEX IF NOT EXISTS notes_title ON notes (title);
      CREATE TABLE IF NOT EXISTS note_revisions (note_id TEXT, rev INTEGER, body TEXT, PRIMARY KEY (note_id, rev));
      CREATE TABLE IF NOT EXISTS links (src_id TEXT, dst_ref TEXT, dst_id TEXT, PRIMARY KEY (src_id, dst_ref));
      CREATE INDEX IF NOT EXISTS links_dst ON links (dst_id);
      CREATE TABLE IF NOT EXISTS tags (note_id TEXT, tag TEXT, PRIMARY KEY (note_id, tag));
      CREATE INDEX IF NOT EXISTS tags_tag ON tags (tag);
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, body, prefix='2 3');
      CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, note_id TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, tool TEXT, note_id TEXT, at INTEGER);
    `);
    const id = crypto.randomUUID();
    const body = "A paragraph of note text with [[One]], [[Two]] and [[Three]]. #alpha #beta\n".repeat(20);
    const breakdown: Record<string, number> = {};
    const run = (name: string, query: string, ...bindings: unknown[]) => {
      const cursor = sql.exec(query, ...bindings);
      cursor.toArray();
      breakdown[name] = (breakdown[name] ?? 0) + cursor.rowsWritten;
    };
    run("note", "INSERT INTO notes VALUES (?, ?, ?, ?, 1, ?)", id, `inbox/${id}`, "Spike note", body, Date.now());
    run("revision", "INSERT INTO note_revisions VALUES (?, 1, ?)", id, body);
    for (const ref of ["One", "Two", "Three"]) run("links", "INSERT INTO links VALUES (?, ?, NULL)", id, ref);
    for (const tag of ["alpha", "beta"]) run("tags", "INSERT INTO tags VALUES (?, ?)", id, tag);
    run("fts", "INSERT INTO notes_fts (title, body) VALUES (?, ?)", "Spike note", body);
    run("change", "INSERT INTO changes (kind, note_id, at) VALUES ('upsert', ?, ?)", id, Date.now());
    run("audit", "INSERT INTO audit (actor, tool, note_id, at) VALUES ('spike', 'save_note', ?, ?)", id, Date.now());
    const rowsWritten = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
    return { rowsWritten, breakdown };
  }

  blob(kb: number): { kb: number; stored: boolean; bytes?: number; rowsWritten?: number; error?: string } {
    const sql = this.ctx.storage.sql;
    try {
      sql.exec("CREATE TABLE IF NOT EXISTS layouts (version INTEGER PRIMARY KEY, positions BLOB)");
      const cursor = sql.exec("INSERT OR REPLACE INTO layouts VALUES (1, ?)", new Uint8Array(kb * 1024).buffer);
      cursor.toArray();
      const row = sql.exec<{ bytes: number }>("SELECT length(positions) AS bytes FROM layouts WHERE version = 1").one();
      return { kb, stored: true, bytes: row.bytes, rowsWritten: cursor.rowsWritten };
    } catch (error) {
      return { kb, stored: false, error: String(error) };
    }
  }
}

/** Bare MCP endpoint with no auth and no data: records how each client connects. */
const mcp = createMcpHandler(
  () => {
    const server = new McpServer({ name: "getsecondbrain-spike", version: "0.0.0" });
    server.registerTool("ping", { description: "Replies with pong. Connection test only." }, async () => ({
      content: [{ type: "text", text: "pong" }],
    }));
    return server;
  },
  { route: "/mcp" },
);

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const object = env.SPIKE.getByName("spike");
    switch (url.pathname) {
      case "/cpu": {
        const where = url.searchParams.get("where") === "object" ? "object" : "worker";
        const iters = Number(url.searchParams.get("iters") ?? 1_000_000);
        const result = where === "object" ? await object.cpu(iters) : burn(iters);
        return Response.json({ where, iters, result });
      }
      case "/trigram":
        return Response.json(await object.trigram());
      case "/rows":
        return Response.json(await object.rows());
      case "/blob":
        return Response.json(await object.blob(Number(url.searchParams.get("kb") ?? 400)));
      case "/mcp":
        console.log(
          JSON.stringify({
            spike: "mcp-client",
            method: request.method,
            userAgent: request.headers.get("user-agent"),
            protocolVersion: request.headers.get("mcp-protocol-version"),
            mcpMethod: request.headers.get("mcp-method"),
            sessionId: request.headers.get("mcp-session-id"),
          }),
        );
        return mcp(request, env, ctx);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<SpikeEnv>;
