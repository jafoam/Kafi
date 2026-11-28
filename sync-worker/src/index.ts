interface Env {
  KAFI_SYNC_KV: KVNamespace;
}

const VAULT_ID_RE = /^[a-f0-9]{64}$/;
const MEMBER_ID_RE = /^[a-f0-9]{16,64}$/;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_HALAQAH_MEMBERS = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Halaqah-Secret",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isEncryptedEnvelope(parsed: Record<string, unknown>): boolean {
  return parsed.v === 1 && typeof parsed.iv === "string" && typeof parsed.ct === "string";
}

async function handleHalaqah(request: Request, env: Env, url: URL): Promise<Response | null> {
  // GET /v1/halaqah/:groupId
  const getMatch = url.pathname.match(/^\/v1\/halaqah\/([a-f0-9]{64})$/);
  if (getMatch && request.method === "GET") {
    const groupId = getMatch[1];
    const metaRaw = await env.KAFI_SYNC_KV.get(`halaqah:${groupId}:meta`);
    if (!metaRaw) {
      return jsonResponse({ error: "Halaqah not found" }, 404);
    }
    const prefix = `halaqah:${groupId}:m:`;
    const listed = await env.KAFI_SYNC_KV.list({ prefix, limit: MAX_HALAQAH_MEMBERS });
    const members = (
      await Promise.all(
        listed.keys.map(async (k) => {
          const raw = await env.KAFI_SYNC_KV.get(k.name);
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return {
              memberId: k.name.slice(prefix.length),
              v: parsed.v,
              iv: parsed.iv,
              ct: parsed.ct,
              updatedAt: parsed.updatedAt,
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);

    const metaParsed = JSON.parse(metaRaw) as Record<string, unknown>;
    return jsonResponse({
      meta: {
        v: metaParsed.v,
        iv: metaParsed.iv,
        ct: metaParsed.ct,
        updatedAt: metaParsed.updatedAt,
        locked: Boolean(metaParsed.locked),
      },
      members,
    });
  }

  // PUT /v1/halaqah/:groupId/meta
  const metaMatch = url.pathname.match(/^\/v1\/halaqah\/([a-f0-9]{64})\/meta$/);
  if (metaMatch && request.method === "PUT") {
    const groupId = metaMatch[1];
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return jsonResponse({ error: "Payload too large" }, 413);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!isEncryptedEnvelope(parsed) || typeof parsed.adminHash !== "string" || !VAULT_ID_RE.test(parsed.adminHash)) {
      return jsonResponse({ error: "Invalid halaqah meta envelope" }, 400);
    }
    const metaKey = `halaqah:${groupId}:meta`;
    const existingRaw = await env.KAFI_SYNC_KV.get(metaKey);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as Record<string, unknown>;
      if (existing.adminHash !== parsed.adminHash) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    }
    await env.KAFI_SYNC_KV.put(metaKey, text);
    return jsonResponse({ ok: true }, 200);
  }

  // PUT or DELETE /v1/halaqah/:groupId/member/:memberId
  const memberMatch = url.pathname.match(/^\/v1\/halaqah\/([a-f0-9]{64})\/member\/([a-f0-9]{16,64})$/);
  if (memberMatch) {
    const [, groupId, memberId] = memberMatch;
    if (!MEMBER_ID_RE.test(memberId)) return jsonResponse({ error: "Invalid member id" }, 400);
    const metaKey = `halaqah:${groupId}:meta`;
    const metaRaw = await env.KAFI_SYNC_KV.get(metaKey);
    if (!metaRaw) return jsonResponse({ error: "Halaqah not found" }, 404);
    const meta = JSON.parse(metaRaw) as Record<string, unknown>;
    const memberKey = `halaqah:${groupId}:m:${memberId}`;

    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return jsonResponse({ error: "Payload too large" }, 413);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }
      if (!isEncryptedEnvelope(parsed) || typeof parsed.secretHash !== "string" || !VAULT_ID_RE.test(parsed.secretHash)) {
        return jsonResponse({ error: "Invalid member envelope" }, 400);
      }
      const existingRaw = await env.KAFI_SYNC_KV.get(memberKey);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw) as Record<string, unknown>;
        if (existing.secretHash !== parsed.secretHash) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
      } else {
        if (meta.locked) {
          return jsonResponse({ error: "Halaqah locked" }, 403);
        }
        const listed = await env.KAFI_SYNC_KV.list({ prefix: `halaqah:${groupId}:m:`, limit: MAX_HALAQAH_MEMBERS });
        if (listed.keys.length >= MAX_HALAQAH_MEMBERS) {
          return jsonResponse({ error: "Halaqah full" }, 403);
        }
      }
      await env.KAFI_SYNC_KV.put(memberKey, text);
      return jsonResponse({ ok: true }, 200);
    }

    if (request.method === "DELETE") {
      const secretHash = request.headers.get("X-Halaqah-Secret") ?? "";
      const existingRaw = await env.KAFI_SYNC_KV.get(memberKey);
      if (!existingRaw) return jsonResponse({ ok: true }, 200);
      const existing = JSON.parse(existingRaw) as Record<string, unknown>;
      if (secretHash !== existing.secretHash && secretHash !== meta.adminHash) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
      await env.KAFI_SYNC_KV.delete(memberKey);
      return jsonResponse({ ok: true }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/v1/halaqah/")) {
      const res = await handleHalaqah(request, env, url);
      if (res) return res;
      return jsonResponse({ error: "Not found" }, 404);
    }

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
