import { describe, expect, it, vi } from "vitest";
import { checkForAndroidUpdate } from "../src/services/android-updater";

describe("android-updater", () => {
  it("returns update info when the latest release APK is newer than the build time", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          tag_name: "v0.1.0-alpha.6",
          name: "Kafi 0.1.0 alpha 6",
          draft: false,
          assets: [
            {
              name: "kafi-0.1.0-alpha.6-android-arm64.apk",
              browser_download_url: "https://example.com/kafi.apk",
              updated_at: "2026-11-29T04:00:00.000Z",
              size: 13_000_000,
            },
          ],
        },
      ],
    })) as unknown as typeof fetch;

    const info = await checkForAndroidUpdate("2026-11-29T03:00:00.000Z", mockFetch);
    expect(info).toEqual({
      tag: "v0.1.0-alpha.6",
      name: "Kafi 0.1.0 alpha 6",
      apkUrl: "https://example.com/kafi.apk",
      updatedAt: "2026-11-29T04:00:00.000Z",
      sizeBytes: 13_000_000,
    });
  });

  it("returns null when the APK was uploaded within the 5-minute build grace window", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          tag_name: "v0.1.0-alpha.6",
          name: "Kafi 0.1.0 alpha 6",
          draft: false,
          assets: [
            {
              name: "kafi-0.1.0-alpha.6-android-arm64.apk",
              browser_download_url: "https://example.com/kafi.apk",
              updated_at: "2026-11-29T03:02:00.000Z",
              size: 13_000_000,
            },
          ],
        },
      ],
    })) as unknown as typeof fetch;

    const info = await checkForAndroidUpdate("2026-11-29T03:00:00.000Z", mockFetch);
    expect(info).toBeNull();
  });
});
