import { describe, expect, it } from "vitest";
import worker from "../sync-worker/src/index";
import {
  buildHalaqahInviteUrl,
  buildReportFromTasmi,
  createHalaqah,
  fetchHalaqahSnapshot,
  joinHalaqah,
  leaveHalaqah,
  normalizeHalaqahCode,
  parseHalaqahInviteFromSearch,
  submitHalaqahReport,
  updateHalaqahMeta,
} from "../src/services/halaqah-service";

function createWorkerFetcher() {
  const store = new Map<string, string>();
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list({ prefix = "", limit = 100 }: { prefix?: string; limit?: number } = {}) {
      const keys = Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit)
        .map((name) => ({ name }));
      return { keys };
    },
  };
  const fetcher: typeof fetch = (input, init) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    return worker.fetch(req, { KAFI_SYNC_KV: kv as never });
  };
  return { fetcher, store };
}

describe("halaqah-service + sync-worker E2E", () => {
  it("normalizes codes and parses invite links", () => {
    expect(normalizeHalaqahCode("hlq7x4k9m2p")).toBe("HLQ-7X4K-9M2P");
    const link = buildHalaqahInviteUrl("HLQ-7X4K-9M2P", "https://kafi.zudd.in");
    expect(normalizeHalaqahCode(link)).toBe("HLQ-7X4K-9M2P");
    expect(parseHalaqahInviteFromSearch("?halaqah=HLQ-7X4K-9M2P")).toBe("HLQ-7X4K-9M2P");
  });

  it("supports create, join, encrypted report submission, admin lock, and leave without login", async () => {
    const { fetcher, store } = createWorkerFetcher();
    const workerUrl = "https://sync.example.test";

    const created = await createHalaqah({
      name: "Halaqah Subuh",
      displayName: "Ust. Hasan",
      target: "Al-Mulk 1-10",
      workerUrl,
      fetcher,
    });

    // Server KV never stores plaintext group name or member name.
    const rawDump = Array.from(store.values()).join("\n");
    expect(rawDump).not.toContain("Halaqah Subuh");
    expect(rawDump).not.toContain("Ust. Hasan");

    const joined = await joinHalaqah({
      code: created.membership.code,
      displayName: "Ahmad",
      workerUrl,
      fetcher,
    });
    expect(joined.membership.name).toBe("Halaqah Subuh");
    expect(joined.snapshot.members).toHaveLength(2);

    const report = buildReportFromTasmi({
      id: "tasmi-1",
      startedAt: "2026-11-28T05:00:00.000Z",
      durationSec: 95,
      surah: 67,
      fromAyah: 1,
      toAyah: 10,
      mistakes: [],
    });
    await submitHalaqahReport({ membership: joined.membership, report, fetcher });

    const snap = await fetchHalaqahSnapshot(created.membership, fetcher);
    const ahmad = snap.members.find((m) => m.memberId === joined.membership.memberId);
    expect(ahmad?.data.reports).toHaveLength(1);
    expect(ahmad?.data.reports[0].surah).toBe(67);

    // Admin locks the group; new member cannot join.
    await updateHalaqahMeta({
      membership: created.membership,
      meta: { ...snap.meta, target: "Al-Mulk 11-20", locked: true },
      fetcher,
    });
    await expect(
      joinHalaqah({
        code: created.membership.code,
        displayName: "Budi",
        workerUrl,
        fetcher,
      }),
    ).rejects.toThrow(/dikunci/i);

    // Existing member leaves cleanly.
    await leaveHalaqah(joined.membership, fetcher);
    const afterLeave = await fetchHalaqahSnapshot(created.membership, fetcher);
    expect(afterLeave.members).toHaveLength(1);
  });
});
