import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "public", "mushaf", "pages");
const destDir = path.join(root, "src-tauri", "resources", "mushaf", "pages");

if (!fs.existsSync(srcDir)) {
  throw new Error(`Missing ${srcDir} — run "npm run extract:mushaf" first.`);
}

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".gif")).sort();
if (files.length === 0) {
  throw new Error(`No .gif pages found in ${srcDir} — run "npm run extract:mushaf" first.`);
}

fs.mkdirSync(destDir, { recursive: true });
let copied = 0;
for (const file of files) {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(destPath) && fs.statSync(destPath).size === fs.statSync(srcPath).size) {
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  copied++;
}

console.log(`Prepared ${files.length} Mushaf pages for desktop bundle (${copied} copied).`);
