import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import type { Catalog, MushafMap, TasmiSessionRecord } from "../src/data/types";
import { AyahPopover } from "../src/components/AyahPopover";
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
import { TopBar } from "../src/components/TopBar";
import { SettingsModal } from "../src/components/SettingsModal";
import { PlaybackMenu } from "../src/components/PlaybackMenu";
import { LanguageProvider } from "../src/i18n";
import { formatDueLabel } from "../src/services/murajaah-srs";
import { formatErrorClass } from "../src/services/tasmi-logic";
import { formatBytes } from "../src/services/audio-downloads";
import { createWordTranslationLoader } from "../src/services/word-translations";
import { PLAIN_PLAYING_PALETTES } from "../src/services/glyph-pages";
import { getSurahDisplayName, getSurahEnglishMeaning } from "../src/data/surah-names";
import { matchesSurahName } from "../src/services/arabic-search";
import { HIDDEN_AYAH_TTL_MS, isHiddenAyahActive } from "../src/services/user-store";
import type { QuranApi } from "../src/services/quran-api";

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
        onOpenGuide={() => {}}
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
        onOpenGuide={() => {}}
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

describe("Full ayah translation inside AyahPopover", () => {
  it("shows the whole ayah's translation, without footnote markers, alongside ayah actions", async () => {
    const rect = { left: 100, top: 300, width: 40, height: 24, bottom: 324, right: 140 } as DOMRect;
    const getTranslation = vi.fn(async () => ({
      html: "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.<sup>1</sup>",
      fromCache: true,
    }));
    const quranApi = { getTranslation } as unknown as QuranApi;
    const el = mount(
      <AyahPopover
        ayah="1:1"
        surahName="Al-Fatihah"
        anchorRect={rect}
        quranApi={quranApi}
        translationId={33}
        getArabicText={async () => "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"}
        isBookmarked={false}
        highlightColor={null}
        onClose={() => {}}
        onToggleBookmark={() => {}}
        onSetHighlight={() => {}}
      />,
    );
    await act(async () => {});

    expect(getTranslation).toHaveBeenCalledWith(33, 1, 1, expect.anything());
    expect(el.querySelector(".ayah-popover__translation-text")?.textContent).toContain(
      "Dengan nama Allah Yang Maha Pengasih",
    );
    expect(el.querySelector(".ayah-popover__word")).toBeNull();
    expect(el.textContent).toContain("Putar dari sini");
    expect(el.textContent).toContain("Tafsir");
    expect(el.textContent).not.toContain("Tafsir & Terjemahan");
    expect(el.textContent).toContain("Tasmi' dari sini");

    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const copyBtn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Salin");
    await act(async () => {
      copyBtn?.click();
    });
    expect(writeText).toHaveBeenCalledWith(
      "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ\n\nDengan nama Allah Yang Maha Pengasih, Maha Penyayang.\n\nQS. Al-Fatihah: 1",
    );
    expect(copyBtn?.textContent).toBe("Tersalin");
  });

  it("hides or shows just this ayah from one large row", () => {
    const rect = { left: 100, top: 300, width: 40, height: 24, bottom: 324, right: 140 } as DOMRect;
    const onToggleHidden = vi.fn();
    const quranApi = { getTranslation: async () => ({ html: "", fromCache: true }) } as unknown as QuranApi;
    const el = mount(
      <AyahPopover
        ayah="1:2"
        surahName="Al-Fatihah"
        anchorRect={rect}
        quranApi={quranApi}
        translationId={33}
        getArabicText={async () => ""}
        isBookmarked={false}
        highlightColor={null}
        onClose={() => {}}
        onToggleBookmark={() => {}}
        onSetHighlight={() => {}}
        isHidden={false}
        onToggleHidden={onToggleHidden}
      />,
    );
    const row = el.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(row.textContent).toContain("Sembunyikan ayat ini");
    expect(row.getAttribute("aria-checked")).toBe("false");
    act(() => row.click());
    expect(onToggleHidden).toHaveBeenCalledWith("1:2");
  });

  it("marks silent Tasmi' sessions as 'Belum ada bacaan' instead of 'Lancar'", () => {
    const silentRecord: TasmiSessionRecord = {
      id: "silent-1",
      startedAt: "2026-11-26T10:00:00Z",
      durationSec: 12,
      surah: 2,
      fromAyah: 1,
      toAyah: 5,
      mistakes: [],
      recitedAyahs: 0,
      recitedWords: 0,
    };

    const el = mount(
      <TasmiSummaryModal
        open={true}
        initialTab="summary"
        record={silentRecord}
        history={[silentRecord]}
        surahs={catalog.surahs}
        getAyahWords={() => []}
        onClose={() => {}}
        onPlayAyah={() => {}}
        onJumpToAyah={() => {}}
      />,
    );

    expect(el.textContent).toContain("Belum ada bacaan");
    expect(el.textContent).not.toContain("Lancar");
    expect(el.textContent).toContain("0/5 ayat · 0 kata terbaca");
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

  it("shows a word's meaning on hover only while its ayah is visible", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ "1": { "\uFB51": ["dengan nama", "bismi"] } }))),
    );
    const { GlyphPageBody: FreshGlyphPageBody } = await import("../src/components/GlyphPageBody");
    const render = (blurSet?: Set<string>) =>
      mount(
        <FreshGlyphPageBody
          data={{
            page: 1,
            fontFamily: "QCFv1-p1",
            lines: [],
            rows: [{ kind: "text", line: 2, words: [{ code: "\uFB51", ayah: "1:1" }] }],
          }}
          pageEntry={mushafMap.pages[0]}
          selectedAyah={null}
          playingAyah={null}
          highlights={{}}
          bookmarks={new Set()}
          blurSet={blurSet as Set<`${number}:${number}`> | undefined}
          onSelectAyah={() => {}}
        />,
      );
    const hover = async (el: HTMLElement) => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      const word = el.querySelector(".glyph-word") as HTMLElement;
      act(() => {
        const over = new MouseEvent("pointerover", { bubbles: true });
        Object.defineProperty(over, "pointerType", { value: "mouse" });
        word.dispatchEvent(over);
      });
      return el.querySelector(".word-tip");
    };

    expect(await hover(render())).not.toBeNull();
    expect(await hover(render(new Set(["1:1"])))).toBeNull();
    vi.unstubAllGlobals();
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

  it("shows a visible exit button in Focus Mode and lifts the topbar zone when the menu opens", () => {
    const onToggleFocusMode = vi.fn();
    const baseProps = {
      surahLabel: "Al-Fatihah",
      juzNumber: 1,
      pageLabel: "1",
      spreadMode: "auto" as const,
      pageNav: "swipe" as const,
      hifzBlur: false,
      wordTranslation: true,
      tajweed: false,
      letterStyle: "1405" as const,
      theme: "light" as const,
      onOpenPalette: () => {},
      onOpenTasmi: () => {},
      onOpenDownloads: () => {},
      onOpenTajweedGuide: () => {},
      onOpenAbout: () => {},
      onChangeSpreadMode: () => {},
      onChangePageNav: () => {},
      onToggleHifzBlur: () => {},
      onToggleFocusMode,
      onToggleWordTranslation: () => {},
      onToggleTajweed: () => {},
      onChangeLetterStyle: () => {},
      onChangeTheme: () => {},
    };

    const el = mount(<TopBar {...baseProps} focusMode={true} />);
    const exitBtn = el.querySelector<HTMLButtonElement>(".focus-exit-btn");
    expect(exitBtn).not.toBeNull();
    act(() => {
      exitBtn?.click();
    });
    expect(onToggleFocusMode).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onToggleFocusMode).toHaveBeenCalledTimes(2);

    const normalEl = mount(<TopBar {...baseProps} focusMode={false} />);
    expect(normalEl.querySelector(".focus-exit-btn")).toBeNull();
    const zone = normalEl.querySelector(".topbar-zone");
    expect(zone?.classList.contains("topbar-zone--menu-open")).toBe(false);
    const menuBtn = normalEl.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    act(() => {
      menuBtn?.click();
    });
    expect(zone?.classList.contains("topbar-zone--menu-open")).toBe(true);
  });

  it("highlights all words of locatedAyah in GlyphPageBody even when wordTranslation is enabled", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
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
                { code: "\uFB53", ayah: "1:2" },
              ],
            },
          ],
        }}
        pageEntry={mushafMap.pages[0]}
        selectedAyah={null}
        locatedAyah="1:1"
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set()}
        wordTranslation={true}
        onSelectAyah={() => {}}
      />,
    );

    const words = el.querySelectorAll(".glyph-word");
    expect(words[0].classList.contains("glyph-word--located")).toBe(true);
    expect(words[1].classList.contains("glyph-word--located")).toBe(true);
    expect(words[2].classList.contains("glyph-word--located")).toBe(false);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("shows 'Belum ada bacaan' in Riwayat for silent sessions and 'Belum disetor' for new manual schedules", () => {
    const silentRecord: TasmiSessionRecord = {
      id: "silent-hist-1",
      startedAt: "2026-11-28T09:00:00Z",
      durationSec: 5,
      surah: 78,
      fromAyah: 1,
      toAyah: 10,
      mistakes: [],
      recitedAyahs: 0,
      recitedWords: 0,
    };

    const el = mount(
      <TasmiSummaryModal
        open={true}
        initialTab="history"
        record={silentRecord}
        history={[silentRecord]}
        murajaahCards={[
          {
            id: "78:1-10",
            surah: 78,
            fromAyah: 1,
            toAyah: 10,
            kind: "murajaah",
            stabilityDays: 3,
            difficulty: 5,
            reps: 0,
            lapses: 0,
            lastReviewedAt: "2026-11-28T09:00:00Z",
            dueAt: "2026-11-28T09:00:00Z",
          },
        ]}
        surahs={catalog.surahs}
        getAyahWords={() => []}
        onClose={() => {}}
        onPlayAyah={() => {}}
        onJumpToAyah={() => {}}
      />,
    );

    expect(el.textContent).toContain("Belum ada bacaan");
    expect(el.textContent).not.toContain("Lancar");

    // Switch to Jadwal tab
    const tabs = el.querySelectorAll('[role="tab"]');
    act(() => {
      (tabs[2] as HTMLButtonElement).click();
    });
    expect(el.textContent).toContain("Belum disetor");
    expect(el.textContent).not.toContain("× selesai");
  });

  it("renders dedicated Pengaturan button in TopBar and grouped cards in SettingsModal", () => {
    const onOpenSettings = vi.fn();
    const topEl = mount(
      <TopBar
        surahLabel="Al-Fatihah"
        juzNumber={1}
        pageLabel="1"
        spreadMode="auto"
        pageNav="swipe"
        hifzBlur={false}
        wordTranslation={true}
        tajweed={false}
        letterStyle="1405"
        theme="light"
        halaqahConnected={true}
        onOpenPalette={() => {}}
        onOpenTasmi={() => {}}
        onOpenDownloads={() => {}}
        onOpenTajweedGuide={() => {}}
        onOpenAbout={() => {}}
        onChangeSpreadMode={() => {}}
        onChangePageNav={() => {}}
        onToggleHifzBlur={() => {}}
        onToggleFocusMode={() => {}}
        onToggleWordTranslation={() => {}}
        onToggleTajweed={() => {}}
        onChangeTheme={() => {}}
        onChangeLetterStyle={() => {}}
        onOpenSettings={onOpenSettings}
        focusMode={false}
      />,
    );

    const gearBtn = topEl.querySelector<HTMLButtonElement>('button[aria-label="Pengaturan"]');
    expect(gearBtn).not.toBeNull();
    // Passive connected status (halaqah/sync) must NOT render a sticky notification dot
    expect(topEl.querySelector(".topbar__status-dot")).toBeNull();
    act(() => {
      gearBtn?.click();
    });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    // Actionable alert (e.g. failed sync) DOES show the notification dot
    const alertEl = mount(
      <TopBar
        surahLabel="Al-Fatihah"
        juzNumber={1}
        pageLabel="1"
        spreadMode="auto"
        pageNav="swipe"
        hifzBlur={false}
        wordTranslation={true}
        tajweed={false}
        letterStyle="1405"
        theme="light"
        hasActionableAlert={true}
        onOpenPalette={() => {}}
        onOpenTasmi={() => {}}
        onOpenDownloads={() => {}}
        onOpenTajweedGuide={() => {}}
        onOpenAbout={() => {}}
        onChangeSpreadMode={() => {}}
        onChangePageNav={() => {}}
        onToggleHifzBlur={() => {}}
        onToggleFocusMode={() => {}}
        onToggleWordTranslation={() => {}}
        onToggleTajweed={() => {}}
        onChangeTheme={() => {}}
        onChangeLetterStyle={() => {}}
        onOpenSettings={onOpenSettings}
        focusMode={false}
      />,
    );
    expect(alertEl.querySelector(".topbar__status-dot")).not.toBeNull();

    const onClose = vi.fn();
    const onOpenSchedule = vi.fn();
    const onToggleTajweed = vi.fn();
    const onChangeLanguage = vi.fn();
    const modalEl = mount(
      <SettingsModal
        open={true}
        onClose={onClose}
        language="id"
        onChangeLanguage={onChangeLanguage}
        readingMode="mushaf"
        flowFontScale={1}
        spreadMode="auto"
        pageNav="swipe"
        letterStyle="1405"
        theme="dark"
        hifzBlur={false}
        hifzBlurLevel="full"
        wordTranslation={true}
        tajweed={false}
        syncConnected={true}
        onChangeReadingMode={() => {}}
        onChangeFlowFontScale={() => {}}
        onChangeSpreadMode={() => {}}
        onChangePageNav={() => {}}
        onChangeLetterStyle={() => {}}
        onChangeTheme={() => {}}
        onToggleHifzBlur={() => {}}
        onChangeHifzBlurLevel={() => {}}
        onToggleWordTranslation={() => {}}
        onToggleTajweed={onToggleTajweed}
        onOpenProgress={() => {}}
        onOpenSchedule={onOpenSchedule}
        onOpenQuiz={() => {}}
        onOpenHalaqah={() => {}}
        onOpenReader={() => {}}
        onOpenTajweedGuide={() => {}}
        onOpenManageData={() => {}}
        onOpenDownloads={() => {}}
        onOpenSync={() => {}}
        onOpenAbout={() => {}}
      />,
    );

    expect(modalEl.textContent).toContain("Tampilan & Mushaf");
    expect(modalEl.textContent).toContain("Hafalan & Belajar");
    expect(modalEl.textContent).toContain("Data & Offline");
    expect(modalEl.textContent).toContain("Aplikasi");
    expect(modalEl.textContent).toContain("Aktif");

    const enBtn = Array.from(modalEl.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (b) => b.textContent === "English",
    );
    expect(enBtn).not.toBeUndefined();
    act(() => {
      enBtn?.click();
    });
    expect(onChangeLanguage).toHaveBeenCalledWith("en");

    const tajweedSwitch = Array.from(modalEl.querySelectorAll<HTMLButtonElement>('[role="switch"]')).find((b) =>
      b.textContent?.includes("Tajwid Warna"),
    );
    act(() => {
      tajweedSwitch?.click();
    });
    expect(onToggleTajweed).toHaveBeenCalledTimes(1);

    const scheduleBtn = Array.from(modalEl.querySelectorAll<HTMLButtonElement>(".settings-row")).find((b) =>
      b.textContent?.includes("Jadwal Muraja'ah"),
    );
    act(() => {
      scheduleBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    // English UI rendering via LanguageProvider
    const enModalEl = mount(
      <LanguageProvider language="en">
        <SettingsModal
          open={true}
          onClose={() => {}}
          language="en"
          onChangeLanguage={() => {}}
          readingMode="mushaf"
          flowFontScale={1}
          spreadMode="auto"
          pageNav="swipe"
          letterStyle="1405"
          theme="light"
          hifzBlur={false}
          hifzBlurLevel="full"
          wordTranslation={true}
          tajweed={false}
          onChangeReadingMode={() => {}}
          onChangeFlowFontScale={() => {}}
          onChangeSpreadMode={() => {}}
          onChangePageNav={() => {}}
          onChangeLetterStyle={() => {}}
          onChangeTheme={() => {}}
          onToggleHifzBlur={() => {}}
          onChangeHifzBlurLevel={() => {}}
          onToggleWordTranslation={() => {}}
          onToggleTajweed={() => {}}
          onOpenProgress={() => {}}
          onOpenSchedule={() => {}}
          onOpenQuiz={() => {}}
          onOpenHalaqah={() => {}}
          onOpenReader={() => {}}
          onOpenTajweedGuide={() => {}}
          onOpenManageData={() => {}}
          onOpenDownloads={() => {}}
          onOpenSync={() => {}}
          onOpenAbout={() => {}}
        />
      </LanguageProvider>,
    );
    expect(enModalEl.textContent).toContain("Settings");
    expect(enModalEl.textContent).toContain("Display & Mushaf");
    expect(enModalEl.textContent).toContain("Memorization & Study");
  });

  it("renders neighboring spread pages in MushafSpread when allPages is provided and expires hidden ayahs after TTL", () => {
    const el = mount(
      <MushafSpread
        rightPageEntry={mushafMap.pages[1]}
        leftPageEntry={null}
        allPages={mushafMap.pages}
        pageUrls={{ 1: "/1.gif", 2: "/2.gif", 3: "/3.gif" }}
        selectedAyah={null}
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set()}
        canGoPrev={true}
        canGoNext={true}
        isModalOpen={false}
        getPageImageUrl={async (p) => `/${p}.gif`}
        onTurnPage={() => {}}
        onSelectAyah={() => {}}
        onClearSelection={() => {}}
        onToggleFocus={() => {}}
        onTogglePalette={() => {}}
      />,
    );
    expect(el.querySelector(".mushaf-neighbor--left")).not.toBeNull();
    expect(el.querySelector(".mushaf-neighbor--right")).not.toBeNull();

    const now = Date.parse("2026-11-28T15:00:00.000Z");
    expect(
      isHiddenAyahActive({ on: true, at: new Date(now - 5 * 60_000).toISOString() }, now),
    ).toBe(true);
    expect(
      isHiddenAyahActive({ on: true, at: new Date(now - HIDDEN_AYAH_TTL_MS - 1000).toISOString() }, now),
    ).toBe(false);
    expect(
      isHiddenAyahActive({ on: false, at: new Date(now).toISOString() }, now),
    ).toBe(false);
  });

  it("renders PlaybackMenu, TasmiSheet, RecitationRibbon, and helpers in English when language is en", () => {
    const pmEl = mount(
      <LanguageProvider language="en">
        <PlaybackMenu
          open={true}
          scope={DEFAULT_SCOPE}
          repeatCount={1}
          speed={1}
          talaqqi={false}
          activeAyah="1:1"
          surahName="Al-Fatihah"
          surahNumber={1}
          surahAyahCount={7}
          onChangeScope={() => {}}
          onChangeRepeat={() => {}}
          onChangeSpeed={() => {}}
          onToggleTalaqqi={() => {}}
          onClose={() => {}}
        />
      </LanguageProvider>,
    );
    expect(pmEl.textContent).toContain("Playback mode");
    expect(pmEl.textContent).toContain("This surah");
    expect(pmEl.textContent).toContain("Talaqqi Mode");
    expect(pmEl.textContent).not.toContain("Mode putar");

    const tsEl = mount(
      <LanguageProvider language="en">
        <TasmiSheet
          open={true}
          visiblePages={[mushafMap.pages[0]]}
          surahs={catalog.surahs}
          initialAyah="1:1"
          historyCount={0}
          loadingProgress={null}
          isStarting={false}
          error={null}
          onClose={() => {}}
          onCancelLoad={() => {}}
          onStartFree={() => {}}
          onStartMemorization={() => {}}
          onOpenHistory={() => {}}
          onOpenGuide={() => {}}
        />
      </LanguageProvider>,
    );
    expect(tsEl.textContent).toContain("Session type");
    expect(tsEl.textContent).toContain("Passage");
    expect(tsEl.textContent).toContain("Full surah");
    expect(tsEl.textContent).toContain("Hide ayahs");
    expect(tsEl.textContent).toContain("Start Tasmi'");
    expect(tsEl.textContent).not.toContain("Jenis setoran");
    expect(tsEl.textContent).not.toContain("Cakupan");

    const rrEl = mount(
      <LanguageProvider language="en">
        <RecitationRibbon
          state={{
            mode: "free",
            passage: null,
            trackerState: "locked",
            activeAyah: "1:1",
            activeWord: { surah: 1, ayah: 1, word: 1 },
            expectedWord: null,
            revealedAyahs: new Set(),
            recitedWords: new Set(),
            mistakesById: new Map(),
            confirmedMistakes: [{ id: "m1", errorClass: "wrong_word", surah: 1, ayah: 1, word: 1 }],
            lastErrorAt: null,
          }}
          surahs={catalog.surahs}
          blurActive={false}
          isPeeking={false}
          getAyahWords={() => ["بِسْمِ"]}
          onStop={() => {}}
        />
      </LanguageProvider>,
    );
    expect(rrEl.textContent).toContain("Free Recite · Locked");
    expect(rrEl.textContent).toContain("1 note");
    expect(rrEl.textContent).toContain("Done");

    expect(formatDueLabel("2026-11-28T15:00:00Z", Date.parse("2026-11-28T15:00:00Z"), "en")).toBe("Today");
    expect(formatErrorClass("wrong_word", "en")).toBe("Wrong word");
  });

  it("localizes surah names, English meanings, search matching, and byte formatting", () => {
    const fatiha = catalog.surahs[0];
    const shams = catalog.surahs[90]; // 91 Asy-Syams
    const quraysh = catalog.surahs[105]; // 106 Quraisy

    expect(getSurahDisplayName(fatiha, "id")).toBe("Al-Fatihah");
    expect(getSurahDisplayName(fatiha, "en")).toBe("Al-Fatiha");
    expect(getSurahEnglishMeaning(1)).toBe("The Opener");
    expect(getSurahDisplayName(shams, "en")).toBe("Ash-Shams");
    expect(getSurahDisplayName(quraysh, "en")).toBe("Quraysh");

    expect(matchesSurahName(fatiha, "opener")).toBe(true);
    expect(matchesSurahName(shams, "ash-shams")).toBe(true);
    expect(matchesSurahName(shams, "sun")).toBe(true);
    expect(matchesSurahName(quraysh, "quraysh")).toBe(true);

    expect(formatBytes(1_363_148_800, "en")).toBe("1.3 GB");
    expect(formatBytes(1_363_148_800, "id")).toBe("1,3 GB");
  });

  it("filters Progress map by Needs review and shows actionable ayah detail card", () => {
    const onJumpToAyah = vi.fn();
    const onStartDrill = vi.fn();
    const onStartTasmiPassage = vi.fn();
    const rec: TasmiSessionRecord = {
      id: "rev-1",
      startedAt: "2026-11-28T10:00:00Z",
      durationSec: 45,
      surah: 1,
      fromAyah: 1,
      toAyah: 7,
      recitedAyahs: 7,
      mistakes: [
        { id: "m1", errorClass: "wrong_word", surah: 1, ayah: 5, word: 2 },
        { id: "m2", errorClass: "skip", surah: 1, ayah: 7, word: 3 },
      ],
    };

    const el = mount(
      <LanguageProvider language="en">
        <TasmiSummaryModal
          open={true}
          initialTab="progress"
          record={rec}
          history={[rec]}
          surahs={catalog.surahs.map((s) => ({ ...s, name: getSurahDisplayName(s, "en") }))}
          catalog={{
            ...catalog,
            surahs: catalog.surahs.map((s) => ({ ...s, name: getSurahDisplayName(s, "en") })),
          }}
          mushafMap={mushafMap}
          getAyahWords={() => []}
          onClose={() => {}}
          onPlayAyah={() => {}}
          onJumpToAyah={onJumpToAyah}
          onStartDrill={onStartDrill}
          onStartTasmiPassage={onStartTasmiPassage}
        />
      </LanguageProvider>,
    );

    // Filter pill for Needs review should show count 1 (Juz 1)
    const filterPills = Array.from(el.querySelectorAll(".pm-filter-pill")) as HTMLButtonElement[];
    const needsReviewPill = filterPills.find((b) => b.textContent?.includes("Needs review"));
    expect(needsReviewPill).toBeDefined();
    expect(needsReviewPill?.textContent).toContain("(1)");

    // Clicking Needs review filters the Juz grid to only Juz 1
    act(() => {
      needsReviewPill!.click();
    });
    const cells = el.querySelectorAll(".pm-cell");
    expect(cells.length).toBe(1);

    // Clicking Juz 1 opens the inline detail card listing 1:5 and 1:7
    act(() => {
      (cells[0] as HTMLButtonElement).click();
    });
    const detail = el.querySelector(".progress-detail");
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain("Al-Fatiha : 5");
    expect(detail?.textContent).toContain("Al-Fatiha : 7");
    expect(detail?.textContent).toContain("Wrong word");

    // Clicking an ayah chip jumps straight to it
    const ayahChip = detail?.querySelector(".progress-detail__chip") as HTMLButtonElement;
    act(() => {
      ayahChip.click();
    });
    expect(onJumpToAyah).toHaveBeenCalledWith("1:5");

    // Clicking Drill Mistakes triggers onStartDrill with the review ayahs
    const drillBtn = Array.from(detail!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Drill Mistakes"),
    );
    expect(drillBtn).toBeDefined();
    act(() => {
      drillBtn!.click();
    });
    expect(onStartDrill).toHaveBeenCalledWith(["1:5", "1:7"]);

    // Switch to 114 Surah view, select Al-Fatiha, and click Start Tasmi'
    const surahTab = Array.from(el.querySelectorAll('[role="tab"]')).find((b) =>
      b.textContent?.includes("114 Surah"),
    ) as HTMLButtonElement;
    act(() => {
      surahTab.click();
    });
    const surahCells = el.querySelectorAll(".pm-cell");
    expect(surahCells.length).toBe(1);
    act(() => {
      (surahCells[0] as HTMLButtonElement).click();
    });
    const surahDetail = el.querySelector(".progress-detail")!;
    const tasmiBtn = Array.from(surahDetail.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Start Tasmi'"),
    );
    expect(tasmiBtn).toBeDefined();
    act(() => {
      tasmiBtn!.click();
    });
    expect(onStartTasmiPassage).toHaveBeenCalledWith({ surah: 1, fromAyah: 1, toAyah: 7 });
  });

  it("loads English word-by-word translations when language is en and registers plain 1441 playing palettes", async () => {
    const enWordsJson = JSON.parse(
      fs.readFileSync("src/data/word-translations-en.json", "utf8"),
    ) as Record<string, Record<string, [string, string]>>;
    expect(Object.keys(enWordsJson).length).toBe(604);
    expect(enWordsJson["1"]["ﭑ"][0]).toBe("In (the) name");

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("language=en")) {
        return new Response(
          JSON.stringify({
            verses: [
              {
                words: [
                  {
                    position: 1,
                    char_type_name: "word",
                    code_v1: "ﭑ",
                    translation: { text: "In (the) name" },
                    transliteration: { text: "bis'mi" },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          verses: [
            {
              words: [
                {
                  position: 1,
                  char_type_name: "word",
                  code_v1: "ﭑ",
                  translation: { text: "dengan nama" },
                  transliteration: { text: "bis'mi" },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });
    const loader = createWordTranslationLoader(fetcher as unknown as typeof fetch);
    const enPage = await loader.load(1, "en");
    const idPage = await loader.load(1, "id");
    expect(enPage.get("ﭑ")?.translation).toBe("In (the) name");
    expect(idPage.get("ﭑ")?.translation).toBe("dengan nama");

    expect(PLAIN_PLAYING_PALETTES.light).toBe("--kafi-plain-playing-light");
    expect(PLAIN_PLAYING_PALETTES.sepia).toBe("--kafi-plain-playing-sepia");
    expect(PLAIN_PLAYING_PALETTES.dark).toBe("--kafi-plain-playing-dark");
    const css = fs.readFileSync("src/styles/app.css", "utf8");
    expect(css).toContain(".app-shell:not(.app-shell--plain-1441) .glyph-page--tajweed .glyph-word--playing-word");
    expect(css).toContain(".app-shell.app-shell--plain-1441 .glyph-word--playing-word");
  });
});
