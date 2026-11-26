import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = path.resolve(
  process.cwd(),
  "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
);

const REQUIRED_PERMISSIONS = [
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
];

/** Idempotently ensures microphone permissions exist in the generated AndroidManifest.xml. */
export function patchAndroidManifest(xml) {
  const missing = REQUIRED_PERMISSIONS.filter((perm) => !xml.includes(perm));
  if (missing.length === 0) return xml;
  const block = missing.map((perm) => `    <uses-permission android:name="${perm}" />`).join("\n");
  const idx = xml.indexOf("<application");
  if (idx === -1) {
    throw new Error("Invalid AndroidManifest.xml: missing <application> tag");
  }
  return `${xml.slice(0, idx)}${block}\n${xml.slice(idx)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifestPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_MANIFEST;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`AndroidManifest.xml not found at ${manifestPath}. Run "npm run android:init" first.`);
  }
  const original = fs.readFileSync(manifestPath, "utf8");
  const updated = patchAndroidManifest(original);
  if (updated !== original) {
    fs.writeFileSync(manifestPath, updated, "utf8");
    console.log(`Patched microphone permissions in ${manifestPath}`);
  } else {
    console.log(`Microphone permissions already present in ${manifestPath}`);
  }
}
