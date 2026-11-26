import { useEffect, useState } from "react";
import type { AyahKey } from "../data/types";
import type { PlaybackScope, PlaybackScopeKind, RepeatCount } from "../services/audio-controller";
import { customRange } from "../services/playback-ranges";

export interface PlaybackMenuProps {
  scope: PlaybackScope;
  repeatCount: RepeatCount;
  speed: number;
  surahNumber: number;
  surahName: string;
  ayahCount: number;
  /** Ayah currently active, used as the default start of a custom range. */
  activeAyah: AyahKey;
  onChange: (scope: PlaybackScope) => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
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
  surahNumber,
  surahName,
  ayahCount,
  activeAyah,
  onChange,
  onCycleRepeat,
  onCycleSpeed,
  onClose,
}: PlaybackMenuProps) {
  const activeNumber = Number(activeAyah.split(":")[1]) || 1;
  const [from, setFrom] = useState(String(scope.from?.split(":")[1] ?? activeNumber));
  const [to, setTo] = useState(String(scope.to?.split(":")[1] ?? ayahCount));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choose = (kind: PlaybackScopeKind) => {
    if (kind === "custom") {
      const range = customRange(surahNumber, Number(from), Number(to), ayahCount);
      onChange({ kind, loop: true, ...range });
    } else {
      // Choosing a bounded scope loops by default: "ulang surah ini terus-menerus" is one tap.
      onChange({ kind, loop: kind === "continue" ? false : scope.kind === "continue" ? true : scope.loop });
    }
  };

  const updateRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    const range = customRange(surahNumber, Number(nextFrom), Number(nextTo), ayahCount);
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
            <label>
              <span>Dari ayat</span>
              <input
                type="number"
                min={1}
                max={ayahCount}
                value={from}
                onChange={(e) => updateRange(e.target.value, to)}
                aria-label={`Dari ayat (1 sampai ${ayahCount})`}
              />
            </label>
            <label>
              <span>Sampai ayat</span>
              <input
                type="number"
                min={1}
                max={ayahCount}
                value={to}
                onChange={(e) => updateRange(from, e.target.value)}
                aria-label={`Sampai ayat (1 sampai ${ayahCount})`}
              />
            </label>
            <span className="playback-menu__range-note">
              {surahName}, ayat 1–{ayahCount}
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

        <p className="playback-menu__hint">{describe(scope, surahName)}</p>
      </div>
    </>
  );
}
