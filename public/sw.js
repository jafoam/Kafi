const SHELL_CACHE = "ayat-shell-v1";
const MEDIA_CACHE = "ayat-media-v1";
const VALID_CACHES = new Set([SHELL_CACHE, MEDIA_CACHE]);

const SHELL_PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icons/icon.svg"];

const MEDIA_HOSTS = new Set([
  "everyayah.com",
  "www.everyayah.com",
  "api.quran.com",
  "equran.id",
  "www.equran.id",
]);

function classifyRequest(url, mode) {
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

  // Never intercept @tilawa/core model downloads (managed by its own Cache API storage).
  if (host === "tilawa.dev" || host.endsWith(".tilawa.dev")) {
    return "passthrough";
  }

  if (MEDIA_HOSTS.has(host)) {
    return "cache-first-media";
  }

  const { pathname } = parsed;

  if (pathname.startsWith("/mushaf/")) {
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
            // Only prune older Ayat caches so @tilawa/core's model cache stays intact.
            .filter((key) => key.startsWith("ayat-") && !VALID_CACHES.has(key))
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
