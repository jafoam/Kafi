import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GlassSelect } from "./GlassSelect";
import type { AyahKey, ResourceInfo, SurahInfo, TafsirInfo } from "../data/types";
import { useI18n } from "../i18n";
import type { GlyphPageLoader } from "../services/glyph-pages";
import type { QuranApi } from "../services/quran-api";
import { parseAyahKey } from "../services/audio-controller";

/**
 * A full-screen reader for translation and tafsir: one ayah per panel, swiped sideways like
 * a book page by page, each panel scrolling on its own for long tafsir.
 */

type ReaderView = "terjemahan" | "tafsir" | "keduanya";

interface ReaderPrefs {
  view: ReaderView;
  arabic: boolean;
}

const PREFS_KEY = "kafi:reader-prefs";
const DEFAULT_PREFS: ReaderPrefs = { view: "keduanya", arabic: true };
/** Panels this far from the current one have their content loaded. */
const LOAD_WINDOW = 1;

function readPrefs(): ReaderPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<ReaderPrefs> | null;
    if (!raw) return DEFAULT_PREFS;
    return {
      view: raw.view === "terjemahan" || raw.view === "tafsir" || raw.view === "keduanya" ? raw.view : DEFAULT_PREFS.view,
      arabic: typeof raw.arabic === "boolean" ? raw.arabic : DEFAULT_PREFS.arabic,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: ReaderPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or blocked storage: the reader still works, it just forgets the choice.
  }
}

type Loaded = { status: "loading" } | { status: "ready"; html: string } | { status: "error" };

interface GlyphRun {
  fontFamily: string;
  codes: string[];
}

export interface TranslationReaderProps {
  open: boolean;
  /** The ayah to open on. */
  startAyah: AyahKey;
  /** Follows recitation: when it changes while open, the reader moves to it. */
  playingAyah: AyahKey | null;
  surahs: SurahInfo[];
  quranApi: QuranApi;
  glyphLoader: GlyphPageLoader;
  ayahPages: Map<AyahKey, number[]> | null;
  translations: ResourceInfo[];
  tafsirs: TafsirInfo[];
  translationId: number;
  tafsirId: string;
  onChangeTranslation: (id: number) => void;
  onChangeTafsir: (id: string) => void;
  onPlayAyah: (ayah: AyahKey) => void;
  /** Closes the reader; the mushaf can turn to the ayah that was being read. */
  onClose: (lastAyah: AyahKey) => void;
}

export function TranslationReader(props: TranslationReaderProps) {
  if (!props.open) return null;
  return <ReaderBody {...props} />;
}

function ReaderBody({
  startAyah,
  playingAyah,
  surahs,
  quranApi,
  glyphLoader,
  ayahPages,
  translations,
  tafsirs,
  translationId,
  tafsirId,
  onChangeTranslation,
  onChangeTafsir,
  onPlayAyah,
  onClose,
}: TranslationReaderProps) {
  const { tr } = useI18n();
  const [prefs, setPrefs] = useState<ReaderPrefs>(readPrefs);
  const [current, setCurrent] = useState<AyahKey>(startAyah);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { surah, ayah } = parseAyahKey(current);
  const surahInfo = surahs.find((s) => s.number === surah);
  const total = surahInfo?.ayahs ?? 1;

  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Set while the scroller is being moved by code, so its scroll events don't fight back. */
  const programmaticRef = useRef(false);

  const updatePrefs = (patch: Partial<ReaderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(next);
      return next;
    });
  };

  const showTranslation = prefs.view !== "tafsir";
  const showTafsir = prefs.view !== "terjemahan";

  // Content, keyed by "t:<id>:<ayah>" / "f:<id>:<ayah>" / "g:<ayah>".
  const [content, setContent] = useState<Map<string, Loaded>>(() => new Map());
  const [glyphs, setGlyphs] = useState<Map<AyahKey, GlyphRun[]>>(() => new Map());
  const requested = useRef(new Set<string>());

  const loadAround = useCallback(
    (center: number) => {
      const from = Math.max(1, center - LOAD_WINDOW);
      const to = Math.min(total, center + LOAD_WINDOW);
      for (let n = from; n <= to; n++) {
        const key = `${surah}:${n}` as AyahKey;
        const jobs: Array<[string, () => Promise<{ html: string }>]> = [];
        if (showTranslation) jobs.push([`t:${translationId}:${key}`, () => quranApi.getTranslation(translationId, surah, n)]);
        if (showTafsir) jobs.push([`f:${tafsirId}:${key}`, () => quranApi.getTafsir(tafsirId, surah, n)]);
        for (const [id, run] of jobs) {
          if (requested.current.has(id)) continue;
          requested.current.add(id);
          setContent((prev) => new Map(prev).set(id, { status: "loading" }));
          run().then(
            (res) => setContent((prev) => new Map(prev).set(id, { status: "ready", html: res.html })),
            () => {
              requested.current.delete(id);
              setContent((prev) => new Map(prev).set(id, { status: "error" }));
            },
          );
        }
        const gid = `g:${key}`;
        if (prefs.arabic && ayahPages && !requested.current.has(gid)) {
          requested.current.add(gid);
          const pages = ayahPages.get(key) ?? [];
          void Promise.all(pages.map((p) => glyphLoader.load(p))).then(
            (datas) => {
              const runs: GlyphRun[] = [];
              for (const data of datas) {
                for (const line of data.lines) {
                  for (const w of line.words) {
                    if (w.ayah !== key) continue;
                    // A word drawn by another page's font starts its own run.
                    const fontFamily = w.fontFamily ?? data.fontFamily;
                    const last = runs[runs.length - 1];
                    if (last && last.fontFamily === fontFamily) last.codes.push(w.code);
                    else runs.push({ fontFamily, codes: [w.code] });
                  }
                }
              }
              setGlyphs((prev) => new Map(prev).set(key, runs));
            },
            () => requested.current.delete(gid),
          );
        }
      }
    },
    [surah, total, showTranslation, showTafsir, translationId, tafsirId, quranApi, glyphLoader, ayahPages, prefs.arabic],
  );

  useEffect(() => {
    loadAround(ayah);
  }, [loadAround, ayah]);

  const retry = (id: string) => {
    requested.current.delete(id);
    setContent((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    loadAround(ayah);
  };

  // Move the scroller to the current panel (on open, surah change, buttons, recitation).
  const scrollToAyah = useCallback((n: number, smooth: boolean) => {
    const scroller = scrollerRef.current;
    const panel = scroller?.children[n - 1] as HTMLElement | undefined;
    if (!scroller || !panel) return;
    programmaticRef.current = true;
    scroller.scrollTo({ left: panel.offsetLeft - (scroller.clientWidth - panel.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
    window.setTimeout(() => {
      programmaticRef.current = false;
    }, smooth ? 450 : 50);
  }, []);

  useLayoutEffect(() => {
    scrollToAyah(parseAyahKey(current).ayah, false);
    // Only when the surah changes; moves within a surah scroll themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah]);

  const goTo = useCallback(
    (target: AyahKey, smooth = true) => {
      const t = parseAyahKey(target);
      setCurrent(target);
      if (t.surah === surah) scrollToAyah(t.ayah, smooth);
    },
    [surah, scrollToAyah],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (dir === 1) {
        if (ayah < total) goTo(`${surah}:${ayah + 1}`);
        else if (surah < 114) goTo(`${surah + 1}:1`);
      } else if (ayah > 1) {
        goTo(`${surah}:${ayah - 1}`);
      } else if (surah > 1) {
        const prev = surahs.find((s) => s.number === surah - 1);
        if (prev) goTo(`${prev.number}:${prev.ayahs}`);
      }
    },
    [ayah, total, surah, surahs, goTo],
  );

  // Follow the recitation while the reader is open.
  const lastPlaying = useRef(playingAyah);
  useEffect(() => {
    if (!playingAyah || playingAyah === lastPlaying.current) return;
    lastPlaying.current = playingAyah;
    goTo(playingAyah);
  }, [playingAyah, goTo]);

  // Swiping: the panel nearest the scroller's centre becomes current.
  const onScroll = () => {
    if (programmaticRef.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const mid = scroller.getBoundingClientRect().left + scroller.clientWidth / 2;
    let best = ayah;
    let bestDist = Infinity;
    const children = scroller.children;
    // Only panels near the current one can be under the centre after a swipe.
    for (let n = Math.max(1, ayah - 3); n <= Math.min(total, ayah + 3); n++) {
      const rect = (children[n - 1] as HTMLElement).getBoundingClientRect();
      const dist = Math.abs(rect.left + rect.width / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    if (best !== ayah) setCurrent(`${surah}:${best}`);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "SELECT" || target.tagName === "INPUT")) return;
      if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "Escape") onClose(current);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose, current]);

  const activeTafsir = tafsirs.find((t) => t.id === tafsirId);
  const tafsirArabic = activeTafsir?.language === "arabic";
  const panels = useMemo(() => Array.from({ length: total }, (_, i) => i + 1), [total]);

  const renderBlock = (id: string, label: string, arabic: boolean) => {
    const state = content.get(id);
    return (
      <section className="reader__block">
        <h3 className="reader__block-title">{label}</h3>
        {!state || state.status === "loading" ? (
          <div className="study-drawer__loading" aria-busy="true">
            <div className="study-drawer__skeleton-line" />
            <div className="study-drawer__skeleton-line study-drawer__skeleton-line--short" />
          </div>
        ) : state.status === "error" ? (
          <div className="study-drawer__error">
            <p>{tr("Tidak dapat dimuat. Periksa koneksi internet.", "Could not load. Check your internet connection.")}</p>
            <button type="button" className="study-drawer__retry-btn" onClick={() => retry(id)}>
              {tr("Coba lagi", "Retry")}
            </button>
          </div>
        ) : (
          <div
            className={`reader__text ${arabic ? "reader__text--arabic" : ""}`}
            dir={arabic ? "rtl" : "ltr"}
            lang={arabic ? "ar" : undefined}
            dangerouslySetInnerHTML={{
              __html: state.html || `<p>${tr("Tidak tersedia untuk ayat ini.", "Not available for this ayah.")}</p>`,
            }}
          />
        )}
      </section>
    );
  };

  return (
    <div
      className="reader"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Baca terjemahan dan tafsir", "Read translation and tafsir")}
    >
      <header className="reader__bar">
        <button type="button" className="reader__icon-btn" onClick={() => onClose(current)} aria-label={tr("Tutup", "Close")}>
          ×
        </button>
        <div className="reader__heading">
          <span className="reader__surah">{surahInfo?.name ?? `Surah ${surah}`}</span>
          <span className="reader__count">
            {tr("Ayat", "Ayah")} {ayah} / {total}
          </span>
        </div>
        <button
          type="button"
          className="reader__icon-btn"
          onClick={() => onPlayAyah(current)}
          aria-label={tr(`Putar ayat ${ayah}`, `Play ayah ${ayah}`)}
          title={tr("Putar dari ayat ini", "Play from this ayah")}
        >
          ▶
        </button>
        <button
          type="button"
          className={`reader__icon-btn ${settingsOpen ? "reader__icon-btn--on" : ""}`}
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          aria-label={tr("Pengaturan tampilan", "Display settings")}
          title={tr("Pengaturan tampilan", "Display settings")}
        >
          Aa
        </button>
      </header>

      <div className="reader__views" role="tablist" aria-label={tr("Tampilkan", "Show")}>
        {(
          [
            ["terjemahan", tr("Terjemahan", "Translation")],
            ["tafsir", "Tafsir"],
            ["keduanya", tr("Keduanya", "Both")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={prefs.view === value}
            className={`reader__view ${prefs.view === value ? "reader__view--on" : ""}`}
            onClick={() => updatePrefs({ view: value })}
          >
            {label}
          </button>
        ))}
      </div>

      {settingsOpen && (
        <div className="reader__settings">
          <div className="reader__setting">
            <span>{tr("Terjemahan", "Translation")}</span>
            <GlassSelect
              ariaLabel={tr("Pilih Terjemahan", "Select Translation")}
              value={String(translationId)}
              options={translations.map((t) => ({ value: String(t.id), label: t.name }))}
              onChange={(val) => onChangeTranslation(Number(val))}
            />
          </div>
          <div className="reader__setting">
            <span>Tafsir</span>
            <GlassSelect
              ariaLabel={tr("Pilih Tafsir", "Select Tafsir")}
              value={tafsirId}
              options={tafsirs.map((t) => ({ value: t.id, label: t.name }))}
              onChange={onChangeTafsir}
            />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.arabic}
            className="reader__setting reader__setting--check"
            onClick={() => updatePrefs({ arabic: !prefs.arabic })}
          >
            <span>{tr("Tampilkan teks Arab", "Show Arabic text")}</span>
            <span className={`app-menu__switch ${prefs.arabic ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="reader__scroller" ref={scrollerRef} onScroll={onScroll}>
        {panels.map((n) => {
          const key = `${surah}:${n}` as AyahKey;
          const near = Math.abs(n - ayah) <= LOAD_WINDOW;
          const runs = glyphs.get(key);
          return (
            <article key={key} className="reader__panel" aria-hidden={n !== ayah} aria-label={`${tr("Ayat", "Ayah")} ${n}`}>
              {near && (
                <div className="reader__panel-inner">
                  {prefs.arabic && (
                    <p className="reader__arabic" dir="rtl" lang="ar">
                      {runs
                        ? runs.map((run, i) => (
                            <span key={i} style={{ fontFamily: `"${run.fontFamily}"` }}>
                              {run.codes.join(" ")}
                            </span>
                          ))
                        : null}
                    </p>
                  )}
                  {showTranslation &&
                    renderBlock(
                      `t:${translationId}:${key}`,
                      translations.find((t) => t.id === translationId)?.name ?? tr("Terjemahan", "Translation"),
                      false,
                    )}
                  {showTafsir && renderBlock(`f:${tafsirId}:${key}`, activeTafsir?.name ?? "Tafsir", tafsirArabic)}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <footer className="reader__nav">
        <button
          type="button"
          className="reader__nav-btn"
          onClick={() => step(-1)}
          disabled={surah === 1 && ayah === 1}
        >
          {tr("‹ Sebelumnya", "‹ Previous")}
        </button>
        <button
          type="button"
          className="reader__nav-btn reader__nav-btn--next"
          onClick={() => step(1)}
          disabled={surah === 114 && ayah === total}
        >
          {ayah === total && surah < 114
            ? tr("Surah berikutnya ›", "Next surah ›")
            : tr("Berikutnya ›", "Next ›")}
        </button>
      </footer>
    </div>
  );
}
