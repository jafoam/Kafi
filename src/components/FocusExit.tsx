/** Always-visible way out of focus mode, which hides both the top bar and the audio dock. */
export function FocusExit({ onExit }: { onExit: () => void }) {
  return (
    <button
      type="button"
      className="focus-exit"
      onClick={onExit}
      aria-label="Keluar dari mode fokus"
      title="Keluar dari mode fokus (F)"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      </svg>
      <span>Keluar Fokus</span>
    </button>
  );
}
