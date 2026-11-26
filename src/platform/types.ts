import type { ModelStorage } from "@tilawa/core";

export type TilawaModelStorage = ModelStorage;

export interface PlatformAdapter {
  isDesktop: boolean;
  getPageImageUrl(page: number): Promise<string>;
  cacheGet(bucket: string, key: string): Promise<Uint8Array | null>;
  cachePut(bucket: string, key: string, bytes: Uint8Array): Promise<void>;
  cacheHas(bucket: string, key: string): Promise<boolean>;
  cacheDelete(bucket: string, key: string): Promise<void>;
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  createTilawaStorage(): TilawaModelStorage;
  startNativeMic?(
    onChunk: (pcm: Float32Array, sampleRate: number) => void,
  ): Promise<() => Promise<void>>;
}
