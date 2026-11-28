/**
 * The tajweed color groups of the colored mushaf, one place for both the page colors (the font
 * palette overrides in services/glyph-pages.ts) and the guide that explains them.
 *
 * `cpal` lists the color entries of Quran.com's QCF v4 tajweed fonts that draw the group (checked
 * against the fonts' own palette: 3 necessary madd, 9 obligatory madd, 4 permissible madd, 5 normal
 * madd, 6 ghunnah, 7 heavy letters, 8 qalqalah, 1/2/15 letters not pronounced).
 */
export interface TajweedRule {
  id: string;
  cpal: number[];
  colors: { light: string; sepia: string; dark: string };
  title: string;
  subtitle: string;
  body: string;
  /** Each case of the rule, with Arabic examples shown in the Quran font. */
  cases?: { text: string; examples?: string[] }[];
  examples?: string[];
}

export const TAJWEED_RULES: TajweedRule[] = [
  {
    id: "madd-6",
    cpal: [3],
    colors: { light: "#8a1c1c", sepia: "#86201c", dark: "#e06a6a" },
    title: "Mad 6 harakat",
    subtitle: "Mad Lazim",
    body: "Merah tua: wajib dipanjangkan 6 harakat. Terjadi ketika huruf mad bertemu huruf bersukun asli atau bertasydid, termasuk huruf di pembuka surah.",
    examples: ["ٱلضَّآلِّينَ", "الٓمٓ"],
  },
  {
    id: "madd-4-5",
    cpal: [9],
    colors: { light: "#d6338a", sepia: "#c92f80", dark: "#f07ab6" },
    title: "Mad 4 atau 5 harakat",
    subtitle: "Mad Wajib Muttasil",
    body: "Merah muda: dipanjangkan 4 atau 5 harakat. Terjadi ketika huruf mad bertemu hamzah dalam satu kata.",
    examples: ["ٱلسَّمَآءِ", "جَآءَ"],
  },
  {
    id: "madd-2-4-6",
    cpal: [4],
    colors: { light: "#e5782f", sepia: "#d8702b", dark: "#f2a066" },
    title: "Mad 2, 4, atau 6 harakat",
    subtitle: "Mad Jaiz",
    body: "Oranye: panjangnya boleh dipilih 2, 4, atau 6 harakat. Paling sering pada Mad 'Aridh lis-Sukun, yaitu huruf mad sebelum huruf terakhir ayat saat kita berhenti.",
    examples: ["ٱلْعَٰلَمِينَ", "نَسْتَعِينُ"],
  },
  {
    id: "madd-2",
    cpal: [5],
    colors: { light: "#c4912e", sepia: "#b5862a", dark: "#e3bd6a" },
    title: "Mad 2 harakat",
    subtitle: "Mad Thabi'i",
    body: "Kuning keemasan: dipanjangkan 2 harakat saja, seperti mad shilah (ha dhamir di antara dua huruf hidup) dan alif kecil.",
    examples: ["بِهِۦ", "إِنَّهُۥ"],
  },
  {
    id: "ghunnah",
    cpal: [6],
    colors: { light: "#3f9f55", sepia: "#3a924e", dark: "#66c482" },
    title: "Ghunnah",
    subtitle: "Dengung",
    body: "Hijau: dibaca berdengung dari hidung selama 2 harakat. Muncul dalam beberapa keadaan:",
    cases: [
      { text: "Nun atau mim bertasydid.", examples: ["إِنَّ", "ثُمَّ"] },
      {
        text: "Iqlab: nun sukun atau tanwin bertemu ba, dibaca seperti mim.",
        examples: ["مِنۢ بَعْدِ", "سَمِيعٌۢ بَصِيرٌ"],
      },
      {
        text: "Ikhfa': nun sukun atau tanwin bertemu salah satu dari 15 huruf ikhfa', bunyi nun disamarkan.",
        examples: ["أَنتُمْ", "مِن قَبْلِ"],
      },
      {
        text: "Idgham bighunnah: nun sukun atau tanwin bertemu ya, nun, mim, atau wau, lalu melebur.",
        examples: ["مَن يَقُولُ", "رَحِيمٌ وَدُودٌ"],
      },
      { text: "Ikhfa' syafawi: mim sukun bertemu ba.", examples: ["تَرْمِيهِم بِحِجَارَةٍ"] },
    ],
  },
  {
    id: "qalqalah",
    cpal: [8],
    colors: { light: "#45a5e0", sepia: "#3f97cc", dark: "#6dc6f0" },
    title: "Qalqalah",
    subtitle: "Pantulan",
    body: "Biru muda: huruf ق ط ب ج د yang bersukun dibaca memantul, lebih kuat lagi ketika berhenti di akhir ayat.",
    examples: ["أَحَدٌ", "يَجْعَلُونَ"],
  },
  {
    id: "tafkhim",
    cpal: [7],
    colors: { light: "#2a6395", sepia: "#295c88", dark: "#78a9d9" },
    title: "Tafkhim",
    subtitle: "Huruf tebal",
    body: "Biru tua: dibaca tebal. Ra yang tafkhim dan huruf isti'la' خ ص ض غ ط ق ظ.",
    examples: ["ٱلصِّرَٰطَ", "خَٰلِدِينَ"],
  },
  {
    id: "silent",
    cpal: [1, 2, 15],
    colors: { light: "#b0b0b0", sepia: "#a89f90", dark: "#7d7d7d" },
    title: "Tidak dibaca",
    subtitle: "Huruf yang tidak dilafalkan",
    body: "Abu-abu: huruf atau harakat yang tidak berbunyi, misalnya lam syamsiyah, alif washal di tengah bacaan, dan huruf yang melebur ke huruf sesudahnya.",
    examples: ["ٱلشَّمْسِ", "قَالُوا۟"],
  },
];

export const TAJWEED_RULES_EN: TajweedRule[] = [
  {
    id: "madd-6",
    cpal: [3],
    colors: { light: "#8a1c1c", sepia: "#86201c", dark: "#e06a6a" },
    title: "6-count elongation",
    subtitle: "Madd Lazim",
    body: "Dark red: must be stretched for 6 counts. Occurs when a madd letter is followed by a permanent sukun or shaddah, including disconnected surah opening letters.",
    examples: ["ٱلضَّآلِّينَ", "الٓمٓ"],
  },
  {
    id: "madd-4-5",
    cpal: [9],
    colors: { light: "#d6338a", sepia: "#c92f80", dark: "#f07ab6" },
    title: "4 or 5-count elongation",
    subtitle: "Madd Wajib Muttasil",
    body: "Pink: stretched for 4 or 5 counts. Occurs when a madd letter is followed by a hamzah within the same word.",
    examples: ["ٱلسَّمَآءِ", "جَآءَ"],
  },
  {
    id: "madd-2-4-6",
    cpal: [4],
    colors: { light: "#e5782f", sepia: "#d8702b", dark: "#f2a066" },
    title: "2, 4, or 6-count elongation",
    subtitle: "Madd Jaiz",
    body: "Orange: may be stretched 2, 4, or 6 counts. Most common on Madd 'Arid lis-Sukun when stopping at the end of an ayah.",
    examples: ["ٱلْعَٰلَمِينَ", "نَسْتَعِينُ"],
  },
  {
    id: "madd-2",
    cpal: [5],
    colors: { light: "#c4912e", sepia: "#b5862a", dark: "#e3bd6a" },
    title: "2-count elongation",
    subtitle: "Madd Tabi'i",
    body: "Gold: stretched for 2 counts, such as madd silah (ha pronoun between two vowelled letters) and dagger alif.",
    examples: ["بِهِۦ", "إِنَّهُۥ"],
  },
  {
    id: "ghunnah",
    cpal: [6],
    colors: { light: "#3f9f55", sepia: "#3a924e", dark: "#66c482" },
    title: "Ghunnah",
    subtitle: "Nasalization",
    body: "Green: held with a 2-count nasal sound. Applies in several cases:",
    cases: [
      { text: "Nun or mim with shaddah.", examples: ["إِنَّ", "ثُمَّ"] },
      {
        text: "Iqlab: nun sakinah or tanwin before ba, pronounced like mim.",
        examples: ["مِنۢ بَعْدِ", "سَمِيعٌۢ بَصِيرٌ"],
      },
      {
        text: "Ikhfa': nun sakinah or tanwin before any of the 15 ikhfa' letters, softly concealed.",
        examples: ["أَنتُمْ", "مِن قَبْلِ"],
      },
      {
        text: "Idgham with ghunnah: nun sakinah or tanwin merging into ya, nun, mim, or waw.",
        examples: ["مَن يَقُولُ", "رَحِيمٌ وَدُودٌ"],
      },
      { text: "Labial ikhfa': mim sakinah before ba.", examples: ["تَرْمِيهِم بِحِجَارَةٍ"] },
    ],
  },
  {
    id: "qalqalah",
    cpal: [8],
    colors: { light: "#45a5e0", sepia: "#3f97cc", dark: "#6dc6f0" },
    title: "Qalqalah",
    subtitle: "Echo / bounce",
    body: "Light blue: the letters ق ط ب ج د with sukun are pronounced with a slight bounce, stronger when stopping at the end of an ayah.",
    examples: ["أَحَدٌ", "يَجْعَلُونَ"],
  },
  {
    id: "tafkhim",
    cpal: [7],
    colors: { light: "#2a6395", sepia: "#295c88", dark: "#78a9d9" },
    title: "Tafkhim",
    subtitle: "Heavy letters",
    body: "Dark blue: pronounced with fullness (heavy). Heavy ra and the elevated letters خ ص ض غ ط ق ظ.",
    examples: ["ٱلصِّرَٰطَ", "خَٰلِدِينَ"],
  },
  {
    id: "silent",
    cpal: [1, 2, 15],
    colors: { light: "#b0b0b0", sepia: "#a89f90", dark: "#7d7d7d" },
    title: "Silent",
    subtitle: "Unpronounced letters",
    body: "Gray: letters or marks not pronounced aloud, such as sun-letter lam, connecting hamzat al-wasl mid-recitation, and merged letters.",
    examples: ["ٱلشَّمْسِ", "قَالُوا۟"],
  },
];
