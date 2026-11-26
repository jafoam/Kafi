import { useEffect, useRef, useState } from "react";
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
}: StudyDrawerProps) {
  const [tab, setTab] = useState<StudyTab>("terjemahan");
  const [translationState, setTranslationState] = useState<FetchState>(INITIAL_FETCH);
  const [tafsirState, setTafsirState] = useState<FetchState>(INITIAL_FETCH);
  const [retryTick, setRetryTick] = useState(0);
  const [draftNote, setDraftNote] = useState(note);
  const [noteSaved, setNoteSaved] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

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

  return (
    <aside
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
          <button
            type="button"
            className="study-drawer__icon-btn"
            onClick={() => onPlayAyah(ayah)}
            aria-label="Putar ayat ini"
            title="Putar ayat ini"
          >
            ▶
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
            ×
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
              <select
                className="study-drawer__select"
                aria-label="Pilih Terjemahan"
                value={translationId}
                onChange={(e) => onChangeTranslation(Number(e.target.value))}
              >
                {translations.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {translationState.status === "ready" && (
                <span
                  className={`study-drawer__badge ${translationState.fromCache ? "study-drawer__badge--offline" : ""}`}
                >
                  {translationState.fromCache ? "Tersimpan offline" : "Online"}
                </span>
              )}
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
              <select
                className="study-drawer__select"
                aria-label="Pilih Tafsir"
                value={tafsirId}
                onChange={(e) => onChangeTafsir(e.target.value)}
              >
                {tafsirs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {tafsirState.status === "ready" && (
                <span
                  className={`study-drawer__badge ${tafsirState.fromCache ? "study-drawer__badge--offline" : ""}`}
                >
                  {tafsirState.fromCache ? "Tersimpan offline" : "Online"}
                </span>
              )}
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
  );
}
