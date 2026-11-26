import { isTauriDesktop } from "./index";

export async function registerServiceWorker(
  isProd: boolean = import.meta.env.PROD,
  mushafBaseUrl: string = import.meta.env?.VITE_MUSHAF_BASE_URL ?? "",
  ortBaseUrl: string = import.meta.env?.VITE_ORT_WASM_PATH ?? "",
): Promise<ServiceWorkerRegistration | null> {
  if (!isProd || isTauriDesktop()) return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const trimmed = mushafBaseUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (trimmed) params.set("mushafBase", trimmed);
  const ort = ortBaseUrl.trim().replace(/\/+$/, "");
  if (ort) params.set("ortBase", ort);
  const query = params.toString();
  const swUrl = query ? `/sw.js?${query}` : "/sw.js";

  try {
    return await navigator.serviceWorker.register(swUrl);
  } catch {
    return null;
  }
}
