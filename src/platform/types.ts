import type { ModelStorage } from "@tilawa/core";

export type TilawaModelStorage = ModelStorage;

export interface CacheEntryInfo {
  key: string;
  /** Size in bytes. */
  size: number;
}

export type NetworkKind = "wifi" | "cellular" | "unknown";

export interface StorageInfo {
  /** Bytes the app uses. */
  used: number;
  /** Bytes the app may use. */
  quota: number;
}

export interface PlatformAdapter {
  isDesktop: boolean;
  getPageImageUrl(page: number): Promise<string>;
  cacheGet(bucket: string, key: string): Promise<Uint8Array | null>;
  cachePut(bucket: string, key: string, bytes: Uint8Array): Promise<void>;
  cacheHas(bucket: string, key: string): Promise<boolean>;
  cacheDelete(bucket: string, key: string): Promise<void>;
  /** Every entry of a bucket with its size, so the app can show what is downloaded. */
  cacheList(bucket: string): Promise<CacheEntryInfo[]>;
  /**
   * Which kind of connection is in use, so large downloads can wait for Wi-Fi. When missing, the
   * WebView's Network Information API is used; an Android build can supply a native answer.
   */
  getNetworkKind?(): Promise<NetworkKind>;
  /** Storage use and limit. When missing, the WebView's storage estimate is used. */
  getStorageInfo?(): Promise<StorageInfo | null>;
  /**
   * Keeps a long download running while the app is in the background and returns a function that
   * ends it. On Android this is where a foreground service with a notification belongs; platforms
   * that need nothing leave it out.
   */
  beginBackgroundTask?(label: string): Promise<() => Promise<void>>;
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  createTilawaStorage(): TilawaModelStorage;
  startNativeMic?(
    onChunk: (pcm: Float32Array, sampleRate: number) => void,
  ): Promise<() => Promise<void>>;
}
