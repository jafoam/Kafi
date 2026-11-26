import type { PlatformAdapter } from "./types";
import { createTauriAdapter } from "./tauri-adapter";
import { createWebAdapter } from "./web-adapter";

export type { PlatformAdapter, TilawaModelStorage } from "./types";

let webAdapter: PlatformAdapter | null = null;
let tauriAdapter: PlatformAdapter | null = null;

export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getPlatform(): PlatformAdapter {
  if (isTauriDesktop()) {
    tauriAdapter ??= createTauriAdapter();
    return tauriAdapter;
  }
  webAdapter ??= createWebAdapter();
  return webAdapter;
}
