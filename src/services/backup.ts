import type { UserData } from "../data/types";
import { mergeUserData } from "./sync-service";
import { normalizeUserData } from "./user-store";

/** Backup files above this size are refused before parsing. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

interface BackupFile {
  app: "kafi";
  version: 1;
  exportedAt: string;
  data: UserData;
}

export interface BackupSummary {
  bookmarks: number;
  highlights: number;
  notes: number;
  tasmi: number;
  exportedAt: string | null;
}

/**
 * The user's own data as a readable JSON file. The sync code is not part of UserData, so it never
 * ends up in a backup.
 */
export function buildBackup(data: UserData, now = new Date()): string {
  const file: BackupFile = { app: "kafi", version: 1, exportedAt: now.toISOString(), data };
  return JSON.stringify(file, null, 2);
}

export function backupFileName(now = new Date()): string {
  return `kafi-cadangan-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Reads a backup and returns clean UserData. Every field goes through the same normalisation as
 * data loaded from storage, so unknown keys, wrong types and malformed entries are dropped.
 */
export function parseBackup(text: string): { data: UserData; summary: BackupSummary } {
  if (text.length > MAX_BACKUP_BYTES) throw new Error("File terlalu besar untuk cadangan Kafi.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File bukan JSON yang valid.");
  }
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const payload = obj && obj.app === "kafi" && "data" in obj ? obj.data : obj;
  const looksLikeKafi =
    typeof payload === "object" &&
    payload !== null &&
    ("bookmarks" in payload || "settings" in payload || "tasmiHistory" in payload);
  if (!looksLikeKafi) throw new Error("File ini bukan cadangan Kafi.");

  const data = normalizeUserData(payload);
  return {
    data,
    summary: {
      bookmarks: data.bookmarks.length,
      highlights: Object.keys(data.highlights).length,
      notes: Object.keys(data.notes).length,
      tasmi: data.tasmiHistory.length,
      exportedAt: obj && typeof obj.exportedAt === "string" ? obj.exportedAt : null,
    },
  };
}

/** Adds a backup to what is on this device; nothing already here is removed. */
export function mergeBackup(local: UserData, backup: UserData, now = new Date()): UserData {
  return { ...mergeUserData(local, backup), updatedAt: now.toISOString() };
}

/** Hands the file to the system share sheet where that works (phones), else downloads it. */
export async function saveBackupFile(text: string, name: string): Promise<"shared" | "downloaded"> {
  const blob = new Blob([text], { type: "application/json" });
  const file = typeof File !== "undefined" ? new File([blob], name, { type: "application/json" }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Cadangan Kafi" });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
