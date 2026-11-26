import { useEffect, useMemo, useRef, useState } from "react";
import type { AyahKey, Catalog, MushafMap } from "../data/types";
import { createQuranSearch, type QuranSearch, type RefV2Data } from "../services/arabic-search";
import { clampPage, MAX_PAGE, MIN_PAGE } from "../state/reader-logic";

export type PaletteTab = "surah" | "juz" | "page" | "search" | "bookmarks";

export interface NavPaletteProps {
  open: boolean;
  initialTab: PaletteTab;
  catalog: Catalog;
  mushafMap: MushafMap;
  currentPage: number;
  bookmarks: AyahKey[];
  notes: Record<AyahKey, string>;
  onClose: () => void;
  onJumpToPage: (page: number) => void;
  onJumpToAyah: (ayah: AyahKey) => void;
  onToggleBookmark: (ayah: AyahKey) => void;
}

const TABS: { id: PaletteTab; label: string }[] = [
  { id: "surah", label: "Surah" },
  { id: "juz", label: "Juz" },
  { id: "page", label: "Halaman" },
  { id: "search", label: "Cari Ayat" },
  { id: "bookmarks", label: "Bookmark & Catatan" },
];

const QUICK_PAGES = [
  { label: "Al-Fatihah (1)", page: 1 },
  { label: "Al-Kahfi (293)", page: 293 },
  { label: "Yasin (440)", page: 440 },
  { label: "Al-Mulk (562)", page: 562 },
  { label: "Juz Amma (582)", page: 582 },
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
  bookmarks,
  notes,
  onClose,
  onJumpToPage,
  onJumpToAyah,
  onToggleBookmark,
}: NavPaletteProps) {
  const [tab, setTab] = useState<PaletteTab>(initialTab);
  const [query, setQuery] = useState("");
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [searchEngine, setSearchEngine] = useState<QuranSearch | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        if (!cancelled) setSearchError("Gagal memuat indeks pencarian ayat.");
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, searchEngine, catalog]);

  const filteredSurahs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.surahs;
    return catalog.surahs.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.arabicName.includes(query.trim()) ||
        String(s.number) === q,
    );
  }, [catalog.surahs, query]);

  const searchHits = useMemo(() => {
    if (tab !== "search" || !searchEngine || !query.trim()) return [];
    return searchEngine.search(query, 35);
  }, [tab, searchEngine, query]);

  const savedEntries = useMemo(() => {
    const keys = new Set<AyahKey>([
      ...bookmarks,
      ...(Object.keys(notes) as AyahKey[]),
    ]);
    return Array.from(keys).map((key) => {
      const [sStr, aStr] = key.split(":");
      const surahNum = Number(sStr);
      const ayahNum = Number(aStr);
      const surah = surahByNumber.get(surahNum);
      return {
        key,
        surahName: surah?.name ?? `Surah ${surahNum}`,
        ayahNum,
        page: mushafMap.ayahToPage[key] ?? surah?.page ?? 1,
        isBookmarked: bookmarks.includes(key),
        note: notes[key] ?? "",
      };
    });
  }, [bookmarks, notes, surahByNumber, mushafMap.ayahToPage]);

  if (!open) return null;

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Navigasi Mushaf"
      onClick={onClose}
    >
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette__tabs" role="tablist">
          {TABS.map((item) => (
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
              {item.label}
            </button>
          ))}
        </div>

        {(tab === "surah" || tab === "search") && (
          <div className="palette__search-bar">
            <input
              ref={inputRef}
              type="text"
              className="palette__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "surah"
                  ? "Cari nama atau nomor surah..."
                  : "Ketik potongan ayat Arab (tanpa harakat) atau nama surah..."
              }
            />
          </div>
        )}

        <div className="palette__body">
          {tab === "surah" && (
            <div className="palette__list">
              {filteredSurahs.map((surah) => (
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
                        {surah.ayahs} ayat · Hal. {surah.page}
                      </div>
                    </div>
                  </div>
                  <span className="palette__arabic">{surah.arabicName}</span>
                </button>
              ))}
              {filteredSurahs.length === 0 && (
                <div className="palette__empty">Surah tidak ditemukan.</div>
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
                    <div className="palette__item-sub">Halaman {juz.page}</div>
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
                  aria-label="Nomor halaman (1 sampai 604)"
                />
                <button type="submit" className="palette__submit">
                  Buka
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
                    {qp.label}
                  </button>
                ))}
              </div>
            </form>
          )}

          {tab === "search" && (
            <div className="palette__list">
              {searchLoading && (
                <div className="palette__empty">Memuat indeks pencarian ayat...</div>
              )}
              {searchError && <div className="palette__empty">{searchError}</div>}
              {!searchLoading && !searchError && !query.trim() && (
                <div className="palette__empty">
                  Ketik kata kunci Arab seperti &ldquo;الرحمن&rdquo; atau nama surah untuk mencari.
                </div>
              )}
              {!searchLoading &&
                !searchError &&
                query.trim().length > 0 &&
                searchHits.length === 0 && (
                  <div className="palette__empty">Tidak ada ayat atau surah yang cocok.</div>
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
                        <div className="palette__item-title">{hit.name}</div>
                        <div className="palette__item-sub">Surah · Hal. {hit.page}</div>
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
                        {hit.surahName} : {hit.ayah}
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
                  Belum ada bookmark atau catatan. Klik ayat pada Mushaf untuk menandai.
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
                      Hal. {entry.page}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </div>
                  </button>
                  {entry.isBookmarked && (
                    <button
                      type="button"
                      className="palette__chip"
                      onClick={() => onToggleBookmark(entry.key)}
                    >
                      Hapus
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
