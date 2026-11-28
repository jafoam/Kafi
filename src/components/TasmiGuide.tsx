import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export interface TasmiGuideProps {
  onClose: () => void;
  /** Close the guide and open the Tasmi' sheet. */
  onStart: () => void;
}

interface Step {
  title: string;
  body: string;
  points?: string[];
}

const STEPS_ID: Step[] = [
  {
    title: "Pilih ayat yang mau disetor",
    body: "Ketuk tombol Tasmi'. Surah dan ayat di halaman yang sedang terbuka sudah terpilih, tinggal atur rentangnya.",
    points: [
      "Hafalan: setor hafalan dari ayat ke ayat",
      "Uji Acak: aplikasi memutar potongan ayat, kamu melanjutkan",
      "Baca Bebas: baca dari mana saja, aplikasi mengikuti",
    ],
  },
  {
    title: "Izinkan mikrofon, sekali saja",
    body: "Saat pertama kali, aplikasi mengunduh model suara lalu meminta izin mikrofon. Setelah itu Tasmi' jalan tanpa internet, dan suaramu tidak pernah dikirim ke mana pun.",
  },
  {
    title: "Bacakan dengan tartil",
    body: "Baca seperti setor ke guru. Ayat yang sudah kamu baca terbuka satu per satu di halaman.",
    points: [
      "Aktifkan Sembunyikan Ayat agar tidak tergoda melihat",
      "Lupa? Ketuk ayat untuk mengintip, nanti dicatat untuk diulang",
    ],
  },
  {
    title: "Lihat hasil dan ulangi yang salah",
    body: "Setelah selesai, kamu melihat ayat yang salah atau terlewat. Ayat itu masuk ke Muraja'ah Hari Ini supaya diulang di waktu yang tepat.",
  },
];

const STEPS_EN: Step[] = [
  {
    title: "Choose the ayahs to recite",
    body: "Tap the Tasmi' button. The surah and ayahs on your open page are already selected, just adjust the range.",
    points: [
      "Memorization: recite your passage ayah by ayah",
      "Random Test: the app plays a prompt ayah, and you continue",
      "Free Recite: start anywhere and the mushaf follows along",
    ],
  },
  {
    title: "Allow microphone access once",
    body: "On first use, the app downloads the speech model and requests microphone access. After that, Tasmi' runs completely offline and your voice never leaves your device.",
  },
  {
    title: "Recite steadily",
    body: "Recite as you would to a teacher. Each ayah you recite reveals automatically on the page.",
    points: [
      "Turn on Hide Ayahs to avoid peeking",
      "Forgot a word? Tap an ayah to peek, and it will be logged for review",
    ],
  },
  {
    title: "Review results and drill mistakes",
    body: "When finished, you will see any missed or incorrect ayahs. They are scheduled in Today's Muraja'ah so you revisit them at the right time.",
  },
];

export function TasmiGuide({ onClose, onStart }: TasmiGuideProps) {
  const { isEn, tr } = useI18n();
  const steps = isEn ? STEPS_EN : STEPS_ID;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Panduan Tasmi'", "Tasmi' Guide")}
      onClick={onClose}
    >
      <div className="tasmi-guide" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-guide__header">
          <span className="tasmi-guide__eyebrow">
            {tr("Panduan Tasmi'", "Tasmi' Guide")} · {index + 1}/{steps.length}
          </span>
          <button type="button" className="ayah-popover__close" aria-label={tr("Tutup", "Close")} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tasmi-guide__progress" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`tasmi-guide__bar ${i <= index ? "tasmi-guide__bar--on" : ""}`} />
          ))}
        </div>

        <div className="tasmi-guide__step" key={index}>
          <span className="tasmi-guide__num">{index + 1}</span>
          <h2 className="tasmi-guide__title">{step.title}</h2>
          <p className="tasmi-guide__body">{step.body}</p>
          {step.points && (
            <ul className="tasmi-guide__points">
              {step.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="tasmi-guide__actions">
          {index > 0 ? (
            <button type="button" className="tasmi-hint__later" onClick={() => setIndex(index - 1)}>
              {tr("Kembali", "Back")}
            </button>
          ) : (
            <button type="button" className="tasmi-hint__later" onClick={onStart}>
              {tr("Lewati, langsung mulai", "Skip and start")}
            </button>
          )}
          <button
            type="button"
            className="tasmi-hint__primary"
            onClick={() => (last ? onStart() : setIndex(index + 1))}
          >
            {last ? tr("Mulai Tasmi' sekarang", "Start Tasmi' now") : tr("Lanjut", "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
