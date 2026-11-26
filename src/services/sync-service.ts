import type { AyahKey, MurajaahCard, SyncConfig, TasmiSessionRecord, UserData } from "../data/types";

export const SYNC_CONFIG_KEY = "kafi:sync:config";
export const DEFAULT_SYNC_WORKER_URL: string =
  (import.meta.env?.VITE_SYNC_URL as string | undefined)?.trim() ?? "";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PBKDF2_SALT = new TextEncoder().encode("kafi-e2e-sync-v1");
const PBKDF2_ITERATIONS = 100_000;

export interface EncryptedVaultBlob {
  v: 1;
  iv: string;
  ct: string;
  updatedAt: string;
}

export interface SyncResult {
  merged: UserData;
  pulled: boolean;
  updatedAt: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generates a human-friendly 12-character E2E sync code (e.g. KAFI-7X4K-9M2P-Q3R8). */
export function generateSyncCode(): string {
  const random = new Uint8Array(12);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `KAFI-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Normalizes user-entered sync codes; returns null if too short to be safe. */
export function normalizeSyncCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = cleaned.startsWith("KAFI") ? cleaned.slice(4) : cleaned;
  if (body.length < 8) return null;
  const groups = body.match(/.{1,4}/g) ?? [body];
  return `KAFI-${groups.join("-")}`;
}

export async function deriveSyncKeys(
  rawCode: string,
): Promise<{ vaultId: string; aesKey: CryptoKey; normalizedCode: string }> {
  const normalizedCode = normalizeSyncCode(rawCode);
  if (!normalizedCode) {
    throw new Error("Kode sync terlalu pendek (minimal 8 karakter).");
  }
  const encoder = new TextEncoder();
  const idHash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`kafi-vault-id-v1:${normalizedCode}`),
  );
  const vaultId = toHex(new Uint8Array(idHash));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizedCode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: PBKDF2_SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return { vaultId, aesKey, normalizedCode };
}

export async function encryptUserData(
  data: UserData,
  aesKey: CryptoKey,
): Promise<EncryptedVaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);
  return {
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(encrypted)),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export async function decryptUserData(
  blob: EncryptedVaultBlob,
  aesKey: CryptoKey,
): Promise<UserData> {
  if (!blob || blob.v !== 1 || typeof blob.iv !== "string" || typeof blob.ct !== "string") {
    throw new Error("Format data sync tidak valid.");
  }
  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ct);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as UserData;
}

/** Lossless merge of two UserData snapshots across devices. */
export function mergeUserData(local: UserData, remote: UserData): UserData {
  const localTs = Date.parse(local.updatedAt ?? "") || 0;
  const remoteTs = Date.parse(remote.updatedAt ?? "") || 0;
  const remoteNewer = remoteTs > localTs;

  const bookmarks = Array.from(new Set<AyahKey>([...local.bookmarks, ...remote.bookmarks]));

  const highlights = remoteNewer
    ? { ...local.highlights, ...remote.highlights }
    : { ...remote.highlights, ...local.highlights };

  const notes = remoteNewer
    ? { ...local.notes, ...remote.notes }
    : { ...remote.notes, ...local.notes };

  const historyMap = new Map<string, TasmiSessionRecord>();
  for (const item of [...remote.tasmiHistory, ...local.tasmiHistory]) {
    if (!historyMap.has(item.id)) historyMap.set(item.id, item);
  }
  const tasmiHistory = Array.from(historyMap.values()).sort(
    (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0),
  );

  const cardMap = new Map<string, MurajaahCard>();
  for (const card of [...(remote.murajaahCards ?? []), ...(local.murajaahCards ?? [])]) {
    const prev = cardMap.get(card.id);
    if (!prev) {
      cardMap.set(card.id, card);
    } else {
      const prevTs = Date.parse(prev.lastReviewedAt) || 0;
      const curTs = Date.parse(card.lastReviewedAt) || 0;
      if (curTs > prevTs || (curTs === prevTs && card.reps > prev.reps)) {
        cardMap.set(card.id, card);
      }
    }
  }

  const recentPages = Array.from(
    new Set([...(remoteNewer ? remote.recentPages ?? [] : local.recentPages ?? []), ...(remoteNewer ? local.recentPages ?? [] : remote.recentPages ?? [])]),
  ).slice(0, 5);

  return {
    lastPage: remoteNewer ? remote.lastPage : local.lastPage,
    recentPages,
    bookmarks,
    highlights,
    notes,
    settings: remoteNewer ? { ...local.settings, ...remote.settings } : { ...remote.settings, ...local.settings },
    tasmiHistory,
    murajaahCards: Array.from(cardMap.values()),
    updatedAt: new Date(Math.max(localTs, remoteTs, Date.now())).toISOString(),
  };
}

export async function syncUserData(params: {
  code: string;
  workerUrl: string;
  localData: UserData;
  fetcher?: typeof fetch;
}): Promise<SyncResult> {
  const baseUrl = params.workerUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("URL Cloudflare Worker sync belum diisi.");
  }
  const fetcher = params.fetcher ?? globalThis.fetch.bind(globalThis);
  const { vaultId, aesKey } = await deriveSyncKeys(params.code);
  const endpoint = `${baseUrl}/v1/vault/${vaultId}`;

  let merged = params.localData;
  let pulled = false;

  const getRes = await fetcher(endpoint, { method: "GET" });
  if (getRes.ok) {
    const blob = (await getRes.json()) as EncryptedVaultBlob;
    const remote = await decryptUserData(blob, aesKey);
    merged = mergeUserData(params.localData, remote);
    pulled = true;
  } else if (getRes.status !== 404) {
    throw new Error(`Gagal mengambil data sync (HTTP ${getRes.status}).`);
  }

  const encrypted = await encryptUserData(merged, aesKey);
  const putRes = await fetcher(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(encrypted),
  });
  if (!putRes.ok) {
    throw new Error(`Gagal mengunggah data sync (HTTP ${putRes.status}).`);
  }

  return { merged, pulled, updatedAt: encrypted.updatedAt };
}

export function parseSyncConfig(raw: string | null): SyncConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    if (typeof parsed.code !== "string" || typeof parsed.workerUrl !== "string") return null;
    return {
      code: parsed.code,
      workerUrl: parsed.workerUrl,
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : undefined,
    };
  } catch {
    return null;
  }
}
