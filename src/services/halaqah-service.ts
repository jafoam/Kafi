import type { HalaqahMembership, TasmiSessionKind, TasmiSessionRecord } from "../data/types";
import { DEFAULT_SYNC_WORKER_URL } from "./sync-service";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PBKDF2_SALT = new TextEncoder().encode("kafi-halaqah-e2e-v1");
const PBKDF2_ITERATIONS = 100_000;
const MAX_REPORTS_PER_MEMBER = 50;

export interface HalaqahMeta {
  name: string;
  target: string;
  createdAt: string;
  locked?: boolean;
}

export interface HalaqahReport {
  id: string;
  surah: number;
  fromAyah: number;
  toAyah: number;
  mistakes: number;
  durationSec: number;
  recitedAyahs?: number;
  kind?: TasmiSessionKind;
  reportedAt: string;
}

export interface HalaqahMemberData {
  displayName: string;
  joinedAt: string;
  reports: HalaqahReport[];
}

export interface HalaqahMemberEntry {
  memberId: string;
  data: HalaqahMemberData;
  updatedAt: string;
}

export interface HalaqahSnapshot {
  meta: HalaqahMeta;
  members: HalaqahMemberEntry[];
}

interface EncryptedEnvelope {
  v: 1;
  iv: string;
  ct: string;
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

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Generates a human-friendly 8-character group code (e.g. HLQ-7X4K-9M2P). */
export function generateHalaqahCode(): string {
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `HLQ-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

/** Normalizes user-entered group codes or invite URLs; returns null if invalid. */
export function normalizeHalaqahCode(raw: string): string | null {
  const trimmed = raw.trim();
  // Support pasting a full invite URL such as https://kafi.zudd.in/?halaqah=HLQ-XXXX-XXXX
  if (trimmed.includes("halaqah=")) {
    try {
      const url = new URL(trimmed);
      const param = url.searchParams.get("halaqah");
      if (param) return normalizeHalaqahCode(param);
    } catch {
      const match = trimmed.match(/halaqah=([A-Za-z0-9-]+)/);
      if (match) return normalizeHalaqahCode(match[1]);
    }
  }
  const cleaned = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = cleaned.startsWith("HLQ") ? cleaned.slice(3) : cleaned;
  if (body.length < 8) return null;
  const groups = body.match(/.{1,4}/g) ?? [body];
  return `HLQ-${groups.join("-")}`;
}

export function buildHalaqahInviteUrl(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://kafi.zudd.in");
  return `${base.replace(/\/+$/, "")}/?halaqah=${encodeURIComponent(code)}`;
}

export function parseHalaqahInviteFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("halaqah");
    return raw ? normalizeHalaqahCode(raw) : null;
  } catch {
    return null;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export async function deriveHalaqahKeys(
  rawCode: string,
): Promise<{ groupId: string; aesKey: CryptoKey; normalizedCode: string }> {
  const normalizedCode = normalizeHalaqahCode(rawCode);
  if (!normalizedCode) {
    throw new Error("Kode halaqah minimal 8 karakter (contoh: HLQ-7X4K-9M2P).");
  }
  const encoder = new TextEncoder();
  const groupId = await sha256Hex(`kafi-halaqah-id-v1:${normalizedCode}`);

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

  return { groupId, aesKey, normalizedCode };
}

async function encryptPayload<T>(payload: T, aesKey: CryptoKey): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);
  return {
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString(),
  };
}

async function decryptPayload<T>(blob: EncryptedEnvelope, aesKey: CryptoKey): Promise<T> {
  if (!blob || blob.v !== 1 || typeof blob.iv !== "string" || typeof blob.ct !== "string") {
    throw new Error("Format data halaqah tidak valid.");
  }
  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ct);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

export function buildReportFromTasmi(record: TasmiSessionRecord): HalaqahReport {
  return {
    id: record.id,
    surah: record.surah,
    fromAyah: record.fromAyah,
    toAyah: record.toAyah,
    mistakes: record.mistakes.length,
    durationSec: record.durationSec,
    recitedAyahs: record.recitedAyahs,
    kind: record.kind,
    reportedAt: new Date().toISOString(),
  };
}

export const DEFAULT_HALAQAH_WORKER_URL: string =
  (import.meta.env?.VITE_SYNC_URL as string | undefined)?.trim() ||
  (import.meta.env?.DEV && typeof window !== "undefined" ? window.location.origin : DEFAULT_SYNC_WORKER_URL);

function resolveBaseUrl(workerUrl?: string): string {
  const url = (workerUrl?.trim() || DEFAULT_HALAQAH_WORKER_URL).replace(/\/+$/, "");
  if (!url) throw new Error("URL server halaqah belum dikonfigurasi.");
  return url;
}

export async function createHalaqah(params: {
  name: string;
  displayName: string;
  target?: string;
  workerUrl?: string;
  fetcher?: typeof fetch;
}): Promise<{ membership: HalaqahMembership; snapshot: HalaqahSnapshot }> {
  const name = params.name.trim();
  const displayName = params.displayName.trim();
  if (!name) throw new Error("Nama halaqah tidak boleh kosong.");
  if (!displayName) throw new Error("Nama tampilan tidak boleh kosong.");

  const baseUrl = resolveBaseUrl(params.workerUrl);
  const fetcher = params.fetcher ?? globalThis.fetch.bind(globalThis);
  const code = generateHalaqahCode();
  const { groupId, aesKey } = await deriveHalaqahKeys(code);

  const memberId = randomHex(16);
  const memberSecret = randomHex(24);
  const adminSecret = randomHex(24);
  const [secretHash, adminHash] = await Promise.all([
    sha256Hex(memberSecret),
    sha256Hex(adminSecret),
  ]);

  const nowIso = new Date().toISOString();
  const meta: HalaqahMeta = {
    name,
    target: params.target?.trim() ?? "",
    createdAt: nowIso,
    locked: false,
  };
  const memberData: HalaqahMemberData = {
    displayName,
    joinedAt: nowIso,
    reports: [],
  };

  const [metaBlob, memberBlob] = await Promise.all([
    encryptPayload(meta, aesKey),
    encryptPayload(memberData, aesKey),
  ]);

  const metaRes = await fetcher(`${baseUrl}/v1/halaqah/${groupId}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...metaBlob, adminHash, locked: false }),
  });
  if (!metaRes.ok) {
    throw new Error(`Gagal membuat halaqah (HTTP ${metaRes.status}).`);
  }

  const memberRes = await fetcher(`${baseUrl}/v1/halaqah/${groupId}/member/${memberId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...memberBlob, secretHash }),
  });
  if (!memberRes.ok) {
    throw new Error(`Gagal mendaftarkan anggota awal (HTTP ${memberRes.status}).`);
  }

  const membership: HalaqahMembership = {
    code,
    name,
    displayName,
    memberId,
    memberSecret,
    adminSecret,
    workerUrl: baseUrl,
    joinedAt: nowIso,
  };

  return {
    membership,
    snapshot: {
      meta,
      members: [{ memberId, data: memberData, updatedAt: memberBlob.updatedAt }],
    },
  };
}

export async function fetchHalaqahSnapshot(
  membership: Pick<HalaqahMembership, "code" | "workerUrl">,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<HalaqahSnapshot> {
  const baseUrl = resolveBaseUrl(membership.workerUrl);
  const { groupId, aesKey } = await deriveHalaqahKeys(membership.code);

  const res = await fetcher(`${baseUrl}/v1/halaqah/${groupId}`, { method: "GET" });
  if (res.status === 404) {
    throw new Error("Halaqah tidak ditemukan. Periksa kembali kode undangan.");
  }
  if (!res.ok) {
    throw new Error(`Gagal memuat halaqah (HTTP ${res.status}).`);
  }

  const body = (await res.json()) as {
    meta: EncryptedEnvelope & { locked?: boolean };
    members: Array<EncryptedEnvelope & { memberId: string }>;
  };

  const meta = await decryptPayload<HalaqahMeta>(body.meta, aesKey);
  if (typeof body.meta.locked === "boolean") {
    meta.locked = body.meta.locked;
  }

  const members: HalaqahMemberEntry[] = [];
  for (const m of body.members ?? []) {
    try {
      const data = await decryptPayload<HalaqahMemberData>(m, aesKey);
      members.push({ memberId: m.memberId, data, updatedAt: m.updatedAt });
    } catch {
      // Skip unreadable/corrupt member blobs without breaking the whole group view.
    }
  }

  // Sort members: most recent report first, then joinedAt.
  members.sort((a, b) => {
    const aLast = Date.parse(a.data.reports[0]?.reportedAt ?? a.data.joinedAt) || 0;
    const bLast = Date.parse(b.data.reports[0]?.reportedAt ?? b.data.joinedAt) || 0;
    return bLast - aLast;
  });

  return { meta, members };
}

export async function joinHalaqah(params: {
  code: string;
  displayName: string;
  workerUrl?: string;
  fetcher?: typeof fetch;
}): Promise<{ membership: HalaqahMembership; snapshot: HalaqahSnapshot }> {
  const displayName = params.displayName.trim();
  if (!displayName) throw new Error("Nama tampilan tidak boleh kosong.");
  const baseUrl = resolveBaseUrl(params.workerUrl);
  const fetcher = params.fetcher ?? globalThis.fetch.bind(globalThis);
  const { groupId, aesKey, normalizedCode } = await deriveHalaqahKeys(params.code);

  // Verify the group exists and can be decrypted with this code.
  const initialSnapshot = await fetchHalaqahSnapshot(
    { code: normalizedCode, workerUrl: baseUrl },
    fetcher,
  );

  const memberId = randomHex(16);
  const memberSecret = randomHex(24);
  const secretHash = await sha256Hex(memberSecret);
  const nowIso = new Date().toISOString();
  const memberData: HalaqahMemberData = {
    displayName,
    joinedAt: nowIso,
    reports: [],
  };
  const memberBlob = await encryptPayload(memberData, aesKey);

  const res = await fetcher(`${baseUrl}/v1/halaqah/${groupId}/member/${memberId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...memberBlob, secretHash }),
  });
  if (res.status === 403) {
    throw new Error("Halaqah sedang dikunci oleh pembina atau sudah penuh.");
  }
  if (!res.ok) {
    throw new Error(`Gagal bergabung ke halaqah (HTTP ${res.status}).`);
  }

  const membership: HalaqahMembership = {
    code: normalizedCode,
    name: initialSnapshot.meta.name,
    displayName,
    memberId,
    memberSecret,
    workerUrl: baseUrl,
    joinedAt: nowIso,
  };

  return {
    membership,
    snapshot: {
      meta: initialSnapshot.meta,
      members: [
        { memberId, data: memberData, updatedAt: memberBlob.updatedAt },
        ...initialSnapshot.members,
      ],
    },
  };
}

export async function submitHalaqahReport(params: {
  membership: HalaqahMembership;
  report: HalaqahReport;
  existingReports?: readonly HalaqahReport[];
  fetcher?: typeof fetch;
}): Promise<HalaqahReport[]> {
  const fetcher = params.fetcher ?? globalThis.fetch.bind(globalThis);
  const baseUrl = resolveBaseUrl(params.membership.workerUrl);
  const { groupId, aesKey } = await deriveHalaqahKeys(params.membership.code);
  const secretHash = await sha256Hex(params.membership.memberSecret);

  let currentReports = params.existingReports;
  if (!currentReports) {
    const snap = await fetchHalaqahSnapshot(params.membership, fetcher);
    const mine = snap.members.find((m) => m.memberId === params.membership.memberId);
    currentReports = mine?.data.reports ?? [];
  }

  const nextReports = [
    params.report,
    ...currentReports.filter((r) => r.id !== params.report.id),
  ].slice(0, MAX_REPORTS_PER_MEMBER);

  const memberData: HalaqahMemberData = {
    displayName: params.membership.displayName,
    joinedAt: params.membership.joinedAt,
    reports: nextReports,
  };
  const memberBlob = await encryptPayload(memberData, aesKey);

  const res = await fetcher(
    `${baseUrl}/v1/halaqah/${groupId}/member/${params.membership.memberId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...memberBlob, secretHash }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gagal mengirim setoran ke halaqah (HTTP ${res.status}).`);
  }
  return nextReports;
}

export async function updateHalaqahMeta(params: {
  membership: HalaqahMembership;
  meta: HalaqahMeta;
  fetcher?: typeof fetch;
}): Promise<void> {
  if (!params.membership.adminSecret) {
    throw new Error("Hanya pembuat halaqah yang dapat mengubah target atau kunci grup.");
  }
  const fetcher = params.fetcher ?? globalThis.fetch.bind(globalThis);
  const baseUrl = resolveBaseUrl(params.membership.workerUrl);
  const { groupId, aesKey } = await deriveHalaqahKeys(params.membership.code);
  const adminHash = await sha256Hex(params.membership.adminSecret);
  const metaBlob = await encryptPayload(params.meta, aesKey);

  const res = await fetcher(`${baseUrl}/v1/halaqah/${groupId}/meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...metaBlob, adminHash, locked: Boolean(params.meta.locked) }),
  });
  if (!res.ok) {
    throw new Error(`Gagal memperbarui info halaqah (HTTP ${res.status}).`);
  }
}

export async function leaveHalaqah(
  membership: HalaqahMembership,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const baseUrl = resolveBaseUrl(membership.workerUrl);
  const { groupId } = await deriveHalaqahKeys(membership.code);
  const secretHash = await sha256Hex(membership.memberSecret);

  const res = await fetcher(`${baseUrl}/v1/halaqah/${groupId}/member/${membership.memberId}`, {
    method: "DELETE",
    headers: { "X-Halaqah-Secret": secretHash },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Gagal keluar dari halaqah (HTTP ${res.status}).`);
  }
}
