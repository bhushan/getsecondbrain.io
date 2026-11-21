import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

async function get(path: string) {
  const response = await exports.default.fetch(`https://spike.example${path}`);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

it("burns CPU in the worker and in the object and reports the work done", async () => {
  for (const where of ["worker", "object"]) {
    const { status, body } = await get(`/cpu?where=${where}&iters=1000000`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ where, iters: 1_000_000 });
  }
}, 20_000);

it("finds a substring through the trigram tokenizer", async () => {
  const { body } = await get("/trigram");
  expect(body).toEqual({ supported: true, matches: ["Durable Objects on the free plan"] });
});

it("reports rows written by a representative note save", async () => {
  const { body } = await get("/rows");
  expect(body.rowsWritten).toBeGreaterThan(5);
});

it("stores a layout blob of the requested size in one row", async () => {
  const { body } = await get("/blob?kb=400");
  expect(body).toMatchObject({ kb: 400, stored: true, bytes: 400 * 1024 });
});
