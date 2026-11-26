import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { loadGzippedOrtWasm } from "../src/services/ort-wasm";

const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 9, 9]);

function respond(body: Uint8Array, init: ResponseInit = {}): typeof fetch {
  return (async () => new Response(gzipSync(body), init)) as unknown as typeof fetch;
}

describe("loadGzippedOrtWasm", () => {
  it("returns the decompressed wasm bytes", async () => {
    const bytes = await loadGzippedOrtWasm("/x.gz", { fetchImpl: respond(WASM) });
    expect(Array.from(bytes ?? [])).toEqual(Array.from(WASM));
  });

  it("accepts bytes the server already inflated via Content-Encoding", async () => {
    const plain = (async () => new Response(WASM)) as unknown as typeof fetch;
    const bytes = await loadGzippedOrtWasm("/x.gz", { fetchImpl: plain });
    expect(Array.from(bytes ?? [])).toEqual(Array.from(WASM));
  });

  it("returns null on HTTP errors, SPA html fallbacks, and non-wasm payloads", async () => {
    expect(await loadGzippedOrtWasm("/x.gz", { fetchImpl: respond(WASM, { status: 404 }) })).toBeNull();
    expect(
      await loadGzippedOrtWasm("/x.gz", {
        fetchImpl: respond(WASM, { headers: { "content-type": "text/html" } }),
      }),
    ).toBeNull();
    expect(await loadGzippedOrtWasm("/x.gz", { fetchImpl: respond(new Uint8Array([1, 2, 3, 4])) })).toBeNull();
  });

  it("returns null when the network fails", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await loadGzippedOrtWasm("/x.gz", { fetchImpl: failing })).toBeNull();
  });
});
