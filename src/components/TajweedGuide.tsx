import { useEffect, useState, type CSSProperties } from "react";
import { TAJWEED_RULES } from "../data/tajweed-rules";

export interface TajweedGuideProps {
  onClose: () => void;
}

function Examples({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <span className="tajweed-guide__examples" dir="rtl" lang="ar">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </span>
  );
}

/** What each color of the colored tajweed mushaf means; each rule opens to explain itself. */
export function TajweedGuide({ onClose }: TajweedGuideProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="palette-backdrop" role="dialog" aria-modal="true" aria-label="Hukum Tajwid" onClick={onClose}>
      <div className="tajweed-guide" onClick={(e) => e.stopPropagation()}>
        <div className="tajweed-guide__header">
          <div>
            <h2 className="tajweed-guide__title">Hukum Tajwid</h2>
            <p className="tajweed-guide__intro">
              Tajwid adalah aturan melafalkan huruf Al-Qur&apos;an dengan benar. Di mushaf berwarna, warna huruf
              menunjukkan cara membacanya.
            </p>
          </div>
          <button type="button" className="ayah-popover__close" aria-label="Tutup" onClick={onClose}>
            ×
          </button>
        </div>

        <ul className="tajweed-guide__list">
          {TAJWEED_RULES.map((rule) => {
            const expanded = open.has(rule.id);
            const style = {
              "--tj-light": rule.colors.light,
              "--tj-sepia": rule.colors.sepia,
              "--tj-dark": rule.colors.dark,
            } as CSSProperties;
            return (
              <li key={rule.id} className="tajweed-rule" style={style}>
                <button
                  type="button"
                  className="tajweed-rule__head"
                  aria-expanded={expanded}
                  onClick={() => toggle(rule.id)}
                >
                  <span className="tajweed-rule__swatch" aria-hidden="true">
                    <span className="tajweed-rule__dot" />
                  </span>
                  <span className="tajweed-rule__text">
                    <span className="tajweed-rule__title">{rule.title}</span>
                    <span className="tajweed-rule__subtitle">{rule.subtitle}</span>
                  </span>
                  <svg
                    className="tajweed-rule__chevron"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {expanded && (
                  <div className="tajweed-rule__body">
                    <span className="tajweed-rule__swatch" aria-hidden="true" />
                    <div className="tajweed-rule__content">
                      <p>{rule.body}</p>
                      <Examples items={rule.examples} />
                      {rule.cases && (
                        <ul className="tajweed-rule__cases">
                          {rule.cases.map((c) => (
                            <li key={c.text}>
                              <p>{c.text}</p>
                              <Examples items={c.examples} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
