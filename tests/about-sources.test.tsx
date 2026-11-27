import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AboutSources } from "../src/components/AboutSources";
import { SOURCE_GROUPS } from "../src/data/acknowledgements";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(onClose = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<AboutSources onClose={onClose} />));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("About & data sources", () => {
  it("lists every source under its group", () => {
    const el = mount();
    const groups = [...el.querySelectorAll(".about__group-title")].map((h) => h.textContent);
    expect(groups).toEqual([...SOURCE_GROUPS.map((g) => g.title), "Keakuratan teks"]);
    const names = [...el.querySelectorAll(".about__name")].map((n) => n.textContent);
    expect(names).toEqual(SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => s.name)));
    expect(names).toEqual(expect.arrayContaining(["Kompleks Raja Fahd (KFGQPC)", "Tanzil", "EveryAyah", "Tilawa"]));
  });

  it("opens every link outside the app", () => {
    const links = [...mount().querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
    }
  });

  it("says the text is checked automatically but not yet certified", () => {
    const text = mount().textContent ?? "";
    expect(text).toContain("diperiksa otomatis terhadap Tanzil");
    expect(text).toContain("belum ditashih");
  });

  it("closes from the × button and the backdrop, not from a tap inside", () => {
    const onClose = vi.fn();
    const el = mount(onClose);
    act(() => (el.querySelector(".about") as HTMLElement).click());
    expect(onClose).not.toHaveBeenCalled();
    act(() => (el.querySelector('[aria-label="Tutup"]') as HTMLElement).click());
    act(() => (el.querySelector(".palette-backdrop") as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
