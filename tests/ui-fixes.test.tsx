import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import type { Catalog, MushafMap, TasmiSessionRecord } from "../src/data/types";
import { AudioDock } from "../src/components/AudioDock";
import { GlyphPageBody } from "../src/components/GlyphPageBody";
import { NavPalette } from "../src/components/NavPalette";
import { RecitationRibbon } from "../src/components/RecitationRibbon";
import { isCrossOriginHttpUrl, MushafPage } from "../src/components/MushafPage";
import { DEFAULT_SCOPE } from "../src/services/audio-controller";
import type { GlyphPageLoader } from "../src/services/glyph-pages";
import { MushafSpread } from "../src/components/MushafSpread";
import { TasmiSheet } from "../src/components/TasmiSheet";
import { TasmiSummaryModal } from "../src/components/TasmiSummaryModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8")) as Catalog;
const mushafMap = JSON.parse(fs.readFileSync("src/data/mushaf-map.json", "utf8")) as MushafMap;

let activeRoot: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(element: React.ReactElement) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    activeRoot = createRoot(container);
  }
  act(() => {
    activeRoot!.render(element);
  });
  return container;
}

afterEach(() => {
  if (activeRoot) {
    act(() => {
      activeRoot!.unmount();
    });
    activeRoot = null;
  }
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe("isCrossOriginHttpUrl", () => {
  it("returns true only for cross-origin http(s) URLs", () => {
    expect(isCrossOriginHttpUrl("https://cdn.example.com/mushaf/pages/001.gif")).toBe(true);
    expect(isCrossOriginHttpUrl("http://cdn.example.com/001.gif")).toBe(true);
    expect(isCrossOriginHttpUrl("/mushaf/pages/001.gif")).toBe(false);
    expect(isCrossOriginHttpUrl("asset://localhost/app/001.gif")).toBe(false);
    expect(isCrossOriginHttpUrl("tauri://localhost/001.gif")).toBe(false);
    expect(isCrossOriginHttpUrl("http://asset.localhost/001.gif")).toBe(false);
    expect(isCrossOriginHttpUrl(`${window.location.origin}/mushaf/pages/001.gif`)).toBe(false);
  });
});

describe("MushafPage fallback and crossOrigin", () => {
  it("sets crossOrigin=anonymous only on cross-origin HTTP(S) images and recovers via Coba lagi", () => {
    const onRetryPage = vi.fn();
    const el = mount(
      <MushafPage
        pageEntry={mushafMap.pages[0]}
        imageUrl="https://cdn.example.com/mushaf/pages/001.gif"
        selectedAyah={null}
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set()}
        onSelectAyah={() => {}}
        onRetryPage={onRetryPage}
      />,
    );

    const img = el.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("crossorigin")).toBe("anonymous");
    expect(el.querySelector(".mushaf-page__skeleton")).not.toBeNull();

    // Trigger image load error
    act(() => {
      img.dispatchEvent(new Event("error"));
    });

    expect(el.querySelector(".mushaf-page__skeleton")).toBeNull();
    expect(el.textContent).toContain("Halaman belum tersedia offline");
    const retryBtn = el.querySelector(".mushaf-page__retry-btn") as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();

    // Click Coba lagi -> clears error and invokes retry callback
    act(() => {
      retryBtn.click();
    });
    expect(onRetryPage).toHaveBeenCalledWith(1);
    expect(el.querySelector(".mushaf-page__error")).toBeNull();
    expect(el.querySelector("img")).not.toBeNull();

    // Local / asset URL must NOT set crossOrigin
    mount(
      <MushafPage
        pageEntry={mushafMap.pages[0]}
        imageUrl="asset://localhost/mushaf/pages/001.gif"
        selectedAyah={null}
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set()}
        onSelectAyah={() => {}}
      />,
    );
    const localImg = el.querySelector("img") as HTMLImageElement;
    expect(localImg.getAttribute("crossorigin")).toBeNull();
  });
});

describe("MushafSpread modal shortcut guard", () => {
  it("ignores ArrowLeft, ArrowRight, and F shortcuts when isModalOpen is true", () => {
    const onTurnPage = vi.fn();
    const onToggleFocus = vi.fn();

    mount(
      <MushafSpread
        rightPageEntry={mushafMap.pages[0]}
        leftPageEntry={null}
        pageUrls={{ 1: "/mushaf/pages/001.gif" }}
        selectedAyah={null}
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set()}
        canGoPrev={false}
        canGoNext={true}
        isModalOpen={true}
        getPageImageUrl={async (p) => `/mushaf/pages/${String(p).padStart(3, "0")}.gif`}
        onTurnPage={onTurnPage}
        onSelectAyah={() => {}}
        onClearSelection={() => {}}
        onToggleFocus={onToggleFocus}
        onTogglePalette={() => {}}
      />,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    });

    expect(onTurnPage).not.toHaveBeenCalled();
    expect(onToggleFocus).not.toHaveBeenCalled();
  });
});

describe("TasmiSheet and TasmiSummaryModal fixes", () => {
  it("falls back to custom non-inverted range when initialAyah is outside visible page candidates", () => {
    const onStartMemorization = vi.fn();
    // Page 4 covers Al-Baqara ayahs 17..24; initialAyah 2:255 is out of page bounds
    const el = mount(
      <TasmiSheet
        open={true}
        visiblePages={[mushafMap.pages[3]]}
        surahs={catalog.surahs}
        initialAyah="2:255"
        historyCount={0}
        loadingProgress={null}
        isStarting={false}
        error={null}
        onClose={() => {}}
        onCancelLoad={() => {}}
        onStartFree={() => {}}
        onStartMemorization={onStartMemorization}
        onOpenHistory={() => {}}
      />,
    );

    const startBtn = el.querySelector(".tasmi-sheet__start-btn") as HTMLButtonElement;
    act(() => {
      startBtn.click();
    });

    expect(onStartMemorization).toHaveBeenCalledWith(
      { surah: 2, fromAyah: 255, toAyah: 286 },
      true,
      "murajaah",
    );
  });

  it("lets Uji Acak select a Juz or Surah range and passes RandomPool to onStartRandom", () => {
    const onStartRandom = vi.fn();
    const el = mount(
      <TasmiSheet
        open={true}
        visiblePages={[mushafMap.pages[581]]}
        surahs={catalog.surahs}
        currentJuz={30}
        initialAyah="78:1"
        historyCount={0}
        loadingProgress={null}
        isStarting={false}
        error={null}
        onClose={() => {}}
        onCancelLoad={() => {}}
        onStartFree={() => {}}
        onStartMemorization={() => {}}
        onStartRandom={onStartRandom}
        onOpenHistory={() => {}}
      />,
    );

    const tabs = el.querySelectorAll('[role="tab"]');
    act(() => {
      (tabs[1] as HTMLButtonElement).click();
    });

    const startBtn = el.querySelector(".tasmi-sheet__start-btn") as HTMLButtonElement;
    act(() => {
      startBtn.click();
    });
    expect(onStartRandom).toHaveBeenLastCalledWith(
      { kind: "juz", fromJuz: 30, toJuz: 30 },
      true,
    );

    const scopeBtns = el.querySelectorAll('[aria-label="Jenis rentang uji acak"] button');
    act(() => {
      (scopeBtns[1] as HTMLButtonElement).click();
    });
    act(() => {
      startBtn.click();
    });
    expect(onStartRandom).toHaveBeenLastCalledWith(
      { kind: "surah", fromSurah: 78, toSurah: 78, fromAyah: 1, toAyah: 40 },
      true,
    );
  });

  it("does not reset user tab or selected record when history prop updates while open", () => {
    const older: TasmiSessionRecord = {
      id: "old-1",
      startedAt: "2026-11-25T10:00:00Z",
      durationSec: 60,
      surah: 1,
      fromAyah: 1,
      toAyah: 7,
      mistakes: [],
    };
    const newer: TasmiSessionRecord = {
      id: "new-2",
      startedAt: "2026-11-26T10:00:00Z",
      durationSec: 45,
      surah: 112,
      fromAyah: 1,
      toAyah: 4,
      mistakes: [],
    };

    const el = mount(
      <TasmiSummaryModal
        open={true}
        initialTab="summary"
        record={newer}
        history={[older]}
        surahs={catalog.surahs}
        getAyahWords={() => []}
        onClose={() => {}}
        onPlayAyah={() => {}}
        onJumpToAyah={() => {}}
      />,
    );

    // User switches to History tab before async addTasmiHistory finishes
    const tabs = el.querySelectorAll('[role="tab"]');
    act(() => {
      (tabs[1] as HTMLButtonElement).click();
    });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");

    // Simulate async history update from persistence
    mount(
      <TasmiSummaryModal
        open={true}
        initialTab="summary"
        record={newer}
        history={[newer, older]}
        surahs={catalog.surahs}
        getAyahWords={() => []}
        onClose={() => {}}
        onPlayAyah={() => {}}
        onJumpToAyah={() => {}}
      />,
    );

    const updatedTabs = el.querySelectorAll('[role="tab"]');
    expect(updatedTabs[1].getAttribute("aria-selected")).toBe("true");
  });
});

describe("AudioDock reciter display and switcher", () => {
  it("shows the active reciter name and switches reciters via the picker", () => {
    const onChangeReciter = vi.fn();
    const el = mount(
      <AudioDock
        audioState={{
          currentAyah: "1:1",
          isPlaying: false,
          isLoading: false,
          isBismillah: false,
          reciterId: catalog.reciters[0].id,
          repeatCount: 1,
          scope: DEFAULT_SCOPE,
          speed: 1,
          talaqqi: false,
          isTalaqqiPause: false,
          fromCache: false,
          error: null,
        }}
        activeAyah="1:1"
        surahName="Al-Fatiha"
        surahNumber={1}
        surahAyahCount={7}
        reciters={catalog.reciters}
        hidden={false}
        downloadProgress={null}
        isSurahDownloaded={false}
        onTogglePlay={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onChangeReciter={onChangeReciter}
        onCycleRepeat={() => {}}
        onCycleSpeed={() => {}}
        onChangeScope={() => {}}
        onDownloadSurah={() => {}}
        onOpenStudy={() => {}}
        onOpenTasmi={() => {}}
      />,
    );

    const reciterBtn = el.querySelector(".audio-dock__reciter-btn") as HTMLButtonElement;
    expect(reciterBtn).not.toBeNull();
    expect(reciterBtn.textContent).toContain(catalog.reciters[0].name);

    act(() => {
      reciterBtn.click();
    });

    const items = el.querySelectorAll(".reciter-menu__item");
    expect(items.length).toBe(catalog.reciters.length);
    expect(items[0].getAttribute("aria-checked")).toBe("true");

    act(() => {
      (items[1] as HTMLButtonElement).click();
    });

    expect(onChangeReciter).toHaveBeenCalledWith(catalog.reciters[1].id);
    expect(el.querySelector(".reciter-menu")).toBeNull();
  });
});

describe("RecitationRibbon QCF mushaf font", () => {
  it("renders words using the mushaf page QCFv1 glyph font when available", async () => {
    const loader: GlyphPageLoader = {
      load: async () => ({
        page: 1,
        fontFamily: "QCFv1-p1",
        lines: [
          {
            line: 1,
            words: [
              { code: "\uFB51", ayah: "1:1" },
              { code: "\uFB52", ayah: "1:1" },
              { code: "\uFB53", ayah: "1:1" },
              { code: "\uFB54", ayah: "1:1" },
              { code: "\uFB55", ayah: "1:1" }, // trailing ayah ornament
            ],
          },
        ],
        rows: [],
      }),
      prefetch: () => {},
    };

    const el = mount(
      <RecitationRibbon
        state={{
          mode: "free",
          passage: null,
          trackerState: "locked",
          activeAyah: "1:1",
          activeWord: { surah: 1, ayah: 1, word: 2 },
          revealedAyahs: new Set(["1:1"]),
          confirmedMistakes: [],
        }}
        surahs={catalog.surahs}
        blurActive={false}
        isPeeking={false}
        getAyahWords={() => ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"]}
        glyphLoader={loader}
        ayahToPage={mushafMap.ayahToPage}
        onStop={() => {}}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const wordEls = el.querySelectorAll<HTMLSpanElement>(".recitation-ribbon__word--qcf");
    expect(wordEls).toHaveLength(4);
    expect(wordEls[0].style.fontFamily).toContain("QCFv1-p1");
    expect(wordEls[0].textContent).toBe("\uFB51");
    expect(wordEls[1].classList.contains("recitation-ribbon__word--current")).toBe(true);
  });
});

describe("Gradual blur and recent pages in search", () => {
  it("leaves the first word unblurred when blurLevel is first-word", () => {
    const el = mount(
      <GlyphPageBody
        data={{
          page: 1,
          fontFamily: "QCFv1-p1",
          lines: [],
          rows: [
            {
              kind: "text",
              line: 1,
              words: [
                { code: "\uFB51", ayah: "1:1" },
                { code: "\uFB52", ayah: "1:1" },
                { code: "\uFB53", ayah: "1:1" },
              ],
            },
          ],
        }}
        pageEntry={mushafMap.pages[0]}
        selectedAyah={null}
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set()}
        blurSet={new Set(["1:1"])}
        blurLevel="first-word"
        onSelectAyah={() => {}}
      />,
    );

    const words = el.querySelectorAll(".glyph-word");
    expect(words).toHaveLength(3);
    expect(words[0].classList.contains("glyph-word--blurred")).toBe(false);
    expect(words[1].classList.contains("glyph-word--blurred")).toBe(true);
    expect(words[2].classList.contains("glyph-word--blurred")).toBe(true);
  });

  it("shows recent pages in the search tab when query is empty", () => {
    const onJumpToPage = vi.fn();
    const el = mount(
      <NavPalette
        open={true}
        initialTab="search"
        catalog={catalog}
        mushafMap={mushafMap}
        currentPage={1}
        recentPages={[593, 293]}
        bookmarks={[]}
        notes={{}}
        onClose={() => {}}
        onJumpToPage={onJumpToPage}
        onJumpToAyah={() => {}}
        onToggleBookmark={() => {}}
      />,
    );

    expect(el.textContent).toContain("Terakhir dibaca");
    const chips = el.querySelectorAll<HTMLButtonElement>(".palette__recent .palette__chip");
    expect(chips).toHaveLength(2);
    act(() => {
      chips[0].click();
    });
    expect(onJumpToPage).toHaveBeenCalledWith(593);
  });
});
