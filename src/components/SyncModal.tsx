import { useEffect, useRef, useState } from "react";
import type { SyncConfig, UserData } from "../data/types";
import { useI18n } from "../i18n";
import { parseBackup, type BackupSummary } from "../services/backup";
import {
  DEFAULT_SYNC_WORKER_URL,
  generateSyncCode,
  normalizeSyncCode,
} from "../services/sync-service";

export interface SyncModalProps {
  open: boolean;
  config: SyncConfig | null;
  syncing: boolean;
  error: string | null;
  onClose: () => void;
  onConnect: (code: string, workerUrl: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onDisconnect: () => void;
  onExportBackup: () => Promise<void>;
  /** Merges a parsed backup into this device's data. */
  onImportBackup: (data: UserData) => Promise<void>;
}

function formatSyncTime(iso: string | undefined, lang: "id" | "en" = "id"): string {
  if (!iso) return lang === "en" ? "Never" : "Belum pernah";
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SyncModal({
  open,
  config,
  syncing,
  error,
  onClose,
  onConnect,
  onSyncNow,
  onDisconnect,
  onExportBackup,
  onImportBackup,
}: SyncModalProps) {
  const { lang, tr } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ data: UserData; summary: BackupSummary } | null>(
    null,
  );
  const [backupBusy, setBackupBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [workerUrl, setWorkerUrl] = useState(config?.workerUrl || DEFAULT_SYNC_WORKER_URL);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<"create" | "join" | null>(null);

  useEffect(() => {
    if (!open) return;
    setWorkerUrl(config?.workerUrl || DEFAULT_SYNC_WORKER_URL);
    setCodeInput(config?.code ?? "");
    setLocalError(null);
    setCopied(false);
    setPendingImport(null);
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !syncing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, syncing, onClose]);

  if (!open) return null;

  const displayError = localError ?? error;

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setLocalError(tr("Gagal menyalin kode ke clipboard.", "Failed to copy code to clipboard."));
    }
  };

  const handleCreateNew = async () => {
    setPending("create");
    setLocalError(null);
    const trimmedUrl = workerUrl.trim();
    if (!trimmedUrl) {
      setLocalError(tr("Isi URL Cloudflare Worker terlebih dahulu.", "Enter the Cloudflare Worker URL first."));
      return;
    }
    const freshCode = generateSyncCode();
    setCodeInput(freshCode);
    await onConnect(freshCode, trimmedUrl);
  };

  const handleJoin = async () => {
    setPending("join");
    setLocalError(null);
    const normalized = normalizeSyncCode(codeInput);
    if (!normalized) {
      setLocalError(
        tr(
          "Kode sync minimal 8 karakter (contoh: KAFI-7X4K-9M2P-Q3R8).",
          "Sync code must be at least 8 characters (e.g. KAFI-7X4K-9M2P-Q3R8).",
        ),
      );
      return;
    }
    const trimmedUrl = workerUrl.trim();
    if (!trimmedUrl) {
      setLocalError(tr("Isi URL Cloudflare Worker terlebih dahulu.", "Enter the Cloudflare Worker URL first."));
      return;
    }
    await onConnect(normalized, trimmedUrl);
  };

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Sinkronisasi Antar Perangkat", "Cross-Device Sync")}
      onClick={() => {
        if (!syncing) onClose();
      }}
    >
      <div className="tasmi-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">{tr("Sync Antar Perangkat", "Cross-Device Sync")}</h2>
            <p className="tasmi-sheet__subtitle">
              {tr(
                "Tanpa login · Terenkripsi end-to-end (AES-GCM) di perangkat",
                "No account needed · End-to-end encrypted (AES-GCM) on device",
              )}
            </p>
          </div>
          <button
            type="button"
            className="ayah-popover__close"
            aria-label={tr("Tutup", "Close")}
            disabled={syncing}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tasmi-sheet__body">
          <div className="tasmi-sheet__free-box">
            <p>
              {tr(
                "Bookmark, sorotan, catatan, riwayat Tasmi', dan jadwal Muraja'ah dienkripsi memakai kode sync sebelum dikirim. Masukkan kode yang sama di perangkat lain untuk saling sinkron kapan saja.",
                "Bookmarks, highlights, notes, Tasmi' history, and Muraja'ah schedules are encrypted with your sync code before uploading. Enter the same code on another device to keep them in sync.",
              )}
            </p>
          </div>

          {config ? (
            <>
              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">{tr("Kode Sync Aktif", "Active Sync Code")}</span>
                <div className="sync-code-box">
                  <span>{config.code}</span>
                  <button
                    type="button"
                    className="tasmi-sheet__history-btn"
                    onClick={() => void handleCopy(config.code)}
                  >
                    {copied ? tr("Tersalin", "Copied") : tr("Salin", "Copy")}
                  </button>
                </div>
                <span className="tasmi-sheet__option-scope">
                  {tr("Terakhir sinkron:", "Last synced:")} {formatSyncTime(config.lastSyncedAt, lang)}
                </span>
              </div>

              <div className="sync-actions-row">
                <button
                  type="button"
                  className="tasmi-sheet__start-btn"
                  disabled={syncing}
                  onClick={() => void onSyncNow()}
                >
                  {syncing ? tr("Menyinkronkan…", "Syncing…") : tr("Sinkronkan Sekarang", "Sync Now")}
                </button>
                <button
                  type="button"
                  className="sync-secondary-btn"
                  disabled={syncing}
                  onClick={onDisconnect}
                >
                  {tr("Putuskan Sync", "Disconnect")}
                </button>
              </div>
            </>
          ) : (
            <>
              {!DEFAULT_SYNC_WORKER_URL && (
                <details className="sync-advanced" open={!workerUrl.trim()}>
                  <summary>{tr("Server sync sendiri (lanjutan)", "Custom sync server (advanced)")}</summary>
                  <label className="tasmi-sheet__field">
                    <span>{tr("URL Cloudflare Worker Sync", "Cloudflare Worker Sync URL")}</span>
                    <input
                      type="url"
                      placeholder="https://kafi-sync.example.workers.dev"
                      value={workerUrl}
                      disabled={syncing}
                      onChange={(e) => setWorkerUrl(e.target.value)}
                    />
                  </label>
                </details>
              )}

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">{tr("Baru pertama kali?", "First time?")}</span>
                <button
                  type="button"
                  className="tasmi-sheet__start-btn"
                  disabled={syncing}
                  onClick={() => void handleCreateNew()}
                >
                  {syncing && pending === "create"
                    ? tr("Membuat kode…", "Creating code…")
                    : tr("Buat Kode Baru", "Create New Code")}
                </button>
                <span className="tasmi-sheet__option-scope">
                  {tr("Lalu masukkan kode itu di perangkat lainmu.", "Then enter that code on your other device.")}
                </span>
              </div>

              <div className="sync-divider" role="separator">
                <span>{tr("atau", "or")}</span>
              </div>

              <div className="tasmi-sheet__section">
                <label className="tasmi-sheet__field">
                  <span>{tr("Punya kode dari perangkat lain?", "Have a code from another device?")}</span>
                  <input
                    type="text"
                    placeholder="KAFI-XXXX-XXXX-XXXX"
                    value={codeInput}
                    disabled={syncing}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  />
                </label>
                <button
                  type="button"
                  className="sync-join-btn"
                  disabled={syncing || codeInput.trim().length < 8}
                  onClick={() => void handleJoin()}
                >
                  {syncing && pending === "join"
                    ? tr("Menghubungkan…", "Connecting…")
                    : tr("Sambungkan Kode", "Connect Code")}
                </button>
              </div>
            </>
          )}

          <div className="sync-divider" role="separator">
            <span>{tr("Cadangan manual", "Manual backup")}</span>
          </div>

          {pendingImport ? (
            <div className="sync-import-confirm" role="alert">
              <p>
                {tr(
                  `File berisi ${pendingImport.summary.bookmarks} bookmark, ${pendingImport.summary.highlights} sorotan, ${pendingImport.summary.notes} catatan, dan ${pendingImport.summary.tasmi} riwayat Tasmi'. Isinya digabung dengan data di perangkat ini; tidak ada yang dihapus.`,
                  `File contains ${pendingImport.summary.bookmarks} bookmarks, ${pendingImport.summary.highlights} highlights, ${pendingImport.summary.notes} notes, and ${pendingImport.summary.tasmi} Tasmi' records. It will be merged with this device's data without deleting anything.`,
                )}
              </p>
              <div className="sync-actions-row">
                <button
                  type="button"
                  className="tasmi-sheet__start-btn"
                  disabled={backupBusy}
                  onClick={async () => {
                    setBackupBusy(true);
                    try {
                      await onImportBackup(pendingImport.data);
                      setPendingImport(null);
                    } catch {
                      setLocalError(tr("Gagal menggabungkan cadangan.", "Failed to merge backup."));
                    } finally {
                      setBackupBusy(false);
                    }
                  }}
                >
                  {tr("Gabungkan", "Merge")}
                </button>
                <button
                  type="button"
                  className="sync-secondary-btn"
                  disabled={backupBusy}
                  onClick={() => setPendingImport(null)}
                >
                  {tr("Batal", "Cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="sync-actions-row">
              <button
                type="button"
                className="sync-secondary-btn"
                disabled={backupBusy}
                onClick={async () => {
                  setBackupBusy(true);
                  setLocalError(null);
                  try {
                    await onExportBackup();
                  } catch {
                    setLocalError(tr("Gagal membuat file cadangan.", "Failed to create backup file."));
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                {tr("Ekspor JSON", "Export JSON")}
              </button>
              <button
                type="button"
                className="sync-secondary-btn"
                disabled={backupBusy}
                onClick={() => fileRef.current?.click()}
              >
                {tr("Impor JSON", "Import JSON")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setLocalError(null);
                  try {
                    setPendingImport(parseBackup(await file.text()));
                  } catch (err) {
                    setLocalError(
                      err instanceof Error
                        ? err.message
                        : tr("File cadangan tidak bisa dibaca.", "Backup file could not be read."),
                    );
                  }
                }}
              />
            </div>
          )}
          <span className="tasmi-sheet__option-scope">
            {tr(
              "File cadangan tidak dienkripsi dan tidak memuat kode sync. Simpan di tempat yang aman.",
              "Backup files are unencrypted and do not contain your sync code. Store them safely.",
            )}
          </span>

          {displayError && (
            <div className="tasmi-sheet__error" role="alert">
              {displayError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
