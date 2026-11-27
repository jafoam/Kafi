import { describe, expect, it } from "vitest";
import { buildBackup, mergeBackup, parseBackup } from "../src/services/backup";
import { DEFAULT_USER_DATA } from "../src/services/user-store";
import type { UserData } from "../src/data/types";

const sample: UserData = {
  ...DEFAULT_USER_DATA,
  settings: { ...DEFAULT_USER_DATA.settings },
  bookmarks: ["2:255"],
  highlights: { "1:1": "amber" },
  notes: { "2:255": "Ayat Kursi" },
  tasmiHistory: [],
};

describe("backup", () => {
  it("round-trips through a backup file", () => {
    const { data, summary } = parseBackup(buildBackup(sample));
    expect(data.bookmarks).toEqual(["2:255"]);
    expect(data.notes["2:255"]).toBe("Ayat Kursi");
    expect(summary).toMatchObject({ bookmarks: 1, highlights: 1, notes: 1, tasmi: 0 });
  });

  it("rejects files that are not Kafi backups", () => {
    expect(() => parseBackup("not json")).toThrow(/JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/bukan cadangan/);
    expect(() => parseBackup("x".repeat(6 * 1024 * 1024))).toThrow(/terlalu besar/);
  });

  it("drops malformed entries instead of trusting them", () => {
    const evil = JSON.stringify({
      app: "kafi",
      data: { bookmarks: ["2:1", 42, { x: 1 }], highlights: { "1:1": "<script>" }, settings: { theme: "neon" } },
    });
    const { data } = parseBackup(evil);
    expect(data.bookmarks).toEqual(["2:1"]);
    expect(data.highlights).toEqual({});
    expect(data.settings.theme).toBe("light");
  });

  it("merges without losing what is already on the device", () => {
    const local: UserData = { ...sample, bookmarks: ["1:1"] };
    const merged = mergeBackup(local, sample);
    expect(new Set(merged.bookmarks)).toEqual(new Set(["1:1", "2:255"]));
  });
});
