export type SwRouteStrategy =
  | "cache-first-static"
  | "cache-first-media"
  | "network-first-shell"
  | "passthrough";

const MEDIA_HOSTS = new Set([
  "everyayah.com",
  "www.everyayah.com",
  "api.quran.com",
  "equran.id",
  "www.equran.id",
]);

export function classifyRequest(url: string): SwRouteStrategy {
  let parsed: URL;
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

  if (pathname === "/" || pathname === "/index.html") {
    return "network-first-shell";
  }

  return "passthrough";
}
