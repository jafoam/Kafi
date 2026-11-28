import { useEffect, useRef, useState } from "react";
import { GlassSelect } from "./GlassSelect";
import type {
  AyahKey,
  HighlightColor,
  ResourceInfo,
  TafsirInfo,
} from "../data/types";
import type { QuranApi } from "../services/quran-api";
import { parseAyahKey } from "../services/audio-controller";

export type StudyTab = "terjemahan" | "tafsir" | "catatan";

export interface StudyDrawerProps {
  open: boolean;
  ayah: AyahKey | null;
  surahName: string;
  surahArabicName: string;
  quranApi: QuranApi;
  translations: ResourceInfo[];
  tafsirs: TafsirInfo[];
  translationId: number;
  tafsirId: string;
  isBookmarked: boolean;
  highlightColor: HighlightColor | null;
  note: string;
  onClose: () => void;
  onChangeTranslation: (id: number) => void;
  onChangeTafsir: (id: string) => void;
  onToggleBookmark: (ayah: AyahKey) => void;
  onSetHighlight: (ayah: AyahKey, color: HighlightColor | null) => void;
  onSaveNote: (ayah: AyahKey, text: string) => void;
  onPlayAyah: (ayah: AyahKey) => void;
  onOpenDownloads?: (tab: "translation" | "tafsir") => void;
  /** Opens the full-screen reader at this ayah. */
  onOpenReader?: (ayah: AyahKey) => void;
}

const HIGHLIGHT_OPTIONS: Array<{ color: HighlightColor; label: string }> = [
  { color: "amber", label: "Kuning" },
  { color: "emerald", label: "Hijau" },
  { color: "sky", label: "Biru" },
  { color: "rose", label: "Merah muda" },
];

interface FetchState {
  status: "idle" | "loading" | "ready" | "error";
  html: string;
  fromCache: boolean;
  error: string | null;
}

const INITIAL_FETCH: FetchState = {
  status: "idle",
  html: "",
  fromCache: false,
  error: null,
};

export function StudyDrawer({
  open,
  ayah,
  surahName,
  surahArabicName,
  quranApi,
  translations,
  tafsirs,
  translationId,
  tafsirId,
  isBookmarked,
  highlightColor,
  note,
  onClose,
  onChangeTranslation,
  onChangeTafsir,
  onToggleBookmark,
  onSetHighlight,
  onSaveNote,
  onPlayAyah,
  onOpenDownloads,
  onOpenReader,
}: StudyDrawerProps) {
  const [tab, setTab] = useState<StudyTab>("terjemahan");
  const [translationState, setTranslationState] = useState<FetchState>(INITIAL_FETCH);
  const [tafsirState, setTafsirState] = useState<FetchState>(INITIAL_FETCH);
  const [retryTick, setRetryTick] = useState(0);
  const [draftNote, setDraftNote] = useState(note);
  const [noteSaved, setNoteSaved] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const flushNoteRef = useRef<() => void>(() => {});

  // Sync draft note when switching ayah or external note changes
  useEffect(() => {
    setDraftNote(note);
    setNoteSaved(false);
  }, [ayah, note]);

  // Cleanup pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Fetch translation with AbortController race protection
  useEffect(() => {
    if (!open || !ayah || tab !== "terjemahan") return;
    const controller = new AbortController();
    const { surah, ayah: ayahNum } = parseAyahKey(ayah);

    setTranslationState({ status: "loading", html: "", fromCache: false, error: null });

    void quranApi
      .getTranslation(translationId, surah, ayahNum, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setTranslationState({
          status: "ready",
          html: res.html,
          fromCache: res.fromCache,
          error: null,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTranslationState({
          status: "error",
          html: "",
          fromCache: false,
          error: err instanceof Error ? err.message : "Gagal memuat terjemahan",
        });
      });

    return () => controller.abort();
  }, [open, ayah, tab, translationId, quranApi, retryTick]);

  // Fetch tafsir with AbortController race protection
  useEffect(() => {
    if (!open || !ayah || tab !== "tafsir") return;
    const controller = new AbortController();
    const { surah, ayah: ayahNum } = parseAyahKey(ayah);

    setTafsirState({ status: "loading", html: "", fromCache: false, error: null });

    void quranApi
      .getTafsir(tafsirId, surah, ayahNum, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setTafsirState({
          status: "ready",
          html: res.html,
          fromCache: res.fromCache,
          error: null,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTafsirState({
          status: "error",
          html: "",
          fromCache: false,
          error: err instanceof Error ? err.message : "Gagal memuat tafsir",
        });
      });

    return () => controller.abort();
  }, [open, ayah, tab, tafsirId, quranApi, retryTick]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        flushNoteRef.current();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        drawerRef.current?.contains(target) ||
        target.closest(".glass-select__menu") ||
        target.closest(".audio-dock") ||
        target.closest(".study-drawer__backdrop")
      ) {
        return;
      }
      flushNoteRef.current();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open || !ayah) return null;

  const { ayah: ayahNum } = parseAyahKey(ayah);
  const activeTafsir = tafsirs.find((t) => t.id === tafsirId);
  const isArabicTafsir = activeTafsir?.language === "arabic";

  const handleNoteChange = (nextText: string) => {
    setDraftNote(nextText);
    setNoteSaved(false);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    const targetAyah = ayah;
    saveTimerRef.current = window.setTimeout(() => {
      onSaveNote(targetAyah, nextText);
      setNoteSaved(true);
    }, 450);
  };

  const flushNoteNow = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (draftNote !== note) {
      onSaveNote(ayah, draftNote);
      setNoteSaved(true);
    }
  };
  flushNoteRef.current = flushNoteNow;

  return (
    <>
      <div
        className="study-drawer__backdrop"
        aria-hidden="true"
        onClick={() => {
          flushNoteNow();
          onClose();
        }}
      />
      <aside
        ref={drawerRef}
        className="study-drawer"
        role="complementary"
        aria-label="Panel Terjemahan, Tafsir, dan Catatan"
      >
      <div className="study-drawer__header">
        <div className="study-drawer__heading">
          <span className="study-drawer__title">
            {surahName} · Ayat {ayahNum}
          </span>
          {surahArabicName && (
            <span className="study-drawer__arabic" lang="ar" dir="rtl">
              {surahArabicName}
            </span>
          )}
        </div>
        <div className="study-drawer__header-actions">
          {onOpenReader && (
            <button
              type="button"
              className="study-drawer__icon-btn"
              onClick={() => {
                flushNoteNow();
                onOpenReader(ayah);
              }}
              aria-label="Baca layar penuh, geser per ayat"
              title="Baca layar penuh"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="study-drawer__icon-btn"
            onClick={() => onPlayAyah(ayah)}
            aria-label="Putar ayat ini"
            title="Putar ayat ini"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 5.2v13.6a1 1 0 0 0 1.5.86l11.2-6.8a1 1 0 0 0 0-1.72L8.5 4.34A1 1 0 0 0 7 5.2z" />
            </svg>
          </button>
          <button
            type="button"
            className="study-drawer__icon-btn"
            onClick={() => {
              flushNoteNow();
              onClose();
            }}
            aria-label="Tutup panel"
            title="Tutup"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="study-drawer__tabs" role="tablist">
        {(
          [
            ["terjemahan", "Terjemahan"],
            ["tafsir", "Tafsir"],
            ["catatan", "Catatan"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`study-drawer__tab ${tab === key ? "study-drawer__tab--active" : ""}`}
            onClick={() => {
              if (tab === "catatan" && key !== "catatan") flushNoteNow();
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="study-drawer__body">
        {tab === "terjemahan" && (
          <div className="study-drawer__pane">
            <div className="study-drawer__toolbar">
              <GlassSelect
                className="study-drawer__select"
                ariaLabel="Pilih Terjemahan"
                value={String(translationId)}
                options={translations.map((t) => ({ value: String(t.id), label: t.name }))}
                onChange={(val) => onChangeTranslation(Number(val))}
              />
              <div className="study-drawer__toolbar-meta">
                {translationState.status === "ready" ? (
                  <span
                    className={`study-drawer__badge ${translationState.fromCache ? "study-drawer__badge--offline" : ""}`}
                  >
                    {translationState.fromCache ? "Tersimpan offline" : "Online"}
                  </span>
                ) : (
                  <span />
                )}
                {onOpenDownloads && (
                  <button
                    type="button"
                    className="study-drawer__dl-btn"
                    onClick={() => onOpenDownloads("translation")}
                    title="Kelola unduhan terjemahan offline"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    <span>Unduh offline</span>
                  </button>
                )}
              </div>
            </div>

            {translationState.status === "loading" && (
              <div className="study-drawer__loading" aria-busy="true">
                <div className="study-drawer__skeleton-line" />
                <div className="study-drawer__skeleton-line study-drawer__skeleton-line--short" />
              </div>
            )}

            {translationState.status === "error" && (
              <div className="study-drawer__error">
                <p>Tidak dapat memuat terjemahan. Periksa koneksi internet Anda.</p>
                <button
                  type="button"
                  className="study-drawer__retry-btn"
                  onClick={() => setRetryTick((n) => n + 1)}
                >
                  Coba lagi
                </button>
              </div>
            )}

            {translationState.status === "ready" && (
              <div
                className="study-drawer__content"
                dangerouslySetInnerHTML={{
                  __html:
                    translationState.html ||
                    "<p>Terjemahan tidak tersedia untuk ayat ini.</p>",
                }}
              />
            )}
          </div>
        )}

        {tab === "tafsir" && (
          <div className="study-drawer__pane">
            <div className="study-drawer__toolbar">
              <GlassSelect
                className="study-drawer__select"
                ariaLabel="Pilih Tafsir"
                value={tafsirId}
                options={tafsirs.map((t) => ({ value: t.id, label: t.name }))}
                onChange={onChangeTafsir}
              />
              <div className="study-drawer__toolbar-meta">
                {tafsirState.status === "ready" ? (
                  <span
                    className={`study-drawer__badge ${tafsirState.fromCache ? "study-drawer__badge--offline" : ""}`}
                  >
                    {tafsirState.fromCache ? "Tersimpan offline" : "Online"}
                  </span>
                ) : (
                  <span />
                )}
                {onOpenDownloads && (
                  <button
                    type="button"
                    className="study-drawer__dl-btn"
                    onClick={() => onOpenDownloads("tafsir")}
                    title="Kelola unduhan tafsir offline"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    <span>Unduh offline</span>
                  </button>
                )}
              </div>
            </div>

            {tafsirState.status === "loading" && (
              <div className="study-drawer__loading" aria-busy="true">
                <div className="study-drawer__skeleton-line" />
                <div className="study-drawer__skeleton-line" />
                <div className="study-drawer__skeleton-line study-drawer__skeleton-line--short" />
              </div>
            )}

            {tafsirState.status === "error" && (
              <div className="study-drawer__error">
                <p>Tidak dapat memuat tafsir. Periksa koneksi internet Anda.</p>
                <button
                  type="button"
                  className="study-drawer__retry-btn"
                  onClick={() => setRetryTick((n) => n + 1)}
                >
                  Coba lagi
                </button>
              </div>
            )}

            {tafsirState.status === "ready" && (
              <div
                className={`study-drawer__content ${isArabicTafsir ? "study-drawer__content--arabic" : ""}`}
                dir={isArabicTafsir ? "rtl" : "ltr"}
                lang={isArabicTafsir ? "ar" : undefined}
                dangerouslySetInnerHTML={{
                  __html:
                    tafsirState.html || "<p>Tafsir tidak tersedia untuk ayat ini.</p>",
                }}
              />
            )}
          </div>
        )}

        {tab === "catatan" && (
          <div className="study-drawer__pane study-drawer__notes">
            <div className="study-drawer__note-row">
              <span className="study-drawer__label">Penanda</span>
              <button
                type="button"
                className={`ayah-popover__bookmark-btn ${isBookmarked ? "ayah-popover__bookmark-btn--active" : ""}`}
                onClick={() => onToggleBookmark(ayah)}
              >
                {isBookmarked ? "★ Ditandai" : "☆ Tandai ayat"}
              </button>
            </div>

            <div className="study-drawer__note-row">
              <span className="study-drawer__label">Sorotan</span>
              <div className="hl-swatches">
                {HIGHLIGHT_OPTIONS.map(({ color, label }) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Sorot ${label}`}
                    title={label}
                    className={`hl-swatch hl-swatch--${color} ${highlightColor === color ? "hl-swatch--active" : ""}`}
                    onClick={() =>
                      onSetHighlight(ayah, highlightColor === color ? null : color)
                    }
                  />
                ))}
                {highlightColor && (
                  <button
                    type="button"
                    className="hl-swatch hl-swatch--clear"
                    aria-label="Hapus sorotan"
                    title="Hapus sorotan"
                    onClick={() => onSetHighlight(ayah, null)}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <label className="study-drawer__note-field">
              <div className="study-drawer__note-row">
                <span className="study-drawer__label">Catatan Pribadi</span>
                {noteSaved && <span className="study-drawer__saved">Tersimpan</span>}
              </div>
              <textarea
                className="study-drawer__textarea"
                rows={7}
                placeholder="Tulis tadabbur, faedah, atau pengingat hafalan untuk ayat ini..."
                value={draftNote}
                onChange={(e) => handleNoteChange(e.target.value)}
                onBlur={flushNoteNow}
              />
            </label>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
