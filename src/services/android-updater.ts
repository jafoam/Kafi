export interface AndroidUpdateInfo {
  tag: string;
  name: string;
  apkUrl: string;
  updatedAt: string;
  sizeBytes: number;
}

export type AndroidUpdateStatus = "installing" | "permission_required" | "error";

interface AndroidUpdaterBridge {
  downloadAndInstallApk?: (url: string) => void;
  installCachedApk?: () => void;
}

type KafiUpdaterWindow = Window & {
  KafiAndroid?: AndroidUpdaterBridge;
  __kafiUpdateProgress?: (percent: number) => void;
  __kafiUpdateStatus?: (status: string) => void;
};

declare const __APP_BUILD_TIME__: string | undefined;

const RELEASES_API_URL = "https://api.github.com/repos/jafoam/Kafi/releases?per_page=1";
/** Ignore assets uploaded within 5 minutes of this APK's own build time. */
const BUILD_GRACE_MS = 5 * 60 * 1000;

export function getAppBuildTime(): string {
  return typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : new Date().toISOString();
}

export function isAndroidUpdaterAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as KafiUpdaterWindow).KafiAndroid?.downloadAndInstallApk === "function";
}

interface GithubAsset {
  name?: string;
  browser_download_url?: string;
  updated_at?: string;
  size?: number;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  draft?: boolean;
  assets?: GithubAsset[];
}

export async function checkForAndroidUpdate(
  buildTimeIso: string = getAppBuildTime(),
  fetchImpl: typeof fetch = fetch,
): Promise<AndroidUpdateInfo | null> {
  const res = await fetchImpl(RELEASES_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const list = (await res.json()) as GithubRelease[];
  if (!Array.isArray(list) || list.length === 0) return null;

  const latest = list.find((r) => !r.draft) ?? list[0];
  const apk = latest?.assets?.find(
    (a) => typeof a.name === "string" && a.name.endsWith(".apk") && typeof a.browser_download_url === "string",
  );
  if (!latest || !apk || !apk.browser_download_url || !apk.updated_at) return null;

  const assetMs = Date.parse(apk.updated_at);
  const buildMs = Date.parse(buildTimeIso);
  if (!Number.isFinite(assetMs) || !Number.isFinite(buildMs)) return null;
  if (assetMs <= buildMs + BUILD_GRACE_MS) return null;

  return {
    tag: latest.tag_name ?? "",
    name: latest.name || latest.tag_name || "Update",
    apkUrl: apk.browser_download_url,
    updatedAt: apk.updated_at,
    sizeBytes: apk.size ?? 0,
  };
}

export function startAndroidUpdate(
  apkUrl: string,
  callbacks: {
    onProgress: (percent: number) => void;
    onStatus: (status: AndroidUpdateStatus) => void;
  },
  useCached = false,
): boolean {
  if (typeof window === "undefined") return false;
  const win = window as KafiUpdaterWindow;
  const bridge = win.KafiAndroid;
  if (!bridge?.downloadAndInstallApk) return false;

  win.__kafiUpdateProgress = (pct) => {
    const safe = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
    callbacks.onProgress(safe);
  };
  win.__kafiUpdateStatus = (raw) => {
    if (raw === "installing" || raw === "permission_required") {
      callbacks.onStatus(raw);
    } else {
      callbacks.onStatus("error");
    }
  };

  if (useCached && bridge.installCachedApk) {
    bridge.installCachedApk();
  } else {
    bridge.downloadAndInstallApk(apkUrl);
  }
  return true;
}
