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

const MARKER = "KafiAndroid";

/**
 * Rewrites the generated MainActivity so the page can keep the screen on (window.KafiAndroid.setKeepAwake)
 * while murottal, talaqqi or Tasmi' runs. Keeps the generated package line; idempotent.
 */
export function patchMainActivity(kotlin) {
  if (kotlin.includes(MARKER)) return kotlin;
  const pkg = kotlin.match(/^package\s+[\w.]+/m);
  if (!pkg) throw new Error("Invalid MainActivity.kt: missing package line");
  return `${pkg[0]}

import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(KeepAwakeBridge(), "${MARKER}")
  }

  inner class KeepAwakeBridge {
    @JavascriptInterface
    fun setKeepAwake(on: Boolean) {
      runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }
}
`;
}

function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry.name === "MainActivity.kt") {
      return full;
    }
  }
  return null;
}

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

  const activityPath = findMainActivity(path.join(path.dirname(manifestPath), "java"));
  if (!activityPath) throw new Error("MainActivity.kt not found next to the manifest");
  const activity = fs.readFileSync(activityPath, "utf8");
  const patched = patchMainActivity(activity);
  if (patched !== activity) {
    fs.writeFileSync(activityPath, patched, "utf8");
    console.log(`Added the keep-awake bridge to ${activityPath}`);
  }
}
