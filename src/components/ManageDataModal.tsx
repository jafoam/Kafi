import { useEffect, useMemo, useState } from "react";
import type {
  AyahKey,
  HighlightColor,
  SurahInfo,
  UserData,
} from "../data/types";
import { formatDueLabel } from "../services/murajaah-srs";
import { isHiddenAyahActive } from "../services/user-store";
import { useI18n } from "../i18n";

export interface ManageDataModalProps {
  open: boolean;
  userData: UserData;
  surahs: SurahInfo[];
  onClose: () => void;
  onJumpToAyah: (ayah: AyahKey) => void;
  onToggleBookmark: (ayah: AyahKey) => void;
  onDeleteHighlight: (ayah: AyahKey) => void;
  onDeleteNote: (ayah: AyahKey) => void;
  onUnhideAyah: (ayah: AyahKey) => void;
  onToggleArchiveTasmi: (id: string, archived: boolean) => void;
  onDeleteTasmi: (id: string) => void;
  onToggleArchiveMurajaah: (id: string, archived: boolean) => void;
  onDeleteMurajaah: (id: string) => void;
  onRemoveHalaqah: (code: string) => void;
}

type ManageSection =
  | "tasmi"
  | "schedule"
  | "bookmarks"
  | "notes"
  | "highlights"
  | "hidden"
  | "halaqah";

const HIGHLIGHT_LABELS_ID: Record<HighlightColor, string> = {
  amber: "Kuning",
  emerald: "Hijau",
  sky: "Biru",
  rose: "Merah Muda",
};

const HIGHLIGHT_LABELS_EN: Record<HighlightColor, string> = {
  amber: "Yellow",
  emerald: "Green",
  sky: "Blue",
  rose: "Rose",
};

export function ManageDataModal({
  open,
  userData,
  surahs,
  onClose,
  onJumpToAyah,
  onToggleBookmark,
  onDeleteHighlight,
  onDeleteNote,
  onUnhideAyah,
  onToggleArchiveTasmi,
  onDeleteTasmi,
  onToggleArchiveMurajaah,
  onDeleteMurajaah,
  onRemoveHalaqah,
}: ManageDataModalProps) {
  const { lang, isEn, tr } = useI18n();
  const highlightLabels = isEn ? HIGHLIGHT_LABELS_EN : HIGHLIGHT_LABELS_ID;
  const locale = isEn ? "en-US" : "id-ID";
  const [section, setSection] = useState<ManageSection>("tasmi");
  const [showArchived, setShowArchived] = useState(false);

  const surahName = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of surahs) map.set(s.number, s.name);
    return (num: number) => map.get(num) ?? `Surah ${num}`;
  }, [surahs]);

  const formatAyah = (key: AyahKey) => {
    const [s, a] = key.split(":");
    return `${surahName(Number(s))} : ${a}`;
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const hiddenKeys = useMemo(
    () =>
      Object.entries(userData.hiddenAyahs ?? {})
        .filter(([, ev]) => isHiddenAyahActive(ev))
        .map(([k]) => k as AyahKey),
    [userData.hiddenAyahs],
  );
  const noteEntries = useMemo(
    () => Object.entries(userData.notes) as [AyahKey, string][],
    [userData.notes],
  );
  const highlightEntries = useMemo(
    () => Object.entries(userData.highlights) as [AyahKey, HighlightColor][],
    [userData.highlights],
  );
  const archivedTasmiSet = useMemo(() => {
    const set = new Set<string>();
    for (const [id, ev] of Object.entries(userData.archivedTasmi ?? {})) {
      if (ev.on) set.add(id);
    }
    return set;
  }, [userData.archivedTasmi]);
  const archivedMurajaahSet = useMemo(() => {
    const set = new Set<string>();
    for (const [id, ev] of Object.entries(userData.archivedMurajaah ?? {})) {
      if (ev.on) set.add(id);
    }
    return set;
  }, [userData.archivedMurajaah]);

  if (!open) return null;

  const cards = userData.murajaahCards ?? [];
  const halaqahs = userData.halaqahs ?? [];
  const visibleTasmi = userData.tasmiHistory.filter((item) =>
    showArchived ? archivedTasmiSet.has(item.id) : !archivedTasmiSet.has(item.id),
  );
  const visibleCards = cards.filter((c) =>
    showArchived ? archivedMurajaahSet.has(c.id) : !archivedMurajaahSet.has(c.id),
  );

  const sections: { id: ManageSection; label: string; count: number }[] = [
    { id: "tasmi", label: "Tasmi'", count: userData.tasmiHistory.length },
    { id: "schedule", label: tr("Jadwal", "Schedule"), count: cards.length },
    { id: "bookmarks", label: tr("Bookmark", "Bookmarks"), count: userData.bookmarks.length },
    { id: "notes", label: tr("Catatan", "Notes"), count: noteEntries.length },
    { id: "highlights", label: tr("Sorotan", "Highlights"), count: highlightEntries.length },
    { id: "hidden", label: tr("Disembunyikan", "Hidden"), count: hiddenKeys.length },
    { id: "halaqah", label: "Halaqah", count: halaqahs.length },
  ];

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Kelola Data Pengguna", "Manage User Data")}
      onClick={onClose}
    >
      <div className="tasmi-summary" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-sheet__header">
          <div>
            <h2 className="tasmi-sheet__title">{tr("Kelola Data", "Manage Data")}</h2>
            <p className="tasmi-sheet__subtitle">
              {tr(
                "Arsipkan atau hapus riwayat, jadwal, bookmark, catatan, sorotan, dan halaqah",
                "Archive or delete history, schedules, bookmarks, notes, highlights, and halaqah",
              )}
            </p>
          </div>
          <button type="button" className="ayah-popover__close" aria-label={tr("Tutup", "Close")} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="manage-data__tabs" role="tablist" aria-label={tr("Kategori data", "Data category")}>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={`manage-data__tab ${section === s.id ? "manage-data__tab--active" : ""}`}
              onClick={() => {
                setSection(s.id);
                setShowArchived(false);
              }}
            >
              {s.label} ({s.count})
            </button>
          ))}
        </div>

        <div className="tasmi-summary__body">
          {(section === "tasmi" || section === "schedule") && (
            <div className="app-menu__segmented tasmi-summary__history-filter" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!showArchived}
                className={`app-menu__seg ${!showArchived ? "app-menu__seg--active" : ""}`}
                onClick={() => setShowArchived(false)}
              >
                {tr("Aktif", "Active")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showArchived}
                className={`app-menu__seg ${showArchived ? "app-menu__seg--active" : ""}`}
                onClick={() => setShowArchived(true)}
              >
                {tr("Arsip", "Archived")}
              </button>
            </div>
          )}

          {section === "tasmi" &&
            (visibleTasmi.length === 0 ? (
              <div className="tasmi-summary__empty">
                {showArchived
                  ? tr("Tidak ada riwayat Tasmi' di arsip.", "No archived Tasmi' history.")
                  : tr("Belum ada riwayat Tasmi' aktif.", "No active Tasmi' history yet.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {visibleTasmi.map((item) => {
                  const archived = archivedTasmiSet.has(item.id);
                  return (
                    <div key={item.id} className="manage-data__row">
                      <div className="manage-data__info">
                        <strong>
                          {surahName(item.surah)} : {item.fromAyah}–{item.toAyah}
                        </strong>
                        <span className="tasmi-sheet__option-scope">
                          {item.mistakes.length === 0
                            ? tr("Lancar", "Smooth")
                            : `${item.mistakes.length} ${tr("catatan", "notes")}`}{" "}
                          · {new Date(item.startedAt).toLocaleDateString(locale)}
                        </span>
                      </div>
                      <div className="manage-data__actions">
                        <button
                          type="button"
                          className="tasmi-sheet__history-btn"
                          onClick={() => onToggleArchiveTasmi(item.id, !archived)}
                        >
                          {archived ? tr("Pulihkan", "Restore") : tr("Arsip", "Archive")}
                        </button>
                        <button
                          type="button"
                          className="manage-data__del-btn"
                          onClick={() => onDeleteTasmi(item.id)}
                        >
                          {tr("Hapus", "Delete")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {section === "schedule" &&
            (visibleCards.length === 0 ? (
              <div className="tasmi-summary__empty">
                {showArchived
                  ? tr("Tidak ada jadwal di arsip.", "No archived schedules.")
                  : tr("Belum ada jadwal muraja'ah aktif.", "No active muraja'ah schedules yet.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {visibleCards.map((card) => {
                  const archived = archivedMurajaahSet.has(card.id);
                  return (
                    <div key={card.id} className="manage-data__row">
                      <div className="manage-data__info">
                        <strong>
                          {surahName(card.surah)} : {card.fromAyah}–{card.toAyah}
                        </strong>
                        <span className="tasmi-sheet__option-scope">
                          {card.kind === "ziyadah" ? "Ziyadah" : "Muraja'ah"} ·{" "}
                          {tr(`tiap ${card.stabilityDays} hari`, `every ${card.stabilityDays} days`)} ·{" "}
                          {formatDueLabel(card.dueAt, undefined, lang)}
                        </span>
                      </div>
                      <div className="manage-data__actions">
                        <button
                          type="button"
                          className="tasmi-sheet__history-btn"
                          onClick={() => onToggleArchiveMurajaah(card.id, !archived)}
                        >
                          {archived ? tr("Pulihkan", "Restore") : tr("Arsip", "Archive")}
                        </button>
                        <button
                          type="button"
                          className="manage-data__del-btn"
                          onClick={() => onDeleteMurajaah(card.id)}
                        >
                          {tr("Hapus", "Delete")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {section === "bookmarks" &&
            (userData.bookmarks.length === 0 ? (
              <div className="tasmi-summary__empty">
                {tr("Belum ada bookmark tersimpan.", "No saved bookmarks yet.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {userData.bookmarks.map((ayah) => (
                  <div key={ayah} className="manage-data__row">
                    <button
                      type="button"
                      className="manage-data__info manage-data__link"
                      onClick={() => {
                        onJumpToAyah(ayah);
                        onClose();
                      }}
                    >
                      <strong>{formatAyah(ayah)}</strong>
                    </button>
                    <button
                      type="button"
                      className="manage-data__del-btn"
                      onClick={() => onToggleBookmark(ayah)}
                    >
                      {tr("Hapus", "Delete")}
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {section === "notes" &&
            (noteEntries.length === 0 ? (
              <div className="tasmi-summary__empty">
                {tr("Belum ada catatan ayat.", "No ayah notes yet.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {noteEntries.map(([ayah, text]) => (
                  <div key={ayah} className="manage-data__row">
                    <button
                      type="button"
                      className="manage-data__info manage-data__link"
                      onClick={() => {
                        onJumpToAyah(ayah);
                        onClose();
                      }}
                    >
                      <strong>{formatAyah(ayah)}</strong>
                      <span className="tasmi-sheet__option-scope">{text}</span>
                    </button>
                    <button
                      type="button"
                      className="manage-data__del-btn"
                      onClick={() => onDeleteNote(ayah)}
                    >
                      {tr("Hapus", "Delete")}
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {section === "highlights" &&
            (highlightEntries.length === 0 ? (
              <div className="tasmi-summary__empty">
                {tr("Belum ada sorotan ayat.", "No ayah highlights yet.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {highlightEntries.map(([ayah, color]) => (
                  <div key={ayah} className="manage-data__row">
                    <button
                      type="button"
                      className="manage-data__info manage-data__link"
                      onClick={() => {
                        onJumpToAyah(ayah);
                        onClose();
                      }}
                    >
                      <strong>{formatAyah(ayah)}</strong>
                      <span className="tasmi-sheet__option-scope">
                        {tr("Warna:", "Color:")} {highlightLabels[color]}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="manage-data__del-btn"
                      onClick={() => onDeleteHighlight(ayah)}
                    >
                      {tr("Hapus", "Delete")}
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {section === "hidden" &&
            (hiddenKeys.length === 0 ? (
              <div className="tasmi-summary__empty">
                {tr("Tidak ada ayat yang disembunyikan secara manual.", "No manually hidden ayahs.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {hiddenKeys.map((ayah) => (
                  <div key={ayah} className="manage-data__row">
                    <button
                      type="button"
                      className="manage-data__info manage-data__link"
                      onClick={() => {
                        onJumpToAyah(ayah);
                        onClose();
                      }}
                    >
                      <strong>{formatAyah(ayah)}</strong>
                    </button>
                    <button
                      type="button"
                      className="tasmi-sheet__history-btn"
                      onClick={() => onUnhideAyah(ayah)}
                    >
                      {tr("Tampilkan", "Show")}
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {section === "halaqah" &&
            (halaqahs.length === 0 ? (
              <div className="tasmi-summary__empty">
                {tr("Belum tergabung di halaqah mana pun.", "Not joined to any halaqah yet.")}
              </div>
            ) : (
              <div className="manage-data__list">
                {halaqahs.map((h) => (
                  <div key={h.code} className="manage-data__row">
                    <div className="manage-data__info">
                      <strong>{h.name}</strong>
                      <span className="tasmi-sheet__option-scope">
                        {h.code} · {tr("sebagai", "as")} {h.displayName}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="manage-data__del-btn"
                      onClick={() => onRemoveHalaqah(h.code)}
                    >
                      {tr("Hapus", "Remove")}
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
