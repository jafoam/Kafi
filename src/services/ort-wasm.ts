export const ORT_WASM_GZ_URL = "/ort/ort-wasm-simd-threaded.jsep.wasm.gz";

export interface GzipWasmDeps {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Downloads the gzip-compressed ORT WASM served next to the app and returns the raw bytes.
 * Cloudflare Pages rejects files over 25 MiB, so the web build ships the .wasm gzipped (~6.6 MB).
 * Returns null when it is unavailable so callers can fall back to the CDN.
 */
export async function loadGzippedOrtWasm(
  url: string = ORT_WASM_GZ_URL,
  deps: GzipWasmDeps = {},
): Promise<Uint8Array | null> {
  try {
    const response = await (deps.fetchImpl ?? fetch)(url, { signal: deps.signal });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null; // SPA fallback served instead of the file
    let bytes = new Uint8Array(await response.arrayBuffer());
    // Some servers send .gz with Content-Encoding: gzip, so the browser has already inflated it.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") return null;
      const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    // WebAssembly magic number: \0asm
    if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) return null;
    return bytes;
  } catch {
    return null;
  }
}
