import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngineEvent } from "@tilawa/core";
import type { AyahKey, Catalog, MushafMap } from "../data/types";
import {
  createQuranSearch,
  matchesSurahName,
  type QuranSearch,
  type RefV2Data,
} from "../services/arabic-search";
import type { TilawaController } from "../services/tilawa-controller";
import { clampPage, MAX_PAGE, MIN_PAGE } from "../state/reader-logic";
import { getSurahEnglishMeaning } from "../data/surah-names";
import { useI18n } from "../i18n";

export type PaletteTab = "surah" | "juz" | "page" | "search" | "bookmarks";

export interface NavPaletteProps {
  open: boolean;
  initialTab: PaletteTab;
  catalog: Catalog;
  mushafMap: MushafMap;
  currentPage: number;
  recentPages?: number[];
  bookmarks: AyahKey[];
  notes: Record<AyahKey, string>;
  /** Optional Tasmi' controller enabling on-device voice search in the Cari Ayat tab. */
  tilawaController?: TilawaController;
  onClose: () => void;
  onJumpToPage: (page: number) => void;
  onJumpToAyah: (ayah: AyahKey, opts?: { fromVoice?: boolean }) => void;
  onToggleBookmark: (ayah: AyahKey) => void;
}

const TABS: { id: PaletteTab; label: string }[] = [
  { id: "surah", label: "Surah" },
  { id: "juz", label: "Juz" },
  { id: "page", label: "Halaman" },
  { id: "search", label: "Cari Ayat" },
  { id: "bookmarks", label: "Bookmark" },
];

const QUICK_PAGES = [
  { id: "Al-Fatihah (1)", en: "Al-Fatiha (1)", page: 1 },
  { id: "Al-Kahfi (293)", en: "Al-Kahf (293)", page: 293 },
  { id: "Yasin (440)", en: "Ya-Sin (440)", page: 440 },
  { id: "Al-Mulk (562)", en: "Al-Mulk (562)", page: 562 },
  { id: "Juz Amma (582)", en: "Juz Amma (582)", page: 582 },
];

let cachedSearchPromise: Promise<QuranSearch> | null = null;

function loadQuranSearch(catalog: Catalog): Promise<QuranSearch> {
  if (!cachedSearchPromise) {
    cachedSearchPromise = import("@tilawa/core/assets/ref-v2.json")
      .then((mod) => {
        const refData = (mod.default ?? mod) as unknown as RefV2Data;
        return createQuranSearch(refData, catalog.surahs);
      })
      .catch((err) => {
        cachedSearchPromise = null;
        throw err;
      });
  }
  return cachedSearchPromise;
}

export function NavPalette({
  open,
  initialTab,
  catalog,
  mushafMap,
  currentPage,
  recentPages = [],
  bookmarks,
  notes,
  tilawaController,
  onClose,
  onJumpToPage,
  onJumpToAyah,
  onToggleBookmark,
}: NavPaletteProps) {
  const { isEn, tr } = useI18n();
  const [tab, setTab] = useState<PaletteTab>(initialTab);
  const [query, setQuery] = useState("");
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [searchEngine, setSearchEngine] = useState<QuranSearch | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "loading" | "listening">("idle");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const voiceActiveRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stopVoiceSearch = useCallback(() => {
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      void tilawaController?.stop().catch(() => undefined);
    }
    setVoiceState("idle");
    setVoiceStatus(null);
  }, [tilawaController]);

  useEffect(() => {
    if (!open || tab !== "search") {
      stopVoiceSearch();
      setVoiceError(null);
    }
  }, [open, tab, stopVoiceSearch]);

  useEffect(() => stopVoiceSearch, [stopVoiceSearch]);

  const handleToggleVoiceSearch = useCallback(async () => {
    if (!tilawaController) return;
    if (voiceState !== "idle") {
      stopVoiceSearch();
      return;
    }
    setVoiceError(null);
    setVoiceState("loading");
    setVoiceStatus(tr("Menyiapkan pencarian suara…", "Preparing voice search…"));
    const abort = new AbortController();
    voiceAbortRef.current = abort;
    try {
      await tilawaController.ensureReady((p) => {
        if (abort.signal.aborted) return;
        const pct = Math.round(p.fraction * 100);
        setVoiceStatus(
          p.stage === "model"
            ? p.fromCache
              ? tr(`Memuat model (${pct}%)…`, `Loading model (${pct}%)…`)
              : tr(`Mengunduh model suara (${pct}%)…`, `Downloading speech model (${pct}%)…`)
            : tr("Menyiapkan mesin suara…", "Preparing speech engine…"),
        );
      }, abort.signal);
      if (abort.signal.aborted) return;

      voiceActiveRef.current = true;
      setVoiceState("listening");
      setVoiceStatus(
        tr(
          "Bacakan potongan ayat… otomatis lompat saat dikenali",
          "Recite part of an ayah… jumps automatically once recognized",
        ),
      );

      await tilawaController.startFree((event: EngineEvent) => {
        if (abort.signal.aborted || !voiceActiveRef.current) return;
        if (event.type === "position" && event.state === "locked" && event.observed[0]) {
          const { surah, ayah } = event.observed[0].word;
          stopVoiceSearch();
          onJumpToAyah(`${surah}:${ayah}`, { fromVoice: true });
          onClose();
        }
      });
    } catch (err) {
      if (!abort.signal.aborted) {
        setVoiceError(
          err instanceof Error
            ? err.message
            : tr("Gagal memulai pencarian suara.", "Failed to start voice search."),
        );
      }
      stopVoiceSearch();
    }
  }, [tilawaController, voiceState, stopVoiceSearch, onJumpToAyah, onClose, tr]);

  const surahByNumber = useMemo(() => {
    const map = new Map<number, Catalog["surahs"][number]>();
    for (const s of catalog.surahs) map.set(s.number, s);
    return map;
  }, [catalog.surahs]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setQuery("");
    setPageInput(String(currentPage));
  }, [open, initialTab, currentPage]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lazily load 4.7MB ref-v2.json only when the user visits the Cari Ayat tab
  useEffect(() => {
    if (!open || tab !== "search" || searchEngine) return;
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    loadQuranSearch(catalog)
      .then((engine) => {
        if (!cancelled) setSearchEngine(engine);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchError(tr("Gagal memuat indeks pencarian ayat.", "Failed to load ayah search index."));
        }
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, searchEngine, catalog, tr]);

  const filteredSurahs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.surahs;
    return catalog.surahs.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        matchesSurahName(s, q) ||
        s.arabicName.includes(query.trim()) ||
        String(s.number) === q,
    );
  }, [catalog.surahs, query]);

  const searchHits = useMemo(() => {
    if (tab !== "search" || !searchEngine || !query.trim()) return [];
    return searchEngine.search(query, 35);
  }, [tab, searchEngine, query]);

  const recentItems = useMemo(() => {
    const pages = recentPages.length > 0 ? recentPages : [currentPage];
    const pagePrefix = tr("Hal.", "p.");
    return pages.slice(0, 5).map((p) => {
      const entry = mushafMap.pages[p - 1];
      const surahId = entry?.surahs?.[0];
      const surahName = surahId ? surahByNumber.get(surahId)?.name : undefined;
      return {
        page: p,
        label: surahName ? `${surahName} · ${pagePrefix} ${p}` : `${pagePrefix} ${p}`,
      };
    });
  }, [recentPages, currentPage, mushafMap.pages, surahByNumber, tr]);

  const savedEntries = useMemo(
    () =>
      bookmarks.map((key) => {
        const [sStr, aStr] = key.split(":");
        const surahNum = Number(sStr);
        const surah = surahByNumber.get(surahNum);
        return {
          key,
          surahName: surah?.name ?? `Surah ${surahNum}`,
          ayahNum: Number(aStr),
          page: mushafMap.ayahToPage[key] ?? surah?.page ?? 1,
          note: notes[key] ?? "",
        };
      }),
    [bookmarks, notes, surahByNumber, mushafMap.ayahToPage],
  );

  if (!open) return null;

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Navigasi Mushaf", "Mushaf Navigation")}
      onClick={onClose}
    >
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette__tabs" role="tablist">
          {TABS.map((item) => {
            const label =
              item.id === "page"
                ? tr("Halaman", "Page")
                : item.id === "search"
                  ? tr("Cari Ayat", "Search")
                  : item.id === "bookmarks"
                    ? tr("Bookmark", "Bookmarks")
                    : item.label;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`palette__tab ${tab === item.id ? "palette__tab--active" : ""}`}
                onClick={() => {
                  setTab(item.id);
                  setQuery("");
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {(tab === "surah" || tab === "search") && (
          <div className="palette__search-bar">
            <div className="palette__search-row">
              <input
                ref={inputRef}
                type="text"
                className="palette__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  tab === "surah"
                    ? tr("Cari nama atau nomor surah...", "Search surah name or number...")
                    : tr("Ketik potongan ayat Arab (tanpa harakat) atau nama surah...", "Type Arabic words or surah name...")
                }
              />
              {tab === "search" && tilawaController && (
                <button
                  type="button"
                  className={`palette__voice-btn ${voiceState !== "idle" ? "palette__voice-btn--active" : ""}`}
                  onClick={() => void handleToggleVoiceSearch()}
                  aria-pressed={voiceState !== "idle"}
                  aria-label={
                    voiceState !== "idle"
                      ? tr("Hentikan pencarian suara", "Stop voice search")
                      : tr("Cari ayat dengan suara", "Search ayah by voice")
                  }
                  title={tr("Cari ayat dengan suara (on-device)", "Voice search (on-device)")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
                  </svg>
                  <span>{voiceState === "listening" ? "Stop" : voiceState === "loading" ? "…" : tr("Suara", "Voice")}</span>
                </button>
              )}
            </div>
            {tab === "search" && voiceStatus && (
              <div className="palette__voice-status" role="status" aria-live="polite">
                {voiceStatus}
              </div>
            )}
            {tab === "search" && voiceError && (
              <div className="palette__voice-error" role="alert">
                {voiceError}
              </div>
            )}
          </div>
        )}

        <div className="palette__body">
          {tab === "surah" && (
            <div className="palette__list">
              {filteredSurahs.map((surah) => {
                const meaning = isEn ? getSurahEnglishMeaning(surah.number) : "";
                return (
                  <button
                    key={surah.number}
                    type="button"
                    className="palette__item"
                    onClick={() => {
                      onJumpToPage(surah.page);
                      onClose();
                    }}
                  >
                    <div className="palette__item-main">
                      <span className="palette__num">{surah.number}</span>
                      <div>
                        <div className="palette__item-title">{surah.name}</div>
                        <div className="palette__item-sub">
                          {meaning ? `${meaning} · ` : ""}
                          {surah.ayahs} {tr("ayat", "ayahs")} · {tr("Hal.", "p.")} {surah.page}
                        </div>
                      </div>
                    </div>
                    <span className="palette__arabic">{surah.arabicName}</span>
                  </button>
                );
              })}
              {filteredSurahs.length === 0 && (
                <div className="palette__empty">{tr("Surah tidak ditemukan.", "No matching surah found.")}</div>
              )}
            </div>
          )}

          {tab === "juz" && (
            <div className="palette__juz-grid">
              {catalog.juzs.map((juz) => {
                const startSurah = surahByNumber.get(juz.startSurah);
                return (
                  <button
                    key={juz.number}
                    type="button"
                    className="palette__juz-card"
                    onClick={() => {
                      onJumpToPage(juz.page);
                      onClose();
                    }}
                  >
                    <div className="palette__item-title">Juz {juz.number}</div>
                    <div className="palette__item-sub">
                      {startSurah?.name ?? `Surah ${juz.startSurah}`} : {juz.startAyah}
                    </div>
                    <div className="palette__item-sub">
                      {tr("Halaman", "Page")} {juz.page}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "page" && (
            <form
              className="palette__page-form"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = Number(pageInput);
                if (Number.isFinite(parsed)) {
                  onJumpToPage(clampPage(parsed));
                  onClose();
                }
              }}
            >
              <div className="palette__page-row">
                <input
                  ref={inputRef}
                  type="number"
                  min={MIN_PAGE}
                  max={MAX_PAGE}
                  className="palette__input"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  aria-label={tr("Nomor halaman (1 sampai 604)", "Page number (1 to 604)")}
                />
                <button type="submit" className="palette__submit">
                  {tr("Buka", "Go")}
                </button>
              </div>
              <div className="palette__quick-links">
                {QUICK_PAGES.map((qp) => (
                  <button
                    key={qp.page}
                    type="button"
                    className="palette__chip"
                    onClick={() => {
                      onJumpToPage(qp.page);
                      onClose();
                    }}
                  >
                    {tr(qp.id, qp.en)}
                  </button>
                ))}
              </div>
            </form>
          )}

          {tab === "search" && (
            <div className="palette__list">
              {!query.trim() && recentItems.length > 0 && (
                <div className="palette__recent">
                  <div className="palette__section-label">{tr("Terakhir dibaca", "Recently read")}</div>
                  <div className="palette__quick-links">
                    {recentItems.map((item) => (
                      <button
                        key={item.page}
                        type="button"
                        className="palette__chip"
                        onClick={() => {
                          onJumpToPage(item.page);
                          onClose();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {searchLoading && (
                <div className="palette__empty">
                  {tr("Memuat indeks pencarian ayat...", "Loading ayah search index...")}
                </div>
              )}
              {searchError && <div className="palette__empty">{searchError}</div>}
              {!searchLoading && !searchError && !query.trim() && (
                <div className="palette__empty">
                  {tr(
                    'Ketik kata kunci Arab seperti "الرحمن" atau nama surah untuk mencari.',
                    'Type Arabic keywords like "الرحمن" or a surah name to search.',
                  )}
                </div>
              )}
              {!searchLoading &&
                !searchError &&
                query.trim().length > 0 &&
                searchHits.length === 0 && (
                  <div className="palette__empty">
                    {tr("Tidak ada ayat atau surah yang cocok.", "No matching ayahs or surahs found.")}
                  </div>
                )}
              {searchHits.map((hit, idx) =>
                hit.type === "surah" ? (
                  <button
                    key={`surah-${hit.surah}-${idx}`}
                    type="button"
                    className="palette__item"
                    onClick={() => {
                      onJumpToPage(hit.page);
                      onClose();
                    }}
                  >
                    <div className="palette__item-main">
                      <span className="palette__num">{hit.surah}</span>
                      <div>
                        <div className="palette__item-title">
                          {surahByNumber.get(hit.surah)?.name ?? hit.name}
                        </div>
                        <div className="palette__item-sub">
                          {isEn && getSurahEnglishMeaning(hit.surah)
                            ? `${getSurahEnglishMeaning(hit.surah)} · p. ${hit.page}`
                            : `Surah · ${tr("Hal.", "p.")} ${hit.page}`}
                        </div>
                      </div>
                    </div>
                    <span className="palette__arabic">{hit.arabicName}</span>
                  </button>
                ) : (
                  <button
                    key={`ayah-${hit.surah}:${hit.ayah}-${idx}`}
                    type="button"
                    className="palette__item"
                    onClick={() => {
                      onJumpToAyah(`${hit.surah}:${hit.ayah}`);
                      onClose();
                    }}
                  >
                    <div style={{ width: "100%" }}>
                      <div className="palette__item-sub" style={{ marginBottom: 4 }}>
                        {surahByNumber.get(hit.surah)?.name ?? hit.surahName} : {hit.ayah}
                      </div>
                      <div className="palette__arabic-hit">{hit.text}</div>
                    </div>
                  </button>
                ),
              )}
            </div>
          )}

          {tab === "bookmarks" && (
            <div className="palette__list">
              {savedEntries.length === 0 && (
                <div className="palette__empty">
                  {tr(
                    "Belum ada bookmark. Ketuk ayat pada mushaf untuk menandainya.",
                    "No bookmarks yet. Tap an ayah on the mushaf to bookmark it.",
                  )}
                </div>
              )}
              {savedEntries.map((entry) => (
                <div key={entry.key} className="palette__item" style={{ cursor: "default" }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onClick={() => {
                      onJumpToAyah(entry.key);
                      onClose();
                    }}
                  >
                    <div className="palette__item-title">
                      {entry.surahName} : {entry.ayahNum}
                    </div>
                    <div className="palette__item-sub">
                      {tr("Hal.", "p.")} {entry.page}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="palette__chip"
                    onClick={() => onToggleBookmark(entry.key)}
                  >
                    {tr("Hapus", "Remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
