import { useEffect, useRef, useState } from "react";
import type { SyncConfig, UserData } from "../data/types";
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

function formatSyncTime(iso?: string): string {
  if (!iso) return "Belum pernah";
  try {
    return new Intl.DateTimeFormat("id-ID", {
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
      setLocalError("Gagal menyalin kode ke clipboard.");
    }
  };

  const handleCreateNew = async () => {
    setPending("create");
    setLocalError(null);
    const trimmedUrl = workerUrl.trim();
    if (!trimmedUrl) {
      setLocalError("Isi URL Cloudflare Worker terlebih dahulu.");
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
      setLocalError("Kode sync minimal 8 karakter (contoh: KAFI-7X4K-9M2P-Q3R8).");
      return;
    }
    const trimmedUrl = workerUrl.trim();
    if (!trimmedUrl) {
      setLocalError("Isi URL Cloudflare Worker terlebih dahulu.");
      return;
    }
    await onConnect(normalized, trimmedUrl);
  };

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Sinkronisasi Antar Perangkat"
      onClick={() => {
        if (!syncing) onClose();
      }}
    >
      <div className="tasmi-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">Sync Antar Perangkat</h2>
            <p className="tasmi-sheet__subtitle">
              Tanpa login · Terenkripsi end-to-end (AES-GCM) di perangkat
            </p>
          </div>
          <button
            type="button"
            className="ayah-popover__close"
            aria-label="Tutup"
            disabled={syncing}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tasmi-sheet__body">
          <div className="tasmi-sheet__free-box">
            <p>
              Bookmark, sorotan, catatan, riwayat Tasmi&apos;, dan jadwal Muraja&apos;ah dienkripsi
              memakai kode sync sebelum dikirim. Masukkan kode yang sama di perangkat lain untuk
              saling sinkron kapan saja.
            </p>
          </div>

          {config ? (
            <>
              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">Kode Sync Aktif</span>
                <div className="sync-code-box">
                  <span>{config.code}</span>
                  <button
                    type="button"
                    className="tasmi-sheet__history-btn"
                    onClick={() => void handleCopy(config.code)}
                  >
                    {copied ? "Tersalin" : "Salin"}
                  </button>
                </div>
                <span className="tasmi-sheet__option-scope">
                  Terakhir sinkron: {formatSyncTime(config.lastSyncedAt)}
                </span>
              </div>

              <div className="sync-actions-row">
                <button
                  type="button"
                  className="tasmi-sheet__start-btn"
                  disabled={syncing}
                  onClick={() => void onSyncNow()}
                >
                  {syncing ? "Menyinkronkan…" : "Sinkronkan Sekarang"}
                </button>
                <button
                  type="button"
                  className="sync-secondary-btn"
                  disabled={syncing}
                  onClick={onDisconnect}
                >
                  Putuskan Sync
                </button>
              </div>
            </>
          ) : (
            <>
              {!DEFAULT_SYNC_WORKER_URL && (
                <details className="sync-advanced" open={!workerUrl.trim()}>
                  <summary>Server sync sendiri (lanjutan)</summary>
                  <label className="tasmi-sheet__field">
                    <span>URL Cloudflare Worker Sync</span>
                    <input
                      type="url"
                      placeholder="https://kafi-sync.akunmu.workers.dev"
                      value={workerUrl}
                      disabled={syncing}
                      onChange={(e) => setWorkerUrl(e.target.value)}
                    />
                  </label>
                </details>
              )}

              <div className="tasmi-sheet__section">
                <span className="tasmi-sheet__label">Baru pertama kali?</span>
                <button
                  type="button"
                  className="tasmi-sheet__start-btn"
                  disabled={syncing}
                  onClick={() => void handleCreateNew()}
                >
                  {syncing && pending === "create" ? "Membuat kode…" : "Buat Kode Baru"}
                </button>
                <span className="tasmi-sheet__option-scope">
                  Lalu masukkan kode itu di perangkat lainmu.
                </span>
              </div>

              <div className="sync-divider" role="separator">
                <span>atau</span>
              </div>

              <div className="tasmi-sheet__section">
                <label className="tasmi-sheet__field">
                  <span>Punya kode dari perangkat lain?</span>
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
                  {syncing && pending === "join" ? "Menghubungkan…" : "Sambungkan Kode"}
                </button>
              </div>
            </>
          )}

          <div className="sync-divider" role="separator">
            <span>Cadangan manual</span>
          </div>

          {pendingImport ? (
            <div className="sync-import-confirm" role="alert">
              <p>
                File berisi {pendingImport.summary.bookmarks} bookmark, {pendingImport.summary.highlights}{" "}
                sorotan, {pendingImport.summary.notes} catatan, dan {pendingImport.summary.tasmi} riwayat
                Tasmi&apos;. Isinya digabung dengan data di perangkat ini; tidak ada yang dihapus.
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
                      setLocalError("Gagal menggabungkan cadangan.");
                    } finally {
                      setBackupBusy(false);
                    }
                  }}
                >
                  Gabungkan
                </button>
                <button
                  type="button"
                  className="sync-secondary-btn"
                  disabled={backupBusy}
                  onClick={() => setPendingImport(null)}
                >
                  Batal
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
                    setLocalError("Gagal membuat file cadangan.");
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                Ekspor JSON
              </button>
              <button
                type="button"
                className="sync-secondary-btn"
                disabled={backupBusy}
                onClick={() => fileRef.current?.click()}
              >
                Impor JSON
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
                    setLocalError(err instanceof Error ? err.message : "File cadangan tidak bisa dibaca.");
                  }
                }}
              />
            </div>
          )}
          <span className="tasmi-sheet__option-scope">
            File cadangan tidak dienkripsi dan tidak memuat kode sync. Simpan di tempat yang aman.
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
