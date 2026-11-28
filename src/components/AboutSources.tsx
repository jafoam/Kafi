import { useEffect } from "react";
import { REPORT_URL, SOURCE_CODE_URL, SOURCE_GROUPS, SOURCE_GROUPS_EN } from "../data/acknowledgements";
import { useI18n } from "../i18n";

export interface AboutSourcesProps {
  onClose: () => void;
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** About Kafi: where every part of the mushaf, translations, audio and Tasmi' comes from. */
export function AboutSources({ onClose }: AboutSourcesProps) {
  const { isEn, tr } = useI18n();
  const groups = isEn ? SOURCE_GROUPS_EN : SOURCE_GROUPS;

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
      aria-label={tr("Tentang & Sumber Data", "About & Data Sources")}
      onClick={onClose}
    >
      <div className="about" onClick={(e) => e.stopPropagation()}>
        <div className="about__header">
          <h2 className="about__title">{tr("Tentang & Sumber Data", "About & Data Sources")}</h2>
          <button type="button" className="ayah-popover__close" aria-label={tr("Tutup", "Close")} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="about__body">
          <div className="about__intro">
            <p className="about__app">Kafi</p>
            <p>
              {tr(
                "Aplikasi Al-Qur'an gratis dan open source. Jangan lupakan para kontributor dan penyedia data di bawah ini dalam doa Anda.",
                "A free and open-source Quran app. Please keep the contributors and data providers below in your prayers.",
              )}
            </p>
          </div>

          {groups.map((group) => (
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

          <section className="about__group" aria-label={tr("Keakuratan teks", "Text accuracy")}>
            <h3 className="about__group-title">{tr("Keakuratan teks", "Text accuracy")}</h3>
            <div className="about__note">
              <p>
                {tr(
                  "Teks mushaf tidak diketik ulang: setiap halaman digambar dari font Kompleks Raja Fahd. Data mushaf offline diperiksa otomatis terhadap Tanzil, mencakup kelengkapan dan urutan ayat, jumlah kata, awal halaman, dan glyph yang tergambar. Kafi belum ditashih oleh Lajnah Pentashihan Mushaf Al-Qur'an.",
                  "The mushaf text is never retyped: every page is rendered from King Fahd Complex fonts. Offline mushaf data is automatically verified against Tanzil for ayah completeness, ordering, word count, page starts, and rendered glyphs. Kafi has not undergone formal tashih certification.",
                )}
              </p>
              <p>
                {tr("Menemukan kesalahan?", "Found an issue?")}{" "}
                <a href={REPORT_URL} target="_blank" rel="noopener noreferrer">
                  {tr("Laporkan di sini", "Report it here")}
                </a>
                .
              </p>
            </div>
          </section>

          <p className="about__footer">
            {tr("Kode sumber:", "Source code:")}{" "}
            <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">
              {host(SOURCE_CODE_URL)}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
