import { describe, it, expect } from "vitest";
import {
  clampPage,
  resolveEffectiveSpread,
  getVisiblePages,
  turnPage,
  mapKeyToDirection,
} from "../src/state/reader-logic";

describe("reader-logic (RTL Mushaf spread)", () => {
  it("clamps pages to 1..604", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage(605)).toBe(604);
  });

  it("pairs odd page on right and even page on left in 2-page RTL spread", () => {
    expect(getVisiblePages(1, "double")).toEqual({ rightPage: 1, leftPage: 2 });
    expect(getVisiblePages(2, "double")).toEqual({ rightPage: 1, leftPage: 2 });
    expect(getVisiblePages(603, "double")).toEqual({ rightPage: 603, leftPage: 604 });
    expect(getVisiblePages(604, "double")).toEqual({ rightPage: 603, leftPage: 604 });
    expect(getVisiblePages(15, "single")).toEqual({ rightPage: 15, leftPage: null });
  });

  it("advances and reverses pages cleanly across single and double spread", () => {
    expect(turnPage(1, "next", "double")).toBe(3);
    expect(turnPage(3, "prev", "double")).toBe(1);
    expect(turnPage(603, "next", "double")).toBe(603);
    expect(turnPage(1, "prev", "single")).toBe(1);
    expect(turnPage(1, "next", "single")).toBe(2);
  });

  it("maps ArrowLeft to next page and ArrowRight to previous page (RTL physical mushaf)", () => {
    expect(mapKeyToDirection("ArrowLeft")).toBe("next");
    expect(mapKeyToDirection("ArrowRight")).toBe("prev");
    expect(resolveEffectiveSpread("auto", 1200)).toBe("double");
    expect(resolveEffectiveSpread("auto", 800)).toBe("single");
    expect(resolveEffectiveSpread("single", 1440)).toBe("single");
  });
});
