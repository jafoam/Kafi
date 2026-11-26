import type { NetworkKind, StorageInfo } from "./types";

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
}

/**
 * The connection type as the WebView reports it. Chrome and Android WebView expose `type`; where it
 * is missing the answer is "unknown", which callers treat as allowed.
 */
export function browserNetworkKind(
  nav: { connection?: NetworkInformationLike } | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as { connection?: NetworkInformationLike }),
): NetworkKind {
  const type = nav?.connection?.type;
  if (type === "wifi" || type === "ethernet") return "wifi";
  if (type === "cellular") return "cellular";
  return "unknown";
}

/** Storage use and limit from the browser's storage estimate, or null where it is unavailable. */
export async function browserStorageInfo(
  storage: Pick<StorageManager, "estimate"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.storage,
): Promise<StorageInfo | null> {
  if (!storage?.estimate) return null;
  try {
    const { usage, quota } = await storage.estimate();
    if (typeof usage !== "number" || typeof quota !== "number") return null;
    return { used: usage, quota };
  } catch {
    return null;
  }
}
