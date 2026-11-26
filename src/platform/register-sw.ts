import { isTauriDesktop } from "./index";

export async function registerServiceWorker(
  isProd: boolean = import.meta.env.PROD,
  mushafBaseUrl: string = import.meta.env?.VITE_MUSHAF_BASE_URL ?? "",
): Promise<ServiceWorkerRegistration | null> {
  if (!isProd || isTauriDesktop()) return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const trimmed = mushafBaseUrl.trim().replace(/\/+$/, "");
  const swUrl = trimmed
    ? `/sw.js?mushafBase=${encodeURIComponent(trimmed)}`
    : "/sw.js";

  try {
    return await navigator.serviceWorker.register(swUrl);
  } catch {
    return null;
  }
}
