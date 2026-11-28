import { useCallback, useEffect, useState } from "react";
import type { HalaqahMembership, SurahInfo } from "../data/types";
import {
  buildHalaqahInviteUrl,
  createHalaqah,
  DEFAULT_HALAQAH_WORKER_URL,
  fetchHalaqahSnapshot,
  joinHalaqah,
  leaveHalaqah,
  updateHalaqahMeta,
  type HalaqahSnapshot,
} from "../services/halaqah-service";

export interface HalaqahModalProps {
  open: boolean;
  halaqahs: HalaqahMembership[];
  initialJoinCode?: string | null;
  surahs: SurahInfo[];
  onClose: () => void;
  onSaveMembership: (membership: HalaqahMembership) => void;
  onRemoveMembership: (code: string) => void;
  onNotify: (message: string) => void;
}

function formatShortTime(iso: string): string {
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

export function HalaqahModal({
  open,
  halaqahs,
  initialJoinCode,
  surahs,
  onClose,
  onSaveMembership,
  onRemoveMembership,
  onNotify,
}: HalaqahModalProps) {
  const [view, setView] = useState<"groups" | "join" | "create">("groups");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<HalaqahSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form
  const [groupName, setGroupName] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [targetInput, setTargetInput] = useState("");

  // Join form
  const [joinCode, setJoinCode] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("");

  // Admin target edit
  const [editTarget, setEditTarget] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const activeMembership =
    halaqahs.find((h) => h.code === selectedCode) ?? halaqahs[0] ?? null;

  const loadSnapshot = useCallback(async (m: HalaqahMembership) => {
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchHalaqahSnapshot(m);
      setSnapshot(snap);
      setEditTarget(snap.meta.target ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data halaqah.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCopied(false);
    if (initialJoinCode) {
      setJoinCode(initialJoinCode);
      setView("join");
      return;
    }
    if (halaqahs.length === 0) {
      setView("join");
      setSnapshot(null);
    } else {
      setView("groups");
      const target = halaqahs.find((h) => h.code === selectedCode) ?? halaqahs[0];
      setSelectedCode(target.code);
      void loadSnapshot(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialJoinCode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const surahName = (num: number) => surahs.find((s) => s.number === num)?.name ?? `Surah ${num}`;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createHalaqah({
        name: groupName,
        displayName: createDisplayName,
        target: targetInput,
        workerUrl: DEFAULT_HALAQAH_WORKER_URL,
      });
      onSaveMembership(res.membership);
      setSelectedCode(res.membership.code);
      setSnapshot(res.snapshot);
      setEditTarget(res.snapshot.meta.target ?? "");
      setGroupName("");
      setTargetInput("");
      setView("groups");
      onNotify("Halaqah berhasil dibuat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat halaqah.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await joinHalaqah({
        code: joinCode,
        displayName: joinDisplayName,
        workerUrl: DEFAULT_HALAQAH_WORKER_URL,
      });
      onSaveMembership(res.membership);
      setSelectedCode(res.membership.code);
      setSnapshot(res.snapshot);
      setEditTarget(res.snapshot.meta.target ?? "");
      setJoinCode("");
      setView("groups");
      onNotify(`Bergabung ke ${res.membership.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal bergabung ke halaqah.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = async (code: string) => {
    try {
      const link = buildHalaqahInviteUrl(code);
      await navigator.clipboard.writeText(`${code}\n${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Gagal menyalin undangan ke clipboard.");
    }
  };

  const handleSaveMeta = async (locked?: boolean) => {
    if (!activeMembership || !snapshot) return;
    setSavingMeta(true);
    setError(null);
    try {
      const nextMeta = {
        ...snapshot.meta,
        target: editTarget.trim(),
        locked: locked ?? snapshot.meta.locked,
      };
      await updateHalaqahMeta({ membership: activeMembership, meta: nextMeta });
      setSnapshot({ ...snapshot, meta: nextMeta });
      onNotify(locked !== undefined ? (locked ? "Grup dikunci" : "Grup dibuka kembali") : "Target halaqah diperbarui");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui halaqah.");
    } finally {
      setSavingMeta(false);
    }
  };

  const handleLeave = async () => {
    if (!activeMembership) return;
    setLoading(true);
    setError(null);
    try {
      await leaveHalaqah(activeMembership).catch(() => undefined);
      onRemoveMembership(activeMembership.code);
      setSnapshot(null);
      setSelectedCode(null);
      onNotify("Keluar dari halaqah");
      if (halaqahs.length <= 1) setView("join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Halaqah Tanpa Login"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">Halaqah</h2>
            <p className="tasmi-sheet__subtitle">
              Tanpa login · Terenkripsi end-to-end dengan kode grup
            </p>
          </div>
          <button
            type="button"
            className="ayah-popover__close"
            aria-label="Tutup"
            disabled={loading}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="tasmi-sheet__modes" role="tablist">
          {halaqahs.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={view === "groups"}
              className={`tasmi-sheet__mode-btn ${view === "groups" ? "tasmi-sheet__mode-btn--active" : ""}`}
              onClick={() => {
                setView("groups");
                if (activeMembership) void loadSnapshot(activeMembership);
              }}
            >
              Grupku ({halaqahs.length})
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={view === "join"}
            className={`tasmi-sheet__mode-btn ${view === "join" ? "tasmi-sheet__mode-btn--active" : ""}`}
            onClick={() => setView("join")}
          >
            Gabung Kode
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "create"}
            className={`tasmi-sheet__mode-btn ${view === "create" ? "tasmi-sheet__mode-btn--active" : ""}`}
            onClick={() => setView("create")}
          >
            Buat Baru
          </button>
        </div>

        <div className="tasmi-summary__body">
          {error && <div className="tasmi-sheet__error">{error}</div>}

          {view === "groups" && activeMembership && (
            <div className="halaqah__panel">
              {halaqahs.length > 1 && (
                <div className="palette__quick-links">
                  {halaqahs.map((h) => (
                    <button
                      key={h.code}
                      type="button"
                      className={`palette__chip ${h.code === activeMembership.code ? "halaqah__chip--active" : ""}`}
                      onClick={() => {
                        setSelectedCode(h.code);
                        void loadSnapshot(h);
                      }}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="sync-code-box">
                <div>
                  <div className="halaqah__group-name">{snapshot?.meta.name ?? activeMembership.name}</div>
                  <div className="tasmi-sheet__option-scope">Kode: {activeMembership.code}</div>
                </div>
                <div className="halaqah__head-actions">
                  <button
                    type="button"
                    className="tasmi-sheet__history-btn"
                    onClick={() => void handleCopyInvite(activeMembership.code)}
                  >
                    {copied ? "Tersalin" : "Salin Link"}
                  </button>
                  <button
                    type="button"
                    className="tasmi-sheet__history-btn"
                    disabled={loading}
                    onClick={() => void loadSnapshot(activeMembership)}
                  >
                    {loading ? "…" : "Muat Ulang"}
                  </button>
                </div>
              </div>

              {snapshot?.meta.target && !activeMembership.adminSecret && (
                <div className="tasmi-summary__schedule-note">
                  Target pekan ini: <strong>{snapshot.meta.target}</strong>
                </div>
              )}

              {activeMembership.adminSecret && snapshot && (
                <div className="halaqah__admin-box">
                  <label className="tasmi-sheet__label" htmlFor="halaqah-target-edit">
                    Target Halaqah (Pembina)
                  </label>
                  <div className="halaqah__target-row">
                    <input
                      id="halaqah-target-edit"
                      type="text"
                      className="palette__input"
                      placeholder="Mis. Al-Mulk ayat 1–15"
                      value={editTarget}
                      onChange={(e) => setEditTarget(e.target.value)}
                    />
                    <button
                      type="button"
                      className="tasmi-sheet__history-btn"
                      disabled={savingMeta}
                      onClick={() => void handleSaveMeta()}
                    >
                      Simpan
                    </button>
                  </div>
                  <button
                    type="button"
                    className="tasmi-sheet__history-btn"
                    disabled={savingMeta}
                    onClick={() => void handleSaveMeta(!snapshot.meta.locked)}
                  >
                    {snapshot.meta.locked ? "🔓 Buka Pendaftaran Anggota" : "🔒 Kunci Grup (Tolak Anggota Baru)"}
                  </button>
                </div>
              )}

              <div className="halaqah__section-head">
                <span>Anggota &amp; Setoran ({snapshot?.members.length ?? 0})</span>
                <span className="tasmi-sheet__option-scope">
                  Kirim setoran dari Ringkasan setelah selesai Tasmi&apos;
                </span>
              </div>

              {loading && !snapshot ? (
                <div className="tasmi-summary__empty">Memuat anggota halaqah…</div>
              ) : (
                <div className="tasmi-summary__history-list">
                  {(snapshot?.members ?? []).map((member) => {
                    const latest = member.data.reports[0];
                    const isMe = member.memberId === activeMembership.memberId;
                    return (
                      <div key={member.memberId} className="halaqah__member-card">
                        <div className="halaqah__member-head">
                          <strong>
                            {member.data.displayName}
                            {isMe ? " (Saya)" : ""}
                          </strong>
                          <span className="tasmi-sheet__option-scope">
                            {member.data.reports.length} setoran
                          </span>
                        </div>
                        {latest ? (
                          <div className="halaqah__member-report">
                            <span>
                              {surahName(latest.surah)} : {latest.fromAyah}–{latest.toAyah} ·{" "}
                              {formatShortTime(latest.reportedAt)}
                            </span>
                            <span
                              className={`tasmi-summary__score ${
                                latest.mistakes === 0
                                  ? "tasmi-summary__score--clean"
                                  : "tasmi-summary__score--warn"
                              }`}
                            >
                              {latest.mistakes === 0 ? "Lancar" : `${latest.mistakes} catatan`}
                            </span>
                          </div>
                        ) : (
                          <div className="tasmi-sheet__option-scope">Belum ada setoran Tasmi&apos;.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="halaqah__footer">
                <button
                  type="button"
                  className="sync-secondary-btn"
                  disabled={loading}
                  onClick={() => void handleLeave()}
                >
                  Keluar dari Halaqah
                </button>
              </div>
            </div>
          )}

          {view === "join" && (
            <div className="tasmi-sheet__section">
              <div className="tasmi-sheet__free-box">
                <p>
                  Tempel kode grup (mis. <strong>HLQ-7X4K-9M2P</strong>) atau tautan undangan dari
                  pembina. Tidak perlu akun atau email.
                </p>
              </div>
              <label className="tasmi-sheet__label" htmlFor="halaqah-join-code">
                Kode atau Link Undangan
              </label>
              <input
                id="halaqah-join-code"
                type="text"
                className="palette__input"
                placeholder="HLQ-XXXX-XXXX"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <label className="tasmi-sheet__label" htmlFor="halaqah-join-name">
                Nama Tampilanmu
              </label>
              <input
                id="halaqah-join-name"
                type="text"
                className="palette__input"
                placeholder="Mis. Ahmad"
                value={joinDisplayName}
                onChange={(e) => setJoinDisplayName(e.target.value)}
              />
              <button
                type="button"
                className="tasmi-sheet__start-btn"
                disabled={loading}
                onClick={() => void handleJoin()}
              >
                {loading ? "Bergabung…" : "Gabung Halaqah"}
              </button>
            </div>
          )}

          {view === "create" && (
            <div className="tasmi-sheet__section">
              <div className="tasmi-sheet__free-box">
                <p>
                  Buat ruang halaqah baru (maks. 60 anggota). Setelah dibuat, bagikan kode atau
                  tautan undangannya ke anggota.
                </p>
              </div>
              <label className="tasmi-sheet__label" htmlFor="halaqah-create-group">
                Nama Halaqah
              </label>
              <input
                id="halaqah-create-group"
                type="text"
                className="palette__input"
                placeholder="Mis. Halaqah Subuh Juz 30"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <label className="tasmi-sheet__label" htmlFor="halaqah-create-name">
                Nama Pembina / Tampilanmu
              </label>
              <input
                id="halaqah-create-name"
                type="text"
                className="palette__input"
                placeholder="Mis. Ust. Hasan"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
              />
              <label className="tasmi-sheet__label" htmlFor="halaqah-create-target">
                Target Awal (Opsional)
              </label>
              <input
                id="halaqah-create-target"
                type="text"
                className="palette__input"
                placeholder="Mis. An-Naba 1–20 pekan ini"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
              />
              <button
                type="button"
                className="tasmi-sheet__start-btn"
                disabled={loading}
                onClick={() => void handleCreate()}
              >
                {loading ? "Membuat…" : "Buat Halaqah"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
