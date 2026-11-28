import { useEffect } from "react";
import { REPORT_URL, SOURCE_CODE_URL, SOURCE_GROUPS } from "../data/acknowledgements";

export interface AboutSourcesProps {
  onClose: () => void;
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** About Kafi: where every part of the mushaf, translations, audio and Tasmi' comes from. */
export function AboutSources({ onClose }: AboutSourcesProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="palette-backdrop" role="dialog" aria-modal="true" aria-label="Tentang & Sumber Data" onClick={onClose}>
      <div className="about" onClick={(e) => e.stopPropagation()}>
        <div className="about__header">
          <h2 className="about__title">Tentang & Sumber Data</h2>
          <button type="button" className="ayah-popover__close" aria-label="Tutup" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="about__body">
          <div className="about__intro">
            <p className="about__app">Kafi</p>
            <p>
              Aplikasi Al-Qur&apos;an gratis dan open source. Jangan lupakan para kontributor dan penyedia data di
              bawah ini dalam doa Anda.
            </p>
          </div>

          {SOURCE_GROUPS.map((group) => (
            <section key={group.title} className="about__group" aria-label={group.title}>
              <h3 className="about__group-title">{group.title}</h3>
              <ul className="about__list">
                {group.sources.map((source) => (
                  <li key={source.name} className="about__source">
                    <span className="about__name">{source.name}</span>
                    <span className="about__detail">{source.detail}</span>
                    {(source.url || source.license) && (
                      <span className="about__meta">
                        {source.url && (
                          <a href={source.url} target="_blank" rel="noopener noreferrer">
                            {host(source.url)}
                          </a>
                        )}
                        {source.url && source.license && " · "}
                        {source.license}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="about__group" aria-label="Keakuratan teks">
            <h3 className="about__group-title">Keakuratan teks</h3>
            <div className="about__note">
              <p>
                Teks mushaf tidak diketik ulang: setiap halaman digambar dari font Kompleks Raja Fahd. Data mushaf
                offline diperiksa otomatis terhadap Tanzil, mencakup kelengkapan dan urutan ayat, jumlah kata, awal
                halaman, dan glyph yang tergambar. Kafi belum ditashih oleh Lajnah Pentashihan Mushaf Al-Qur&apos;an.
              </p>
              <p>
                Menemukan kesalahan?{" "}
                <a href={REPORT_URL} target="_blank" rel="noopener noreferrer">
                  Laporkan di sini
                </a>
                .
              </p>
            </div>
          </section>

          <p className="about__footer">
            Kode sumber:{" "}
            <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">
              {host(SOURCE_CODE_URL)}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
