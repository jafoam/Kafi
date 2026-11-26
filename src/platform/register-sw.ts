import { isTauriDesktop } from "./index";

export async function registerServiceWorker(
  isProd: boolean = import.meta.env.PROD,
): Promise<ServiceWorkerRegistration | null> {
  if (!isProd || isTauriDesktop()) return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}
