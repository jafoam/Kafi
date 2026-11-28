import { useEffect, useState } from "react";
import { GlassSelect } from "./GlassSelect";
import type { AppLanguage, AyahKey, SurahInfo } from "../data/types";
import type { PlaybackScope, PlaybackScopeKind, RepeatCount } from "../services/audio-controller";
import { customRange } from "../services/playback-ranges";
import { useI18n } from "../i18n";

export interface PlaybackMenuProps {
  scope: PlaybackScope;
  repeatCount: RepeatCount;
  speed: number;
  talaqqi: boolean;
  wordAudioHighlight?: boolean;
  surahs?: SurahInfo[];
  surahNumber: number;
  surahName: string;
  ayahCount: number;
  /** Ayah currently active, used as the default start of a custom range. */
  activeAyah: AyahKey;
  onChange: (scope: PlaybackScope) => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
  onToggleTalaqqi: (enabled: boolean) => void;
  onToggleWordAudioHighlight?: (enabled: boolean) => void;
  onClose: () => void;
}

const SHORT_LABEL_ID: Record<PlaybackScopeKind, string> = {
  continue: "Lanjut",
  surah: "Surah",
  page: "Halaman",
  juz: "Juz",
  custom: "Rentang",
};

const SHORT_LABEL_EN: Record<PlaybackScopeKind, string> = {
  continue: "Continue",
  surah: "Surah",
  page: "Page",
  juz: "Juz",
  custom: "Range",
};

/** Short text for the dock button, e.g. "Surah ∞". */
export function scopeLabel(scope: PlaybackScope, lang: AppLanguage = "id"): string {
  const labels = lang === "en" ? SHORT_LABEL_EN : SHORT_LABEL_ID;
  return scope.loop ? `${labels[scope.kind]} ∞` : labels[scope.kind];
}

function describe(scope: PlaybackScope, surahName: string, isEn: boolean): string {
  if (isEn) {
    const place =
      scope.kind === "continue"
        ? "through the end of the Quran"
        : scope.kind === "surah"
          ? surahName
          : scope.kind === "page"
            ? "the current page"
            : scope.kind === "juz"
              ? "the current juz"
              : "your chosen range";
    if (scope.kind === "continue") return `Plays continuously ${place}.`;
    return scope.loop ? `Repeats ${place} continuously.` : `Plays ${place}, then stops.`;
  }
  const place =
    scope.kind === "continue"
      ? "sampai akhir Al-Quran"
      : scope.kind === "surah"
        ? surahName
        : scope.kind === "page"
          ? "halaman yang sedang diputar"
          : scope.kind === "juz"
            ? "juz yang sedang diputar"
            : "rentang yang Anda pilih";
  if (scope.kind === "continue") return `Memutar terus ${place}.`;
  return scope.loop
    ? `Memutar ${place} berulang-ulang tanpa henti.`
    : `Memutar ${place}, lalu berhenti.`;
}

export function PlaybackMenu({
  scope,
  repeatCount,
  speed,
  talaqqi,
  wordAudioHighlight = true,
  surahs,
  surahNumber,
  surahName,
  ayahCount,
  activeAyah,
  onChange,
  onCycleRepeat,
  onCycleSpeed,
  onToggleTalaqqi,
  onToggleWordAudioHighlight,
  onClose,
}: PlaybackMenuProps) {
  const { isEn, tr } = useI18n();
  const activeNumber = Number(activeAyah.split(":")[1]) || 1;
  const scopeSurah = scope.from ? Number(scope.from.split(":")[0]) || surahNumber : surahNumber;
  const [rangeSurah, setRangeSurah] = useState(scopeSurah);
  const pickedSurahInfo = surahs?.find((s) => s.number === rangeSurah);
  const rangeSurahName = pickedSurahInfo?.name ?? surahName;
  const rangeAyahCount = pickedSurahInfo?.ayahs ?? ayahCount;
  const [from, setFrom] = useState(String(scope.from?.split(":")[1] ?? activeNumber));
  const [to, setTo] = useState(String(scope.to?.split(":")[1] ?? rangeAyahCount));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const scopeOptions: { kind: PlaybackScopeKind; label: string }[] = [
    { kind: "continue", label: tr("Lanjut terus", "Continuous") },
    { kind: "surah", label: tr("Surah ini", "This surah") },
    { kind: "page", label: tr("Halaman ini", "This page") },
    { kind: "juz", label: tr("Juz ini", "This juz") },
    { kind: "custom", label: tr("Rentang ayat", "Ayah range") },
  ];

  const choose = (kind: PlaybackScopeKind) => {
    if (kind === "custom") {
      const range = customRange(rangeSurah, Number(from), Number(to), rangeAyahCount);
      onChange({ kind, loop: true, ...range });
    } else {
      onChange({ kind, loop: kind === "continue" ? false : scope.kind === "continue" ? true : scope.loop });
    }
  };

  const updateRange = (nextSurah: number, nextFrom: string, nextTo: string) => {
    const max = surahs?.find((s) => s.number === nextSurah)?.ayahs ?? ayahCount;
    setRangeSurah(nextSurah);
    setFrom(nextFrom);
    setTo(nextTo);
    const range = customRange(nextSurah, Number(nextFrom), Number(nextTo), max);
    onChange({ kind: "custom", loop: scope.loop, ...range });
  };

  return (
    <>
      <button
        type="button"
        className="playback-menu__backdrop"
        aria-label={tr("Tutup mode putar", "Close playback mode")}
        onClick={onClose}
      />
      <div className="playback-menu" role="dialog" aria-label={tr("Mode putar", "Playback mode")}>
        <div className="playback-menu__header">
          <div className="playback-menu__title">{tr("Mode putar", "Playback mode")}</div>
          <p className="playback-menu__hint">{describe(scope, surahName, isEn)}</p>
        </div>

        <div className="playback-menu__options" role="radiogroup" aria-label={tr("Cakupan putar", "Playback scope")}>
          {scopeOptions.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={scope.kind === option.kind}
              className={`playback-menu__option ${scope.kind === option.kind ? "playback-menu__option--active" : ""}`}
              onClick={() => choose(option.kind)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {scope.kind === "custom" && (
          <div className="playback-menu__range">
            {surahs && surahs.length > 0 && (
              <div className="playback-menu__surah-field">
                <span>Surah</span>
                <GlassSelect
                  ariaLabel={tr("Pilih Surah", "Choose Surah")}
                  value={String(rangeSurah)}
                  options={surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))}
                  onChange={(val) => {
                    const nextS = Number(val);
                    const max = surahs.find((s) => s.number === nextS)?.ayahs ?? 1;
                    updateRange(nextS, "1", String(max));
                  }}
                />
              </div>
            )}
            <label>
              <span>{tr("Dari ayat", "From ayah")}</span>
              <input
                type="number"
                min={1}
                max={rangeAyahCount}
                value={from}
                onChange={(e) => updateRange(rangeSurah, e.target.value, to)}
                aria-label={tr(`Dari ayat (1 sampai ${rangeAyahCount})`, `From ayah (1 to ${rangeAyahCount})`)}
              />
            </label>
            <label>
              <span>{tr("Sampai ayat", "To ayah")}</span>
              <input
                type="number"
                min={1}
                max={rangeAyahCount}
                value={to}
                onChange={(e) => updateRange(rangeSurah, from, e.target.value)}
                aria-label={tr(`Sampai ayat (1 sampai ${rangeAyahCount})`, `To ayah (1 to ${rangeAyahCount})`)}
              />
            </label>
            <span className="playback-menu__range-note">
              {rangeSurahName}, {tr("ayat", "ayahs")} 1–{rangeAyahCount}
            </span>
          </div>
        )}

        <div className="playback-menu__divider" role="separator" />

        <div className="playback-menu__toggles">
          <button
            type="button"
            className={`playback-menu__stat-btn ${repeatCount !== 1 ? "playback-menu__option--active" : ""}`}
            onClick={onCycleRepeat}
          >
            <span className="playback-menu__stat-label">{tr("Ulang ayat", "Repeat ayah")}</span>
            <span className="playback-menu__stat-val">{repeatCount === Infinity ? "∞" : `${repeatCount}×`}</span>
          </button>
          <button
            type="button"
            className={`playback-menu__stat-btn ${speed !== 1 ? "playback-menu__option--active" : ""}`}
            onClick={onCycleSpeed}
          >
            <span className="playback-menu__stat-label">{tr("Kecepatan", "Speed")}</span>
            <span className="playback-menu__stat-val">{speed}×</span>
          </button>
        </div>

        <div className="playback-menu__divider" role="separator" />

        <div className="playback-menu__switches">
          <button
            type="button"
            role="switch"
            aria-checked={scope.loop}
            disabled={scope.kind === "continue"}
            className={`playback-menu__switch-row ${scope.kind === "continue" ? "playback-menu__switch-row--disabled" : ""}`}
            onClick={() => onChange({ ...scope, loop: !scope.loop })}
          >
            <span className="playback-menu__switch-text">
              <span className="playback-menu__switch-title">{tr("Ulang terus-menerus", "Loop continuously")}</span>
              <span className="playback-menu__switch-sub">
                {scope.kind === "continue"
                  ? tr("Pilih Surah, Halaman, Juz, atau Rentang dulu", "Select Surah, Page, Juz, or Range first")
                  : tr("Putar ulang cakupan tanpa henti", "Repeat the selected scope endlessly")}
              </span>
            </span>
            <span className={`app-menu__switch ${scope.loop ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={talaqqi}
            className="playback-menu__switch-row"
            onClick={() => onToggleTalaqqi(!talaqqi)}
          >
            <span className="playback-menu__switch-text">
              <span className="playback-menu__switch-title">{tr("Mode Talaqqi", "Talaqqi Mode")}</span>
              <span className="playback-menu__switch-sub">
                {tr("Jeda setelah tiap ayat untuk menirukan", "Pause after each ayah so you can repeat")}
              </span>
            </span>
            <span className={`app-menu__switch ${talaqqi ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
          </button>

          {onToggleWordAudioHighlight && (
            <button
              type="button"
              role="switch"
              aria-checked={wordAudioHighlight}
              className="playback-menu__switch-row"
              onClick={() => onToggleWordAudioHighlight(!wordAudioHighlight)}
            >
              <span className="playback-menu__switch-text">
                <span className="playback-menu__switch-title">{tr("Sorot per kata", "Word highlight")}</span>
                <span className="playback-menu__switch-sub">
                  {tr("Tandai kata saat murottal diputar", "Highlight each word during recitation")}
                </span>
              </span>
              <span className={`app-menu__switch ${wordAudioHighlight ? "app-menu__switch--on" : ""}`} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
