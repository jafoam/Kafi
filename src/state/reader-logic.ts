import type { SpreadMode } from "../data/types";

export type { SpreadMode };

export type EffectiveSpread = "single" | "double";

export interface VisiblePages {
  rightPage: number;
  leftPage: number | null;
}

export const MIN_PAGE = 1;
export const MAX_PAGE = 604;
export const DOUBLE_SPREAD_BREAKPOINT = 1024;

export function clampPage(page: number): number {
  if (!Number.isFinite(page)) return MIN_PAGE;
  return Math.min(MAX_PAGE, Math.max(MIN_PAGE, Math.trunc(page)));
}

export function resolveEffectiveSpread(
  mode: SpreadMode,
  viewportWidth: number,
): EffectiveSpread {
  if (mode === "single") return "single";
  if (mode === "double") return "double";
  return viewportWidth >= DOUBLE_SPREAD_BREAKPOINT ? "double" : "single";
}

export function getVisiblePages(
  currentPage: number,
  effectiveSpread: EffectiveSpread,
): VisiblePages {
  const clamped = clampPage(currentPage);
  if (effectiveSpread === "single") {
    return { rightPage: clamped, leftPage: null };
  }
  const rightPage = clamped % 2 === 1 ? clamped : clamped - 1;
  const leftPage = rightPage + 1 <= MAX_PAGE ? rightPage + 1 : null;
  return { rightPage, leftPage };
}

export function turnPage(
  currentPage: number,
  direction: "next" | "prev",
  effectiveSpread: EffectiveSpread,
): number {
  if (effectiveSpread === "single") {
    const delta = direction === "next" ? 1 : -1;
    return clampPage(clampPage(currentPage) + delta);
  }
  const { rightPage } = getVisiblePages(currentPage, "double");
  const delta = direction === "next" ? 2 : -2;
  const nextPage = clampPage(rightPage + delta);
  return getVisiblePages(nextPage, "double").rightPage;
}

export function mapKeyToDirection(key: string): "next" | "prev" | null {
  if (key === "ArrowLeft") return "next";
  if (key === "ArrowRight") return "prev";
  return null;
}

export function getAdjacentPages(
  rightPage: number,
  leftPage: number | null,
): number[] {
  const maxVisible = leftPage ?? rightPage;
  const candidates = [
    rightPage - 2,
    rightPage - 1,
    maxVisible + 1,
    maxVisible + 2,
  ];
  return candidates.filter((p) => p >= MIN_PAGE && p <= MAX_PAGE);
}
