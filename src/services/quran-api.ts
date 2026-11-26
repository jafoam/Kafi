import type { PlatformAdapter } from "../platform/types";
import { sanitizeHtml } from "./sanitize";

export interface ContentResult {
  html: string;
  fromCache: boolean;
}

export interface AudioResult {
  url: string;
  fromCache: boolean;
}

export interface QuranApi {
  getTranslation(
    translationId: number,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<ContentResult>;
  getTafsir(
    tafsirId: string,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<ContentResult>;
  getAudioBlobUrl(
    reciterFolder: string,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<AudioResult>;
  downloadSurahAudio(
    reciterFolder: string,
    surah: number,
    ayahCount: number,
    onProgress: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  dispose(): void;
}

interface CachedHtmlEntry {
  html: string;
}

interface CachedSurahTafsirEntry {
  ayahs: Record<string, string>;
}

const MAX_BLOB_URLS = 24;
const DOWNLOAD_CONCURRENCY = 3;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function safeCacheKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._:-]/g, "_");
}

function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function decodeJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}

function formatParagraphsToSafeHtml(text: string): string {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((part) => sanitizeHtml(part).trim())
    .filter((part) => part.length > 0);

  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

export function buildEveryAyahUrl(
  reciterFolder: string,
  surah: number,
  ayah: number,
): string {
  return `https://everyayah.com/data/${reciterFolder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

export function createQuranApi(
  platform: PlatformAdapter,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): QuranApi {
  const blobUrls = new Map<string, string>();

  function rememberBlobUrl(key: string, url: string): void {
    if (blobUrls.has(key)) {
      blobUrls.delete(key);
    }
    blobUrls.set(key, url);

    while (blobUrls.size > MAX_BLOB_URLS) {
      const oldestKey = blobUrls.keys().next().value;
      if (oldestKey === undefined) break;
      const oldestUrl = blobUrls.get(oldestKey);
      blobUrls.delete(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    }
  }

  async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const res = await fetcher(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return (await res.json()) as T;
  }

  async function getTranslation(
    translationId: number,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<ContentResult> {
    const key = safeCacheKey(`${translationId}_${surah}_${ayah}`);
    const cached = await platform.cacheGet("translation", key);
    if (cached) {
      const parsed = decodeJson<CachedHtmlEntry>(cached);
      if (parsed && typeof parsed.html === "string") {
        return { html: parsed.html, fromCache: true };
      }
    }

    const url = `https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?translations=${translationId}`;
    const data = await fetchJson<{
      verse?: { translations?: Array<{ text?: string }> };
    }>(url, signal);

    const rawText = data.verse?.translations?.[0]?.text ?? "";
    const html = sanitizeHtml(rawText);
    if (html.length > 0) {
      await platform.cachePut("translation", key, encodeJson({ html }));
    }
    return { html, fromCache: false };
  }

  async function getEquranTafsir(
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<ContentResult> {
    const key = safeCacheKey(`equran-id_${surah}`);
    const cached = await platform.cacheGet("tafsir", key);
    if (cached) {
      const parsed = decodeJson<CachedSurahTafsirEntry>(cached);
      if (parsed && parsed.ayahs) {
        return { html: parsed.ayahs[String(ayah)] ?? "", fromCache: true };
      }
    }

    const url = `https://equran.id/api/v2/tafsir/${surah}`;
    const data = await fetchJson<{
      code?: number;
      data?: { tafsir?: Array<{ ayat: number | string; teks?: string }> };
    }>(url, signal);

    if (data.code !== undefined && data.code !== 200) {
      throw new Error(`equran.id returned code ${data.code} for surah ${surah}`);
    }

    const ayahs: Record<string, string> = {};
    for (const item of data.data?.tafsir ?? []) {
      const num = Number(item.ayat);
      if (Number.isFinite(num) && num > 0) {
        ayahs[String(num)] = formatParagraphsToSafeHtml(item.teks ?? "");
      }
    }

    if (Object.keys(ayahs).length > 0) {
      await platform.cachePut("tafsir", key, encodeJson({ ayahs }));
    }
    return { html: ayahs[String(ayah)] ?? "", fromCache: false };
  }

  async function getTafsir(
    tafsirId: string,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<ContentResult> {
    if (tafsirId === "equran-id") {
      return getEquranTafsir(surah, ayah, signal);
    }

    const key = safeCacheKey(`${tafsirId}_${surah}_${ayah}`);
    const cached = await platform.cacheGet("tafsir", key);
    if (cached) {
      const parsed = decodeJson<CachedHtmlEntry>(cached);
      if (parsed && typeof parsed.html === "string") {
        return { html: parsed.html, fromCache: true };
      }
    }

    const url = `https://api.quran.com/api/v4/tafsirs/${encodeURIComponent(tafsirId)}/by_ayah/${surah}:${ayah}`;
    const data = await fetchJson<{ tafsir?: { text?: string } }>(url, signal);
    const html = sanitizeHtml(data.tafsir?.text ?? "");
    if (html.length > 0) {
      await platform.cachePut("tafsir", key, encodeJson({ html }));
    }
    return { html, fromCache: false };
  }

  async function fetchAudioBytes(
    reciterFolder: string,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const url = buildEveryAyahUrl(reciterFolder, surah, ayah);
    const res = await fetcher(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async function getAudioBlobUrl(
    reciterFolder: string,
    surah: number,
    ayah: number,
    signal?: AbortSignal,
  ): Promise<AudioResult> {
    const key = safeCacheKey(`${reciterFolder}_${pad3(surah)}${pad3(ayah)}`);

    const existingUrl = blobUrls.get(key);
    if (existingUrl) {
      rememberBlobUrl(key, existingUrl);
      return { url: existingUrl, fromCache: true };
    }

    const cached = await platform.cacheGet("audio", key);
    if (cached) {
      const blob = new Blob([new Uint8Array(cached)], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      rememberBlobUrl(key, url);
      return { url, fromCache: true };
    }

    const bytes = await fetchAudioBytes(reciterFolder, surah, ayah, signal);
    await platform.cachePut("audio", key, bytes);
    const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    rememberBlobUrl(key, url);
    return { url, fromCache: false };
  }

  async function downloadSurahAudio(
    reciterFolder: string,
    surah: number,
    ayahCount: number,
    onProgress: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (ayahCount <= 0) return;

    let nextAyah = 1;
    let done = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("Aborted", "AbortError");
        }
        const ayah = nextAyah++;
        if (ayah > ayahCount) return;

        const key = safeCacheKey(`${reciterFolder}_${pad3(surah)}${pad3(ayah)}`);
        const alreadyCached = await platform.cacheHas("audio", key);
        if (!alreadyCached) {
          const bytes = await fetchAudioBytes(reciterFolder, surah, ayah, signal);
          await platform.cachePut("audio", key, bytes);
        }

        done += 1;
        onProgress(done, ayahCount);
      }
    };

    const workerCount = Math.min(DOWNLOAD_CONCURRENCY, ayahCount);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  function dispose(): void {
    for (const url of blobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    blobUrls.clear();
  }

  return {
    getTranslation,
    getTafsir,
    getAudioBlobUrl,
    downloadSurahAudio,
    dispose,
  };
}
