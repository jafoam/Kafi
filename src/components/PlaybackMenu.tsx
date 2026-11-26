import { useEffect, useState } from "react";
import type { AyahKey, SurahInfo } from "../data/types";
import type { PlaybackScope, PlaybackScopeKind, RepeatCount } from "../services/audio-controller";
import { customRange } from "../services/playback-ranges";

export interface PlaybackMenuProps {
  scope: PlaybackScope;
  repeatCount: RepeatCount;
  speed: number;
  talaqqi: boolean;
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
  onClose: () => void;
}

const SCOPE_OPTIONS: { kind: PlaybackScopeKind; label: string }[] = [
  { kind: "continue", label: "Lanjut terus" },
  { kind: "surah", label: "Surah ini" },
  { kind: "page", label: "Halaman ini" },
  { kind: "juz", label: "Juz ini" },
  { kind: "custom", label: "Rentang ayat" },
];

const SHORT_LABEL: Record<PlaybackScopeKind, string> = {
  continue: "Lanjut",
  surah: "Surah",
  page: "Halaman",
  juz: "Juz",
  custom: "Rentang",
};

/** Short text for the dock button, e.g. "Surah ∞". */
export function scopeLabel(scope: PlaybackScope): string {
  return scope.loop ? `${SHORT_LABEL[scope.kind]} ∞` : SHORT_LABEL[scope.kind];
}

function describe(scope: PlaybackScope, surahName: string): string {
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
  surahs,
  surahNumber,
  surahName,
  ayahCount,
  activeAyah,
  onChange,
  onCycleRepeat,
  onCycleSpeed,
  onToggleTalaqqi,
  onClose,
}: PlaybackMenuProps) {
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

  const choose = (kind: PlaybackScopeKind) => {
    if (kind === "custom") {
      const range = customRange(rangeSurah, Number(from), Number(to), rangeAyahCount);
      onChange({ kind, loop: true, ...range });
    } else {
      // Choosing a bounded scope loops by default: "ulang surah ini terus-menerus" is one tap.
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
      <button type="button" className="playback-menu__backdrop" aria-label="Tutup mode putar" onClick={onClose} />
      <div className="playback-menu" role="dialog" aria-label="Mode putar">
        <div className="playback-menu__title">Mode putar</div>

        <div className="playback-menu__options" role="radiogroup" aria-label="Cakupan putar">
          {SCOPE_OPTIONS.map((option) => (
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
              <label className="playback-menu__surah-field">
                <span>Surah</span>
                <select
                  value={rangeSurah}
                  onChange={(e) => {
                    const nextS = Number(e.target.value);
                    const max = surahs.find((s) => s.number === nextS)?.ayahs ?? 1;
                    updateRange(nextS, "1", String(max));
                  }}
                >
                  {surahs.map((s) => (
                    <option key={s.number} value={s.number}>
                      {s.number}. {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Dari ayat</span>
              <input
                type="number"
                min={1}
                max={rangeAyahCount}
                value={from}
                onChange={(e) => updateRange(rangeSurah, e.target.value, to)}
                aria-label={`Dari ayat (1 sampai ${rangeAyahCount})`}
              />
            </label>
            <label>
              <span>Sampai ayat</span>
              <input
                type="number"
                min={1}
                max={rangeAyahCount}
                value={to}
                onChange={(e) => updateRange(rangeSurah, from, e.target.value)}
                aria-label={`Sampai ayat (1 sampai ${rangeAyahCount})`}
              />
            </label>
            <span className="playback-menu__range-note">
              {rangeSurahName}, ayat 1–{rangeAyahCount}
            </span>
          </div>
        )}

        <label className={`playback-menu__loop ${scope.kind === "continue" ? "playback-menu__loop--disabled" : ""}`}>
          <input
            type="checkbox"
            checked={scope.loop}
            disabled={scope.kind === "continue"}
            onChange={(e) => onChange({ ...scope, loop: e.target.checked })}
          />
          <span>Ulang terus-menerus</span>
        </label>

        <div className="playback-menu__toggles">
          <button
            type="button"
            className={`playback-menu__option ${repeatCount !== 1 ? "playback-menu__option--active" : ""}`}
            onClick={onCycleRepeat}
          >
            Ulang ayat: {repeatCount === Infinity ? "∞" : `${repeatCount}×`}
          </button>
          <button
            type="button"
            className={`playback-menu__option ${speed !== 1 ? "playback-menu__option--active" : ""}`}
            onClick={onCycleSpeed}
          >
            Kecepatan: {speed}×
          </button>
        </div>

        <label className="playback-menu__loop">
          <input
            type="checkbox"
            checked={talaqqi}
            onChange={(e) => onToggleTalaqqi(e.target.checked)}
          />
          <span>Mode Talaqqi (jeda setelah ayat untuk menirukan)</span>
        </label>

        <p className="playback-menu__hint">{describe(scope, surahName)}</p>
      </div>
    </>
  );
}
