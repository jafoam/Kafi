import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = path.resolve(
  process.cwd(),
  "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
);

const REQUIRED_PERMISSIONS = [
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.REQUEST_INSTALL_PACKAGES",
];

const MARKER = "KafiAndroid";
const PATCH_VERSION_MARKER = "downloadAndInstallApk";

const FILE_PROVIDER_MARKER = "androidx.core.content.FileProvider";
const FILE_PROVIDER_XML = `        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>`;

const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="apk_updates" path="." />
</paths>
`;

/**
 * Rewrites the generated MainActivity to:
 * 1. Apply system-bar and cutout insets so scrolled content never bleeds behind the notification bar.
 * 2. Expose window.KafiAndroid (setKeepAwake, setBackIntercept, downloadAndInstallApk, installCachedApk).
 * Keeps the generated package line; idempotent.
 */
export function patchMainActivity(kotlin) {
  if (kotlin.includes(MARKER) && kotlin.includes(PATCH_VERSION_MARKER)) return kotlin;
  const pkg = kotlin.match(/^package\s+[\w.]+/m);
  if (!pkg) throw new Error("Invalid MainActivity.kt: missing package line");
  return `${pkg[0]}

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null
  private val backCallback = object : OnBackPressedCallback(false) {
    override fun handleOnBackPressed() {
      webViewRef?.evaluateJavascript("window.__kafiHandleBack?.()", null)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, windowInsets ->
      val bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    webView.addJavascriptInterface(KafiBridge(), "${MARKER}")
    // Register after Tauri's AppPlugin so our callback sits above it when an overlay is open.
    backCallback.remove()
    onBackPressedDispatcher.addCallback(this, backCallback)
  }

  private fun emitUpdateProgress(percent: Int) {
    runOnUiThread {
      webViewRef?.evaluateJavascript("window.__kafiUpdateProgress?.($percent)", null)
    }
  }

  private fun emitUpdateStatus(status: String) {
    runOnUiThread {
      webViewRef?.evaluateJavascript("window.__kafiUpdateStatus?.('$status')", null)
    }
  }

  private fun launchApkInstaller(apkFile: File) {
    runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
          val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(intent)
          emitUpdateStatus("permission_required")
          return@runOnUiThread
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apkFile)
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
        emitUpdateStatus("installing")
      } catch (_: Throwable) {
        emitUpdateStatus("error")
      }
    }
  }

  inner class KafiBridge {
    @JavascriptInterface
    fun setKeepAwake(on: Boolean) {
      runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }

    @JavascriptInterface
    fun setBackIntercept(enabled: Boolean) {
      runOnUiThread {
        backCallback.isEnabled = enabled
      }
    }

    @JavascriptInterface
    fun installCachedApk() {
      val apkFile = File(cacheDir, "kafi-update.apk")
      if (apkFile.exists()) {
        launchApkInstaller(apkFile)
      } else {
        emitUpdateStatus("error")
      }
    }

    @JavascriptInterface
    fun downloadAndInstallApk(rawUrl: String) {
      Thread {
        try {
          var currentUrl = rawUrl
          var conn: HttpURLConnection? = null
          for (hop in 0 until 6) {
            val c = URL(currentUrl).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 30000
            val code = c.responseCode
            if (code in 300..399) {
              val next = c.getHeaderField("Location")
              c.disconnect()
              if (next.isNullOrBlank()) throw IllegalStateException("Empty redirect")
              currentUrl = next
            } else {
              conn = c
              break
            }
          }
          val active = conn ?: throw IllegalStateException("Too many redirects")
          if (active.responseCode !in 200..299) {
            active.disconnect()
            throw IllegalStateException("HTTP \${active.responseCode}")
          }
          val total = active.contentLengthLong
          val tmpFile = File(cacheDir, "kafi-update.apk.part")
          val outFile = File(cacheDir, "kafi-update.apk")
          var downloaded = 0L
          var lastPct = -1
          active.inputStream.use { input ->
            FileOutputStream(tmpFile).use { output ->
              val buf = ByteArray(16384)
              while (true) {
                val read = input.read(buf)
                if (read <= 0) break
                output.write(buf, 0, read)
                downloaded += read
                if (total > 0) {
                  val pct = ((downloaded * 100L) / total).toInt().coerceIn(0, 100)
                  if (pct != lastPct) {
                    lastPct = pct
                    emitUpdateProgress(pct)
                  }
                }
              }
            }
          }
          active.disconnect()
          if (outFile.exists()) outFile.delete()
          if (!tmpFile.renameTo(outFile)) throw IllegalStateException("Rename failed")
          emitUpdateProgress(100)
          launchApkInstaller(outFile)
        } catch (_: Throwable) {
          emitUpdateStatus("error")
        }
      }.start()
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

/** Idempotently ensures permissions and FileProvider exist in the generated AndroidManifest.xml. */
export function patchAndroidManifest(xml) {
  let next = xml;
  const missing = REQUIRED_PERMISSIONS.filter((perm) => !next.includes(perm));
  if (missing.length > 0) {
    const block = missing.map((perm) => `    <uses-permission android:name="${perm}" />`).join("\n");
    const idx = next.indexOf("<application");
    if (idx === -1) {
      throw new Error("Invalid AndroidManifest.xml: missing <application> tag");
    }
    next = `${next.slice(0, idx)}${block}\n${next.slice(idx)}`;
  }
  if (!next.includes(FILE_PROVIDER_MARKER)) {
    const closeIdx = next.lastIndexOf("</application>");
    if (closeIdx === -1) {
      throw new Error("Invalid AndroidManifest.xml: missing </application> tag");
    }
    next = `${next.slice(0, closeIdx)}${FILE_PROVIDER_XML}\n    ${next.slice(closeIdx)}`;
  }
  return next;
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
    console.log(`Patched permissions & FileProvider in ${manifestPath}`);
  } else {
    console.log(`Permissions & FileProvider already present in ${manifestPath}`);
  }

  const filePathsDir = path.join(path.dirname(manifestPath), "res", "xml");
  fs.mkdirSync(filePathsDir, { recursive: true });
  fs.writeFileSync(path.join(filePathsDir, "file_paths.xml"), FILE_PATHS_XML, "utf8");

  const activityPath = findMainActivity(path.join(path.dirname(manifestPath), "java"));
  if (!activityPath) throw new Error("MainActivity.kt not found next to the manifest");
  const activity = fs.readFileSync(activityPath, "utf8");
  const patched = patchMainActivity(activity);
  if (patched !== activity) {
    fs.writeFileSync(activityPath, patched, "utf8");
    console.log(`Patched MainActivity bridge in ${activityPath}`);
  }
}
