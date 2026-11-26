const SHELL_CACHE = "kafi-shell-v1";
const MEDIA_CACHE = "kafi-media-v1";
const VALID_CACHES = new Set([SHELL_CACHE, MEDIA_CACHE]);

const SHELL_PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icons/icon.svg"];

function normalizeMushafBasePrefix(mushafBaseUrl, origin) {
  const trimmed = (mushafBaseUrl || "").trim();
  if (!trimmed) return "";
  try {
    const resolved = new URL(trimmed, origin);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return "";
    return resolved.href.replace(/\/+$/, "") + "/";
  } catch {
    return "";
  }
}

const MUSHAF_BASE_PREFIX = normalizeMushafBasePrefix(
  new URL(self.location.href).searchParams.get("mushafBase"),
  self.location.origin,
);

const ORT_BASE_PREFIX = normalizeMushafBasePrefix(
  new URL(self.location.href).searchParams.get("ortBase"),
  self.location.origin,
);

function classifyRequest(
  url,
  mode,
  origin = self.location.origin,
  mushafBasePrefix = MUSHAF_BASE_PREFIX,
  ortBasePrefix = ORT_BASE_PREFIX,
) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "passthrough";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "passthrough";
  }

  const host = parsed.hostname.toLowerCase();

  if (ortBasePrefix && parsed.href.startsWith(ortBasePrefix)) {
    return "cache-first-static";
  }

  if (host === "tilawa.dev" || host.endsWith(".tilawa.dev")) {
    // ORT WASM runtime is cached once; model downloads stay with @tilawa/core's own Cache API storage.
    return parsed.pathname.includes("/runtime/ort/") ? "cache-first-static" : "passthrough";
  }

  if (mushafBasePrefix && parsed.href.startsWith(mushafBasePrefix)) {
    return "cache-first-media";
  }

  if (parsed.origin !== origin) {
    return "passthrough";
  }

  const { pathname } = parsed;

  if (pathname.startsWith("/mushaf/") || pathname.startsWith("/fonts/")) {
    return "cache-first-media";
  }

  if (
    pathname.startsWith("/ort/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest"
  ) {
    return "cache-first-static";
  }

  if (mode === "navigate" || pathname === "/" || pathname === "/index.html") {
    return "network-first-shell";
  }

  return "passthrough";
}

function isCacheableResponse(response) {
  return (
    Boolean(response) &&
    response.status === 200 &&
    (response.type === "basic" || response.type === "cors")
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = (await cache.match(request)) || (await cache.match("/"));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PRECACHE_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Only prune older Kafi caches so @tilawa/core's model cache stays intact.
            .filter((key) => key.startsWith("kafi-") && !VALID_CACHES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const strategy = classifyRequest(event.request.url, event.request.mode);
  if (strategy === "passthrough") return;

  if (strategy === "cache-first-static") {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  if (strategy === "cache-first-media") {
    event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
    return;
  }

  if (strategy === "network-first-shell") {
    event.respondWith(networkFirstShell(event.request));
  }
});
