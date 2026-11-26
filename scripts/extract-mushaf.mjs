import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

const MUSHAF_WIDTH = 699;
const MUSHAF_HEIGHT = 1020;
const TOTAL_PAGES = 604;
const XHTML_PAGE_OFFSET = 2; // Mushaf page 1..604 -> page3.xhtml..page606.xhtml

const DEFAULT_APP_NW = "/Applications/Quranflash.app/Contents/Resources/app.nw";

// [surahNumber, arabicName, ayahCount] verified against Quran.com v4 chapters
const SURAH_METADATA = [
  [1, "الفاتحة", 7], [2, "البقرة", 286], [3, "آل عمران", 200], [4, "النساء", 176],
  [5, "المائدة", 120], [6, "الأنعام", 165], [7, "الأعراف", 206], [8, "الأنفال", 75],
  [9, "التوبة", 129], [10, "يونس", 109], [11, "هود", 123], [12, "يوسف", 111],
  [13, "الرعد", 43], [14, "ابراهيم", 52], [15, "الحجر", 99], [16, "النحل", 128],
  [17, "الإسراء", 111], [18, "الكهف", 110], [19, "مريم", 98], [20, "طه", 135],
  [21, "الأنبياء", 112], [22, "الحج", 78], [23, "المؤمنون", 118], [24, "النور", 64],
  [25, "الفرقان", 77], [26, "الشعراء", 227], [27, "النمل", 93], [28, "القصص", 88],
  [29, "العنكبوت", 69], [30, "الروم", 60], [31, "لقمان", 34], [32, "السجدة", 30],
  [33, "الأحزاب", 73], [34, "سبإ", 54], [35, "فاطر", 45], [36, "يس", 83],
  [37, "الصافات", 182], [38, "ص", 88], [39, "الزمر", 75], [40, "غافر", 85],
  [41, "فصلت", 54], [42, "الشورى", 53], [43, "الزخرف", 89], [44, "الدخان", 59],
  [45, "الجاثية", 37], [46, "الأحقاف", 35], [47, "محمد", 38], [48, "الفتح", 29],
  [49, "الحجرات", 18], [50, "ق", 45], [51, "الذاريات", 60], [52, "الطور", 49],
  [53, "النجم", 62], [54, "القمر", 55], [55, "الرحمن", 78], [56, "الواقعة", 96],
  [57, "الحديد", 29], [58, "المجادلة", 22], [59, "الحشر", 24], [60, "الممتحنة", 13],
  [61, "الصف", 14], [62, "الجمعة", 11], [63, "المنافقون", 11], [64, "التغابن", 18],
  [65, "الطلاق", 12], [66, "التحريم", 12], [67, "الملك", 30], [68, "القلم", 52],
  [69, "الحاقة", 52], [70, "المعارج", 44], [71, "نوح", 28], [72, "الجن", 28],
  [73, "المزمل", 20], [74, "المدثر", 56], [75, "القيامة", 40], [76, "الانسان", 31],
  [77, "المرسلات", 50], [78, "النبإ", 40], [79, "النازعات", 46], [80, "عبس", 42],
  [81, "التكوير", 29], [82, "الإنفطار", 19], [83, "المطففين", 36], [84, "الإنشقاق", 25],
  [85, "البروج", 22], [86, "الطارق", 17], [87, "الأعلى", 19], [88, "الغاشية", 26],
  [89, "الفجر", 30], [90, "البلد", 20], [91, "الشمس", 15], [92, "الليل", 21],
  [93, "الضحى", 11], [94, "الشرح", 8], [95, "التين", 8], [96, "العلق", 19],
  [97, "القدر", 5], [98, "البينة", 8], [99, "الزلزلة", 8], [100, "العاديات", 11],
  [101, "القارعة", 11], [102, "التكاثر", 8], [103, "العصر", 3], [104, "الهمزة", 9],
  [105, "الفيل", 5], [106, "قريش", 4], [107, "الماعون", 7], [108, "الكوثر", 3],
  [109, "الكافرون", 6], [110, "النصر", 3], [111, "المسد", 5], [112, "الإخلاص", 4],
  [113, "الفلق", 5], [114, "الناس", 6],
];

// [juzNumber, startSurah, startAyah]
const JUZ_STARTS = [
  [1, 1, 1], [2, 2, 142], [3, 2, 253], [4, 3, 93], [5, 4, 24], [6, 4, 148],
  [7, 5, 82], [8, 6, 111], [9, 7, 88], [10, 8, 41], [11, 9, 93], [12, 11, 6],
  [13, 12, 53], [14, 15, 1], [15, 17, 1], [16, 18, 75], [17, 21, 1], [18, 23, 1],
  [19, 25, 21], [20, 27, 56], [21, 29, 46], [22, 33, 31], [23, 36, 28], [24, 39, 32],
  [25, 41, 47], [26, 46, 1], [27, 51, 31], [28, 58, 1], [29, 67, 1], [30, 78, 1],
];

const RECITERS = [
  { id: "Alafasy_128kbps", name: "Mishary Rashid Alafasy", arabicName: "مشاري راشد العفاسي", style: "Murattal", subfolder: "Alafasy_128kbps" },
  { id: "Husary_128kbps", name: "Mahmoud Khalil Al-Husary", arabicName: "محمود خليل الحصري", style: "Murattal", subfolder: "Husary_128kbps" },
  { id: "Abdul_Basit_Murattal_192kbps", name: "Abdul Basit 'Abdus-Samad", arabicName: "عبد الباسط عبد الصمد", style: "Murattal", subfolder: "Abdul_Basit_Murattal_192kbps" },
  { id: "Minshawy_Murattal_128kbps", name: "Mohamed Siddiq Al-Minshawy", arabicName: "محمد صديق المنشاوي", style: "Murattal", subfolder: "Minshawy_Murattal_128kbps" },
  { id: "Abdurrahmaan_As-Sudais_192kbps", name: "Abdurrahman As-Sudais", arabicName: "عبد الرحمن السديس", style: "Murattal", subfolder: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "Ghamadi_40kbps", name: "Saad Al-Ghamdi", arabicName: "سعد الغامدي", style: "Murattal", subfolder: "Ghamadi_40kbps" },
  { id: "MaherAlMuaiqly128kbps", name: "Maher Al-Muaiqly", arabicName: "ماهر المعيقلي", style: "Murattal", subfolder: "MaherAlMuaiqly128kbps" },
  { id: "Saood_ash-Shuraym_128kbps", name: "Saud Al-Shuraim", arabicName: "سعود الشريم", style: "Murattal", subfolder: "Saood_ash-Shuraym_128kbps" },
  { id: "Abu_Bakr_Ash-Shaatree_128kbps", name: "Abu Bakr Al-Shatri", arabicName: "أبو بكر الشاطري", style: "Murattal", subfolder: "Abu_Bakr_Ash-Shaatree_128kbps" },
  { id: "Hani_Rifai_192kbps", name: "Hani Ar-Rifai", arabicName: "هاني الرفاعي", style: "Murattal", subfolder: "Hani_Rifai_192kbps" },
];

const TRANSLATIONS = [
  { id: 33, name: "Kemenag RI (Bahasa Indonesia)", author: "Kementerian Agama RI", language: "indonesian" },
  { id: 134, name: "Kompleks Raja Fahd (Indonesia)", author: "King Fahad Quran Complex", language: "indonesian" },
  { id: 141, name: "The Sabiq Company (Indonesia)", author: "The Sabiq Company", language: "indonesian" },
  { id: 20, name: "Saheeh International", author: "Saheeh International", language: "english" },
  { id: 85, name: "M.A.S. Abdel Haleem", author: "Abdul Haleem", language: "english" },
  { id: 22, name: "A. Yusuf Ali", author: "Abdullah Yusuf Ali", language: "english" },
  { id: 57, name: "Transliteration", author: "Transliteration", language: "english" },
];

const TAFSIRS = [
  { id: "equran-id", name: "Tafsir Kemenag RI (Lengkap)", author: "Kementerian Agama RI", language: "indonesian", source: "equran" },
  { id: "16", name: "Tafsir al-Muyassar", author: "King Fahad Quran Complex", language: "arabic", source: "qurancom", resourceId: 16 },
  { id: "14", name: "Tafsir Ibn Kathir", author: "Hafiz Ibn Kathir", language: "arabic", source: "qurancom", resourceId: 14 },
  { id: "15", name: "Tafsir al-Tabari", author: "Imam al-Tabari", language: "arabic", source: "qurancom", resourceId: 15 },
  { id: "90", name: "Tafsir al-Qurtubi", author: "Imam al-Qurtubi", language: "arabic", source: "qurancom", resourceId: 90 },
  { id: "91", name: "Tafsir al-Sa'di", author: "Abdurrahman al-Sa'di", language: "arabic", source: "qurancom", resourceId: 91 },
  { id: "169", name: "Ibn Kathir (Abridged)", author: "Hafiz Ibn Kathir", language: "english", source: "qurancom", resourceId: 169 },
];

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStyleNumber(style, prop, fallback = 0) {
  const match = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([+-]?\\d*\\.?\\d+)(?:px)?`, "i"));
  return match ? Number(match[1]) : fallback;
}

function readScale(style) {
  const match = style.match(/transform\s*:\s*scale\(\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+))?\s*\)/i);
  if (!match) return [1, 1];
  const sx = Number(match[1]);
  const sy = match[2] !== undefined ? Number(match[2]) : sx;
  return [sx, sy];
}

function getTagStyleByClass(html, className) {
  const match = html.match(new RegExp(`<div[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*style=["']([^"']*)["']`, "i"))
    ?? html.match(new RegExp(`<div[^>]*style=["']([^"']*)["'][^>]*class=["'][^"']*\\b${className}\\b[^"']*["']`, "i"));
  return match ? match[1] : "";
}

export function parsePageXhtml(html, pageNum) {
  const [scaler] = readScale(getTagStyleByClass(html, "btnScaler"));
  const containerStyle = getTagStyleByClass(html, "btnContainer");
  const offsetX = readStyleNumber(containerStyle, "left", 0);
  const offsetY = readStyleNumber(containerStyle, "top", 0);
  const [sx, sy] = readScale(containerStyle);

  const imgMatch = html.match(/<img[^>]*src=["'][^"']*\/([^/"']+\.gif)["']/i);
  const imageFile = imgMatch ? imgMatch[1] : `${String(pageNum + 3).padStart(4, "0")}.gif`;
  const padded = String(pageNum).padStart(3, "0");

  const ayahsByKey = new Map();
  const surahsSeen = new Set();
  const vBtnRegex = /<div\b([^>]*\bclass=["'][^"']*\bvBtn\b[^"']*["'][^>]*)>/gi;

  for (const match of html.matchAll(vBtnRegex)) {
    const attrs = match[1];
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    if (!idMatch) continue;
    const ayahMatch = idMatch[1].match(/^v(\d+)_(\d+)(?:_\d+)?$/);
    if (!ayahMatch) continue;

    const styleMatch = attrs.match(/\bstyle=["']([^"']*)["']/i);
    if (!styleMatch) continue;
    const style = styleMatch[1];

    const surah = Number(ayahMatch[1]);
    const ayah = Number(ayahMatch[2]);
    const left = readStyleNumber(style, "left");
    const top = readStyleNumber(style, "top");
    const width = readStyleNumber(style, "width");
    const height = readStyleNumber(style, "height");

    const px = scaler * (offsetX + sx * left);
    const py = scaler * (offsetY + sy * top);
    const pw = scaler * sx * width;
    const ph = scaler * sy * height;

    const x1 = clamp((px / MUSHAF_WIDTH) * 100, 0, 100);
    const y1 = clamp((py / MUSHAF_HEIGHT) * 100, 0, 100);
    const x2 = clamp(((px + pw) / MUSHAF_WIDTH) * 100, 0, 100);
    const y2 = clamp(((py + ph) / MUSHAF_HEIGHT) * 100, 0, 100);

    const x = round3(x1);
    const y = round3(y1);
    const w = round3(Math.min(100 - x, Math.max(0, x2 - x1)));
    const h = round3(Math.min(100 - y, Math.max(0, y2 - y1)));

    const key = `${surah}:${ayah}`;
    surahsSeen.add(surah);
    let entry = ayahsByKey.get(key);
    if (!entry) {
      entry = { surah, ayah, boxes: [] };
      ayahsByKey.set(key, entry);
    }
    entry.boxes.push([x, y, w, h]);
  }

  return {
    page: pageNum,
    image: `${padded}.gif`,
    imageFile,
    surahs: [...surahsSeen],
    ayahs: [...ayahsByKey.values()],
  };
}

function parseChaptersXml(xml) {
  const chapters = [];
  for (const m of xml.matchAll(/<chapter\s+title="([^"]+)"\s+page="(\d+)"\s+loc="(mecca|medina)"\s*\/>/g)) {
    chapters.push({ name: m[1], page: Number(m[2]), location: m[3] });
  }
  return chapters;
}

function findFileRecursive(rootDir, targetName) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    if (entry.name === targetName) return full;
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, targetName);
      if (found) return found;
    }
  }
  return null;
}

function openAppNwArchive(rootDir) {
  const appNwPath = process.env.QURANFLASH_APP_NW || DEFAULT_APP_NW;
  if (fs.existsSync(appNwPath)) {
    return { zip: new AdmZip(appNwPath), cleanup: () => {} };
  }

  const pkgPath = path.join(rootDir, "Quranflash.pkg");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Neither ${appNwPath} nor ${pkgPath} exists.`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kafi-pkg-"));
  try {
    const expandedDir = path.join(tmpDir, "expanded");
    execFileSync("pkgutil", ["--expand-full", pkgPath, expandedDir]);
    const extractedAppNw = findFileRecursive(expandedDir, "app.nw");
    if (!extractedAppNw) {
      throw new Error("Could not locate app.nw inside expanded Quranflash.pkg");
    }
    return {
      zip: new AdmZip(extractedAppNw),
      cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
    };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

export function extractMushaf(rootDir = process.cwd()) {
  const { zip, cleanup } = openAppNwArchive(rootDir);
  try {
    const pagesOutDir = path.join(rootDir, "public/mushaf/pages");
    const dataOutDir = path.join(rootDir, "src/data");
    fs.mkdirSync(pagesOutDir, { recursive: true });
    fs.mkdirSync(dataOutDir, { recursive: true });

    const chaptersEntry = zip.getEntry("books/Medina1/EPUB/xml/chapters.xml");
    if (!chaptersEntry) throw new Error("Missing books/Medina1/EPUB/xml/chapters.xml");
    const chapters = parseChaptersXml(chaptersEntry.getData().toString("utf8"));
    if (chapters.length !== 114) {
      throw new Error(`Expected 114 chapters in chapters.xml, got ${chapters.length}`);
    }

    const maxAyahBySurah = Object.fromEntries(SURAH_METADATA.map(([num, , count]) => [num, count]));
    const pages = [];
    const ayahToPage = {};
    let prevPageAyahKeys = new Set();

    for (let pageNum = 1; pageNum <= TOTAL_PAGES; pageNum++) {
      const xhtmlName = `books/Medina1/EPUB/xhtml/raw/page${pageNum + XHTML_PAGE_OFFSET}.xhtml`;
      const xhtmlEntry = zip.getEntry(xhtmlName);
      if (!xhtmlEntry) throw new Error(`Missing ${xhtmlName}`);

      const parsed = parsePageXhtml(xhtmlEntry.getData().toString("utf8"), pageNum);
      const imgEntry = zip.getEntry(`books/Medina1/EPUB/imgs/${parsed.imageFile}`);
      if (!imgEntry) throw new Error(`Missing image ${parsed.imageFile} for page ${pageNum}`);
      fs.writeFileSync(path.join(pagesOutDir, parsed.image), imgEntry.getData());

      // Quranflash source quirk: page604.xhtml mislabels the tail box of 107:7 as v107_8_1; clamp into max ayah.
      const normalizedAyahs = [];
      const byKey = new Map();
      for (const seg of parsed.ayahs) {
        const clampedAyah = Math.min(seg.ayah, maxAyahBySurah[seg.surah] ?? seg.ayah);
        const key = `${seg.surah}:${clampedAyah}`;
        let target = byKey.get(key);
        if (!target) {
          target = { surah: seg.surah, ayah: clampedAyah, boxes: [] };
          byKey.set(key, target);
          normalizedAyahs.push(target);
        }
        target.boxes.push(...seg.boxes);
      }

      const pageEntry = {
        page: parsed.page,
        image: parsed.image,
        surahs: parsed.surahs,
        ayahs: normalizedAyahs,
      };

      const currentKeys = new Set();
      for (const seg of normalizedAyahs) {
        const key = `${seg.surah}:${seg.ayah}`;
        currentKeys.add(key);
        if (ayahToPage[key] === undefined) {
          ayahToPage[key] = pageNum;
        }
      }

      if (pageNum > 1 && normalizedAyahs.length > 0) {
        const firstKey = `${normalizedAyahs[0].surah}:${normalizedAyahs[0].ayah}`;
        if (prevPageAyahKeys.has(firstKey)) {
          pageEntry.leadingSplitAyah = firstKey;
        }
      }

      prevPageAyahKeys = currentKeys;
      pages.push(pageEntry);
    }

    const surahToPage = {};
    const surahs = SURAH_METADATA.map(([number, arabicName, ayahs], idx) => {
      const ch = chapters[idx];
      const page = ayahToPage[`${number}:1`] ?? ch.page;
      surahToPage[number] = page;
      return {
        number,
        name: ch.name,
        arabicName,
        ayahs,
        page,
        location: ch.location,
      };
    });

    const juzs = JUZ_STARTS.map(([number, startSurah, startAyah]) => ({
      number,
      page: ayahToPage[`${startSurah}:${startAyah}`],
      startSurah,
      startAyah,
    }));

    const mushafMap = {
      width: MUSHAF_WIDTH,
      height: MUSHAF_HEIGHT,
      pages,
      ayahToPage,
      surahToPage,
    };

    const catalog = {
      surahs,
      juzs,
      reciters: RECITERS,
      translations: TRANSLATIONS,
      tafsirs: TAFSIRS,
    };

    fs.writeFileSync(path.join(dataOutDir, "mushaf-map.json"), JSON.stringify(mushafMap));
    fs.writeFileSync(path.join(dataOutDir, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");

    return { pages: pages.length, ayahs: Object.keys(ayahToPage).length };
  } finally {
    cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stats = extractMushaf(process.cwd());
  console.log(`Extracted ${stats.pages} pages and ${stats.ayahs} ayahs.`);
}
