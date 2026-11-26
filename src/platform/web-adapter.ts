import type { PlatformAdapter, TilawaModelStorage } from "./types";

const CACHE_NAME = "kafi-cache-v1";
const TILAWA_CACHE_NAME = "tilawa-models";
const IDB_NAME = "kafi-kv";
const IDB_STORE = "kv";

export function resolvePageUrl(page: number, baseUrl?: string): string {
  const rawBase =
    baseUrl !== undefined
      ? baseUrl
      : (import.meta.env?.VITE_MUSHAF_BASE_URL ?? "");
  const file = `${String(page).padStart(3, "0")}.gif`;
  const trimmed = rawBase.replace(/\/+$/, "");
  return trimmed ? `${trimmed}/${file}` : `/mushaf/pages/${file}`;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

function cacheUrl(bucket: string, key: string): string {
  return `https://kafi.cache/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
}

async function openCache(name: string): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  return caches.open(name);
}

export function createWebAdapter(options?: { mushafBaseUrl?: string }): PlatformAdapter {
  const tilawaUrl = (key: string) => `https://tilawa.models/${key}`;

  const createTilawaStorage = (): TilawaModelStorage => ({
    async get(key: string) {
      const cache = await openCache(TILAWA_CACHE_NAME);
      if (!cache) return null;
      const res = await cache.match(tilawaUrl(key));
      return res ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    async put(key: string, bytes: Uint8Array) {
      const cache = await openCache(TILAWA_CACHE_NAME);
      if (!cache) return;
      const copy = new Uint8Array(bytes);
      await cache.put(
        tilawaUrl(key),
        new Response(copy, { headers: { "content-length": String(copy.byteLength) } }),
      );
    },
    async delete(key: string) {
      const cache = await openCache(TILAWA_CACHE_NAME);
      if (!cache) return;
      await cache.delete(tilawaUrl(key));
    },
    async keys() {
      const cache = await openCache(TILAWA_CACHE_NAME);
      if (!cache) return [];
      const reqs = await cache.keys();
      return reqs.map((r) => new URL(r.url).pathname.slice(1));
    },
  });

  return {
    isDesktop: false,
    async getPageImageUrl(page: number) {
      return resolvePageUrl(page, options?.mushafBaseUrl);
    },
    async cacheGet(bucket: string, key: string) {
      const cache = await openCache(CACHE_NAME);
      if (!cache) return null;
      const res = await cache.match(cacheUrl(bucket, key));
      return res ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    async cachePut(bucket: string, key: string, bytes: Uint8Array) {
      const cache = await openCache(CACHE_NAME);
      if (!cache) return;
      const copy = new Uint8Array(bytes);
      await cache.put(
        cacheUrl(bucket, key),
        new Response(copy, { headers: { "content-length": String(copy.byteLength) } }),
      );
    },
    async cacheHas(bucket: string, key: string) {
      const cache = await openCache(CACHE_NAME);
      if (!cache) return false;
      const res = await cache.match(cacheUrl(bucket, key));
      return res !== undefined;
    },
    async cacheDelete(bucket: string, key: string) {
      const cache = await openCache(CACHE_NAME);
      if (!cache) return;
      await cache.delete(cacheUrl(bucket, key));
    },
    async kvGet(key: string) {
      try {
        return await idbGet(key);
      } catch {
        try {
          return typeof localStorage !== "undefined" && typeof localStorage.getItem === "function"
            ? localStorage.getItem(key)
            : null;
        } catch {
          return null;
        }
      }
    },
    async kvSet(key: string, value: string) {
      try {
        await idbSet(key, value);
      } catch {
        try {
          if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
            localStorage.setItem(key, value);
          }
        } catch {
          // Ignore storage quota/security errors in restricted contexts.
        }
      }
    },
    createTilawaStorage,
  };
}
