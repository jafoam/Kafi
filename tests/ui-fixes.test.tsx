import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import type { Catalog, MushafMap, TasmiSessionRecord } from "../src/data/types";
import { AyahPopover } from "../src/components/AyahPopover";
import { isCrossOriginHttpUrl, MushafPage } from "../src/components/MushafPage";
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

describe("Unified word gloss inside AyahPopover", () => {
  it("renders word translation and transliteration alongside ayah actions, and omits them when absent", () => {
    const rect = { left: 100, top: 300, width: 40, height: 24, bottom: 324, right: 140 } as DOMRect;
    const el = mount(
      <AyahPopover
        ayah="1:1"
        surahName="Al-Fatihah"
        anchorRect={rect}
        word={{
          key: "1:2-0",
          translation: "dengan nama",
          transliteration: "bis'mi",
        }}
        isBookmarked={false}
        highlightColor={null}
        onClose={() => {}}
        onToggleBookmark={() => {}}
        onSetHighlight={() => {}}
      />,
    );

    expect(el.querySelector(".ayah-popover__word-translation")?.textContent).toBe("dengan nama");
    expect(el.querySelector(".ayah-popover__word-translit")?.textContent).toBe("bis'mi");
    expect(el.textContent).toContain("Putar");
    expect(el.textContent).toContain("Tafsir & Terjemahan");
    expect(el.textContent).toContain("Tasmi' dari sini");

    mount(
      <AyahPopover
        ayah="1:1"
        surahName="Al-Fatihah"
        anchorRect={rect}
        word={undefined}
        isBookmarked={false}
        highlightColor={null}
        onClose={() => {}}
        onToggleBookmark={() => {}}
        onSetHighlight={() => {}}
      />,
    );
    expect(el.querySelector(".ayah-popover__word")).toBeNull();
  });
});
