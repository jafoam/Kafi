import { describe, it, expect, vi } from "vitest";
import { DEFAULT_USER_DATA } from "../src/services/user-store";
import {
  decryptUserData,
  deriveSyncKeys,
  encryptUserData,
  generateSyncCode,
  mergeUserData,
  normalizeSyncCode,
  syncUserData,
} from "../src/services/sync-service";
import type { UserData } from "../src/data/types";

describe("sync-service", () => {
  it("generates and normalizes sync codes", () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^KAFI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(normalizeSyncCode("kafi 7x4k 9m2p q3r8")).toBe("KAFI-7X4K-9M2P-Q3R8");
    expect(normalizeSyncCode("short")).toBeNull();
  });

  it("encrypts and decrypts UserData end-to-end and rejects wrong codes", async () => {
    const { aesKey } = await deriveSyncKeys("KAFI-7X4K-9M2P-Q3R8");
    const { aesKey: wrongKey } = await deriveSyncKeys("KAFI-AAAA-BBBB-CCCC");

    const sample: UserData = {
      ...DEFAULT_USER_DATA,
      lastPage: 582,
      bookmarks: ["78:1", "2:255"],
      notes: { "2:255": "Ayat Kursi" },
      updatedAt: "2026-11-26T10:00:00.000Z",
    };

    const blob = await encryptUserData(sample, aesKey);
    expect(blob.v).toBe(1);
    expect(blob.ct).not.toContain("Ayat Kursi");

    const decoded = await decryptUserData(blob, aesKey);
    expect(decoded.bookmarks).toEqual(["78:1", "2:255"]);
    expect(decoded.notes["2:255"]).toBe("Ayat Kursi");

    await expect(decryptUserData(blob, wrongKey)).rejects.toThrow();
  });

  it("merges local and remote UserData losslessly across devices", () => {
    const local: UserData = {
      ...DEFAULT_USER_DATA,
      lastPage: 10,
      bookmarks: ["1:1"],
      notes: { "1:1": "Local note" },
      tasmiHistory: [
        {
          id: "s1",
          startedAt: "2026-11-25T08:00:00.000Z",
          durationSec: 40,
          surah: 1,
          fromAyah: 1,
          toAyah: 7,
          mistakes: [],
        },
      ],
      updatedAt: "2026-11-25T08:00:00.000Z",
    };

    const remote: UserData = {
      ...DEFAULT_USER_DATA,
      lastPage: 582,
      bookmarks: ["78:1"],
      notes: { "78:1": "Remote note" },
      tasmiHistory: [
        {
          id: "s2",
          startedAt: "2026-11-26T08:00:00.000Z",
          durationSec: 90,
          surah: 78,
          fromAyah: 1,
          toAyah: 40,
          mistakes: [],
        },
      ],
      updatedAt: "2026-11-26T08:00:00.000Z",
    };

    const merged = mergeUserData(local, remote);
    expect(merged.lastPage).toBe(582);
    expect(merged.bookmarks.sort()).toEqual(["1:1", "78:1"]);
    expect(merged.notes).toEqual({ "1:1": "Local note", "78:1": "Remote note" });
    expect(merged.tasmiHistory.map((h) => h.id)).toEqual(["s2", "s1"]);
  });

  it("uploads on first sync (404) and merges on second device (200)", async () => {
    const store = new Map<string, string>();
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        store.set(url, String(init.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      const existing = store.get(url);
      if (!existing) return new Response("Not found", { status: 404 });
      return new Response(existing, { status: 200 });
    }) as unknown as typeof fetch;

    const code = "KAFI-7X4K-9M2P-Q3R8";
    const deviceA: UserData = {
      ...DEFAULT_USER_DATA,
      bookmarks: ["2:255"],
      updatedAt: "2026-11-26T09:00:00.000Z",
    };
    const resA = await syncUserData({
      code,
      workerUrl: "https://kafi-sync.example.workers.dev",
      localData: deviceA,
      fetcher: fakeFetch,
    });
    expect(resA.pulled).toBe(false);

    const deviceB: UserData = {
      ...DEFAULT_USER_DATA,
      bookmarks: ["112:1"],
      updatedAt: "2026-11-26T10:00:00.000Z",
    };
    const resB = await syncUserData({
      code,
      workerUrl: "https://kafi-sync.example.workers.dev",
      localData: deviceB,
      fetcher: fakeFetch,
    });
    expect(resB.pulled).toBe(true);
    expect(resB.merged.bookmarks.sort()).toEqual(["112:1", "2:255"]);
  });

  it("keeps a reciter chosen here when the other device is newer only from reading", () => {
    const local: UserData = {
      ...DEFAULT_USER_DATA,
      settings: { ...DEFAULT_USER_DATA.settings, reciterId: "Husary_128kbps" },
      settingsUpdatedAt: "2026-11-27T09:00:00.000Z",
      updatedAt: "2026-11-27T09:00:00.000Z",
    };
    const remote: UserData = {
      ...DEFAULT_USER_DATA,
      lastPage: 300,
      settingsUpdatedAt: "2026-11-20T09:00:00.000Z",
      updatedAt: "2026-11-27T10:00:00.000Z",
    };
    const merged = mergeUserData(local, remote);
    expect(merged.settings.reciterId).toBe("Husary_128kbps");
    expect(merged.lastPage).toBe(300);
  });
});
