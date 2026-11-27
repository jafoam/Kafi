import { useState } from "react";

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

const STEPS: Step[] = [
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

export function TasmiGuide({ onClose, onStart }: TasmiGuideProps) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <div className="palette-backdrop" role="dialog" aria-modal="true" aria-label="Panduan Tasmi'" onClick={onClose}>
      <div className="tasmi-guide" onClick={(e) => e.stopPropagation()}>
        <div className="tasmi-guide__header">
          <span className="tasmi-guide__eyebrow">
            Panduan Tasmi&apos; · {index + 1}/{STEPS.length}
          </span>
          <button type="button" className="ayah-popover__close" aria-label="Tutup" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tasmi-guide__progress" aria-hidden="true">
          {STEPS.map((_, i) => (
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
              Kembali
            </button>
          ) : (
            <button type="button" className="tasmi-hint__later" onClick={onStart}>
              Lewati, langsung mulai
            </button>
          )}
          <button
            type="button"
            className="tasmi-hint__primary"
            onClick={() => (last ? onStart() : setIndex(index + 1))}
          >
            {last ? "Mulai Tasmi' sekarang" : "Lanjut"}
          </button>
        </div>
      </div>
    </div>
  );
}
