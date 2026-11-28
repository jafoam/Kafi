import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import type { Catalog, MushafMap } from "../src/data/types";
import type { GlyphPageData, GlyphPageLoader } from "../src/services/glyph-pages";
import type { QuranApi } from "../src/services/quran-api";
import { normalizeUserData } from "../src/services/user-store";
import {
  buildReadingBlocks,
  buildTranslationItems,
  FlowReader,
} from "../src/components/FlowReader";
import { TopBar } from "../src/components/TopBar";

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

const SAMPLE_PAGE_2: GlyphPageData = {
  page: 2,
  fontFamily: "QCFv1-p2",
  lines: [
    {
      line: 3,
      words: [
        { code: "A1", ayah: "2:1", wordIndex: 0 },
        { code: "END1", ayah: "2:1", wordIndex: 1 },
        { code: "B1", ayah: "2:2", wordIndex: 0 },
      ],
    },
    {
      line: 4,
      words: [{ code: "B2", ayah: "2:2", wordIndex: 1 }],
    },
  ],
  rows: [
    { kind: "header", line: 1, surah: 2 },
    { kind: "bismillah", line: 2 },
    {
      kind: "text",
      line: 3,
      words: [
        { code: "A1", ayah: "2:1", wordIndex: 0 },
        { code: "END1", ayah: "2:1", wordIndex: 1 },
        { code: "B1", ayah: "2:2", wordIndex: 0 },
      ],
    },
    {
      kind: "text",
      line: 4,
      words: [{ code: "B2", ayah: "2:2", wordIndex: 1 }],
    },
  ],
};

const SAMPLE_PAGE_3: GlyphPageData = {
  page: 3,
  fontFamily: "QCFv1-p3",
  lines: [
    {
      line: 1,
      words: [
        { code: "B3", ayah: "2:2", wordIndex: 2 },
        { code: "END2", ayah: "2:2", wordIndex: 3 },
        { code: "C1", ayah: "2:3", wordIndex: 0 },
        { code: "END3", ayah: "2:3", wordIndex: 1 },
      ],
    },
  ],
  rows: [
    {
      kind: "text",
      line: 1,
      words: [
        { code: "B3", ayah: "2:2", wordIndex: 2 },
        { code: "END2", ayah: "2:2", wordIndex: 3 },
        { code: "C1", ayah: "2:3", wordIndex: 0 },
        { code: "END3", ayah: "2:3", wordIndex: 1 },
      ],
    },
  ],
};

describe("readingMode & flowFontScale persistence", () => {
  it("defaults to mushaf and validates translation, reading, and flowFontScale", () => {
    expect(normalizeUserData({}).settings.readingMode).toBe("mushaf");
    expect(normalizeUserData({ settings: { readingMode: "translation" } }).settings.readingMode).toBe("translation");
    expect(normalizeUserData({ settings: { readingMode: "reading" } }).settings.readingMode).toBe("reading");
    expect(normalizeUserData({ settings: { readingMode: "unknown" } }).settings.readingMode).toBe("mushaf");

    expect(normalizeUserData({}).settings.flowFontScale).toBe(1);
    expect(normalizeUserData({ settings: { flowFontScale: 1.3 } }).settings.flowFontScale).toBe(1.3);
    expect(normalizeUserData({ settings: { flowFontScale: 5 } }).settings.flowFontScale).toBe(1.6);
    expect(normalizeUserData({ settings: { flowFontScale: 0.2 } }).settings.flowFontScale).toBe(0.85);
  });
});

describe("buildTranslationItems and buildReadingBlocks", () => {
  it("stitches split ayahs across pages, skips continuations, and strips trailing verse-end glyphs", () => {
    const p2Items = buildTranslationItems(SAMPLE_PAGE_2, SAMPLE_PAGE_3);
    expect(p2Items.map((i) => i.kind)).toEqual(["header", "bismillah", "ayah", "ayah"]);
    const ayah1 = p2Items[2];
    const ayah2 = p2Items[3];
    expect(ayah1.kind === "ayah" && ayah1.words.map((w) => w.code)).toEqual(["A1"]);
    expect(ayah2.kind === "ayah" && ayah2.words.map((w) => w.code)).toEqual(["B1", "B2", "B3"]);
    expect(ayah2.kind === "ayah" && ayah2.words[2].fontFamily).toBe("QCFv1-p3");

    const p3Items = buildTranslationItems(SAMPLE_PAGE_3, null);
    expect(p3Items).toHaveLength(1);
    expect(p3Items[0].kind === "ayah" && p3Items[0].ayah).toBe("2:3");
    expect(p3Items[0].kind === "ayah" && p3Items[0].words.map((w) => w.code)).toEqual(["C1"]);
  });

  it("merges consecutive text rows into a continuous paragraph keeping inline ayah-end glyphs", () => {
    const blocks = buildReadingBlocks(SAMPLE_PAGE_2);
    expect(blocks.map((b) => b.kind)).toEqual(["header", "bismillah", "paragraph"]);
    const para = blocks[2];
    expect(para.kind === "paragraph" && para.words.map((w) => w.code)).toEqual([
      "A1",
      "END1",
      "B1",
      "B2",
    ]);
  });

  it("extracts Al-Fatihah 1:1 as a calligraphic bismillah-ayah block with its verse-end glyph", () => {
    const page1: GlyphPageData = {
      page: 1,
      fontFamily: "QCFv1-p1",
      lines: [],
      rows: [
        { kind: "header", line: 1, surah: 1 },
        {
          kind: "text",
          line: 2,
          words: [
            { code: "B1", ayah: "1:1", wordIndex: 0 },
            { code: "END1", ayah: "1:1", wordIndex: 1 },
          ],
        },
        {
          kind: "text",
          line: 3,
          words: [
            { code: "H1", ayah: "1:2", wordIndex: 0 },
            { code: "END2", ayah: "1:2", wordIndex: 1 },
          ],
        },
      ],
    };
    const blocks = buildReadingBlocks(page1);
    expect(blocks.map((b) => b.kind)).toEqual(["header", "bismillah-ayah", "paragraph"]);
    expect(blocks[1].kind === "bismillah-ayah" && blocks[1].endWord?.code).toBe("END1");
    expect(blocks[2].kind === "paragraph" && blocks[2].words.map((w) => w.code)).toEqual(["H1", "END2"]);
  });
});

describe("FlowReader UI", () => {
  const makeGlyphLoader = (): GlyphPageLoader => ({
    load: vi.fn(async (page: number) => (page === 3 ? SAMPLE_PAGE_3 : { ...SAMPLE_PAGE_2, page })),
    prefetch: vi.fn(),
    loadAyahPages: vi.fn(async () => new Map()),
  });

  const makeQuranApi = (): QuranApi =>
    ({
      downloadSurahTranslation: vi.fn(async () => {}),
      getTranslation: vi.fn(async (_id: number, surah: number, ayah: number) => ({
        html: `Terjemahan ${surah}:${ayah}`,
        fromCache: true,
      })),
    }) as unknown as QuranApi;

  it("renders Translation mode with verse medallions, Arabic text, translations, and mode switching", async () => {
    const onChangeMode = vi.fn();
    const onSelectAyah = vi.fn();
    const onPeekAyah = vi.fn();

    const el = mount(
      <FlowReader
        mode="translation"
        onChangeMode={onChangeMode}
        pages={mushafMap.pages.slice(0, 5)}
        surahs={catalog.surahs}
        juzs={catalog.juzs}
        currentPage={2}
        focusMode={false}
        selectedAyah={null}
        playingAyah={null}
        highlights={{}}
        bookmarks={new Set(["2:1"])}
        blurSet={new Set(["2:2"])}
        isModalOpen={false}
        glyphLoader={makeGlyphLoader()}
        quranApi={makeQuranApi()}
        translationId={33}
        onPageChange={() => {}}
        onSelectAyah={onSelectAyah}
        onPeekAyah={onPeekAyah}
        onClearSelection={() => {}}
        onToggleFocus={() => {}}
        onTogglePalette={() => {}}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tabs = el.querySelectorAll('.flow-mode-bar [role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(el.textContent).toContain("Al-Baqarah");
    expect(el.textContent).toContain("Terjemahan 2:1");

    // Clicking a blurred ayah triggers peek instead of selecting
    const blurredCard = el.querySelector('[data-flow-page="2"] [data-ayah="2:2"]') as HTMLElement;
    expect(blurredCard.querySelector(".flow-ayah-card__translation--blurred")).not.toBeNull();
    act(() => {
      blurredCard.click();
    });
    expect(onPeekAyah).toHaveBeenCalledWith("2:2");

    // Clicking a non-blurred ayah selects it
    const normalCard = el.querySelector('[data-flow-page="2"] [data-ayah="2:1"]') as HTMLElement;
    act(() => {
      normalCard.click();
    });
    expect(onSelectAyah).toHaveBeenCalledWith("2:1", expect.anything(), undefined);

    // Switching to Reading mode
    act(() => {
      (tabs[2] as HTMLButtonElement).click();
    });
    expect(onChangeMode).toHaveBeenCalledWith("reading");
  });

  it("renders Reading mode with continuous paragraphs and page dividers", async () => {
    const el = mount(
      <FlowReader
        mode="reading"
        onChangeMode={() => {}}
        pages={mushafMap.pages.slice(0, 5)}
        surahs={catalog.surahs}
        juzs={catalog.juzs}
        currentPage={2}
        focusMode={false}
        selectedAyah={null}
        playingAyah="2:1"
        highlights={{}}
        bookmarks={new Set()}
        isModalOpen={false}
        glyphLoader={makeGlyphLoader()}
        quranApi={makeQuranApi()}
        translationId={33}
        onPageChange={() => {}}
        onSelectAyah={() => {}}
        onClearSelection={() => {}}
        onToggleFocus={() => {}}
        onTogglePalette={() => {}}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const page2 = el.querySelector('[data-flow-page="2"]') as HTMLElement;
    expect(page2.querySelector(".flow-reading-paragraph")).not.toBeNull();
    expect(page2.querySelector(".flow-page-divider")?.textContent).toContain("Juz 1 · Hal. 2");
    expect(page2.querySelector(".flow-page-divider__num")?.textContent).toBe("02");
  });

  it("exposes Mode baca selector in TopBar menu", () => {
    const onChangeReadingMode = vi.fn();
    const el = mount(
      <TopBar
        surahLabel="Al-Baqarah"
        juzNumber={1}
        pageLabel="2"
        spreadMode="auto"
        pageNav="swipe"
        readingMode="mushaf"
        hifzBlur={false}
        focusMode={false}
        wordTranslation={true}
        tajweed={false}
        letterStyle="1405"
        onChangeLetterStyle={() => {}}
        theme="dark"
        onOpenPalette={() => {}}
        onChangeSpreadMode={() => {}}
        onChangePageNav={() => {}}
        onChangeReadingMode={onChangeReadingMode}
        onToggleHifzBlur={() => {}}
        onToggleFocusMode={() => {}}
        onToggleWordTranslation={() => {}}
        onToggleTajweed={() => {}}
        onChangeTheme={() => {}}
        onOpenTasmi={() => {}}
        onOpenTajweedGuide={() => {}}
        onOpenAbout={() => {}}
        onOpenDownloads={() => {}}
      />,
    );

    const menuBtn = el.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement;
    act(() => {
      menuBtn.click();
    });

    const modeRadios = el.querySelectorAll('[aria-label="Mode baca"] [role="radio"]');
    expect(modeRadios).toHaveLength(3);
    act(() => {
      (modeRadios[1] as HTMLButtonElement).click();
    });
    expect(onChangeReadingMode).toHaveBeenCalledWith("translation");

    // Reopen menu and navigate into Data & Aplikasi submenu to reach GitHub releases link.
    act(() => {
      menuBtn.click();
    });
    const dataBtn = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Data & Aplikasi"),
    ) as HTMLButtonElement | undefined;
    expect(dataBtn).toBeDefined();
    act(() => {
      dataBtn!.click();
    });
    const ghLink = el.querySelector('a[href="https://github.com/jafoam/Kafi/releases/latest"]');
    expect(ghLink).not.toBeNull();
  });
});
