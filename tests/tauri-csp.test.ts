import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("Tauri CSP", () => {
  it("lets the Tasmi' microphone load its AudioWorklet from a blob: URL", () => {
    // Android reads the mic through @tilawa/core in the WebView, which loads its AudioWorklet tap
    // from a blob: URL. Worklets follow script-src, so without blob: the mic fails to start.
    const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const csp: string = conf.app.security.csp;
    const scriptSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src "));
    expect(scriptSrc?.split(/\s+/)).toContain("blob:");
  });
});
