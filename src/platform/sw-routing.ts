export type SwRouteStrategy =
  | "cache-first-static"
  | "cache-first-media"
  | "network-first-shell"
  | "passthrough";

function normalizeMushafBasePrefix(mushafBaseUrl?: string, origin?: string): string {
  const trimmed = mushafBaseUrl?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const resolved = new URL(trimmed, origin);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return "";
    return resolved.href.replace(/\/+$/, "") + "/";
  } catch {
    return "";
  }
}

export function classifyRequest(
  url: string,
  selfOrigin?: string,
  mushafBaseUrl?: string,
): SwRouteStrategy {
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

  let origin = parsed.origin;
  if (selfOrigin) {
    try {
      origin = new URL(selfOrigin).origin;
    } catch {
      return "passthrough";
    }
  }

  const mushafPrefix = normalizeMushafBasePrefix(mushafBaseUrl, origin);
  if (mushafPrefix && parsed.href.startsWith(mushafPrefix)) {
    return "cache-first-media";
  }

  if (parsed.origin !== origin) {
    return "passthrough";
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
