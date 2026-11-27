/** Where each piece of the app's content comes from, shown on the "Tentang & Sumber Data" screen. */
export interface Source {
  name: string;
  /** What Kafi takes from it, in one or two short sentences. */
  detail: string;
  url?: string;
  license?: string;
}

export interface SourceGroup {
  title: string;
  sources: Source[];
}

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    title: "Mushaf",
    sources: [
      {
        name: "Kompleks Raja Fahd (KFGQPC)",
        detail:
          "Halaman Mushaf Madinah 15 baris (cetakan 1405 dan 1441) digambar dengan font glyph QCF dari Kompleks Percetakan Al-Qur'an Raja Fahd, Madinah.",
        url: "https://qurancomplex.gov.sa/",
      },
      {
        name: "Quran.com",
        detail:
          "Tata letak halaman, font QCF v1 dan font tajwid berwarna (v4), serta terjemahan per kata, lewat Quran.com API v4.",
        url: "https://quran.com/",
      },
      {
        name: "Tanzil",
        detail:
          "Teks Utsmani untuk pencarian dan Tasmi', serta data rujukan untuk memeriksa bahwa setiap ayat, kata, dan halaman mushaf offline lengkap dan berurutan.",
        url: "https://tanzil.net/",
        license: "CC BY 3.0",
      },
    ],
  },
  {
    title: "Terjemahan & Tafsir",
    sources: [
      {
        name: "Quran.com API",
        detail:
          "Terjemahan Kemenag RI, Kompleks Raja Fahd, The Sabiq Company, Saheeh International, Abdel Haleem, Yusuf Ali, dan transliterasi; tafsir Al-Muyassar, Ibnu Katsir, Ath-Thabari, Al-Qurthubi, dan As-Sa'di.",
        url: "https://api-docs.quran.com/",
      },
      {
        name: "EQuran.id",
        detail: "Tafsir Kemenag RI berbahasa Indonesia.",
        url: "https://equran.id/",
      },
      {
        name: "Tafsir API (spa5k)",
        detail: "Tafsir As-Sa'di dan Al-Mukhtashar berbahasa Indonesia.",
        url: "https://github.com/spa5k/tafsir_api",
      },
    ],
  },
  {
    title: "Murottal",
    sources: [
      {
        name: "EveryAyah",
        detail:
          "Audio per ayat: Mishary Alafasy, Al-Husary, Abdul Basit, Al-Minshawy, As-Sudais, Al-Ghamdi, Al-Muaiqly, Asy-Syuraim, Asy-Syatri, dan Hani Ar-Rifai.",
        url: "https://everyayah.com/",
      },
    ],
  },
  {
    title: "Tasmi' (pengenalan bacaan)",
    sources: [
      {
        name: "Tilawa",
        detail: "Engine pengenalan bacaan dan koreksi hafalan yang berjalan di perangkat, beserta modelnya.",
        url: "https://tilawa.dev/",
        license: "MIT, model CC BY 4.0",
      },
      {
        name: "Tarteel tlog",
        detail: "Dataset audio bacaan untuk melatih dan menguji model Tilawa.",
        url: "https://huggingface.co/datasets/tarteel-ai/tlog",
        license: "CC BY",
      },
      {
        name: "QUD Technologies",
        detail: "Dataset Quranic Universal Ayahs untuk audio dan pencocokan ayat.",
        url: "https://huggingface.co/datasets/QUD-Technologies/quranic-universal-ayahs",
        license: "CC BY",
      },
      {
        name: "Muaalem & quran-transcript",
        detail: "Model guru dan fonemisasi bacaan sebagai rujukan.",
        url: "https://github.com/obadx/quran-transcript",
        license: "MIT",
      },
      {
        name: "k2-fsa Icefall",
        detail: "Arsitektur Zipformer dan ekspor model ke ONNX.",
        url: "https://github.com/k2-fsa/icefall",
        license: "Apache-2.0",
      },
      {
        name: "ONNX Runtime",
        detail: "Menjalankan model di browser dan perangkat.",
        url: "https://github.com/microsoft/onnxruntime",
        license: "MIT",
      },
    ],
  },
  {
    title: "Huruf",
    sources: [
      {
        name: "Amiri",
        detail: "Kaligrafi basmalah di awal surah.",
        url: "https://github.com/aliftype/amiri",
        license: "SIL OFL 1.1",
      },
    ],
  },
];

export const SOURCE_CODE_URL = "https://github.com/jafoam/Kafi";
export const REPORT_URL = "https://github.com/jafoam/Kafi/issues/new";
