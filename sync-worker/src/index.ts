interface Env {
  KAFI_SYNC_KV: KVNamespace;
}

const VAULT_ID_RE = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 512 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/v1\/vault\/([a-f0-9]{64})$/);
    if (!match) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const vaultId = match[1];
    if (!VAULT_ID_RE.test(vaultId)) {
      return jsonResponse({ error: "Invalid vault id" }, 400);
    }

    if (request.method === "GET") {
      const stored = await env.KAFI_SYNC_KV.get(vaultId);
      if (!stored) {
        return jsonResponse({ error: "Vault empty" }, 404);
      }
      return new Response(stored, {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return jsonResponse({ error: "Payload too large" }, 413);
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }
      if (parsed.v !== 1 || typeof parsed.iv !== "string" || typeof parsed.ct !== "string") {
        return jsonResponse({ error: "Invalid encrypted envelope" }, 400);
      }
      await env.KAFI_SYNC_KV.put(vaultId, text);
      return jsonResponse({ ok: true }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  },
};
