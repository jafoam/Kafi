import { useEffect, useState } from "react";
import type { SyncConfig } from "../data/types";
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
}: SyncModalProps) {
  const [codeInput, setCodeInput] = useState("");
  const [workerUrl, setWorkerUrl] = useState(config?.workerUrl || DEFAULT_SYNC_WORKER_URL);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWorkerUrl(config?.workerUrl || DEFAULT_SYNC_WORKER_URL);
    setCodeInput(config?.code ?? "");
    setLocalError(null);
    setCopied(false);
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
                  className="tasmi-sheet__cancel-btn"
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
                <div className="tasmi-sheet__section">
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
                </div>
              )}

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
                <div className="sync-actions-row">
                  <button
                    type="button"
                    className="tasmi-sheet__start-btn"
                    disabled={syncing || codeInput.trim().length < 8}
                    onClick={() => void handleJoin()}
                  >
                    {syncing ? "Menghubungkan…" : "Sambungkan Kode"}
                  </button>
                  <button
                    type="button"
                    className="tasmi-sheet__history-btn"
                    style={{ height: 40 }}
                    disabled={syncing}
                    onClick={() => void handleCreateNew()}
                  >
                    Buat Kode Baru
                  </button>
                </div>
              </div>
            </>
          )}

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
