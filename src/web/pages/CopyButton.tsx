import { useState } from "react";

/** Copies text to the clipboard and says so for a moment. */
export function CopyButton({ text, label = "Copy", className = "pg-btn" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      data-done={done || undefined}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {done ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : (<><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>)}
      </svg>
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}
