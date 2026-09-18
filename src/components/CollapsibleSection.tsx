import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  /** Shown on the header row while collapsed, so the section still says something. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Remembers this viewer's choice across visits when set. */
  storageKey?: string;
  accent?: string;
  /** Lets a section keep its own skin, like the crown's gold card. */
  containerClassName?: string;
  children: React.ReactNode;
}

const readStored = (key: string | undefined, fallback: boolean): boolean => {
  if (!key) return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === 'open';
  } catch {
    // Private windows and blocked site data throw rather than return null.
    return fallback;
  }
};

/**
 * A section of the ladder that can be folded away.
 *
 * The crown and the titles between them pushed the actual rankings off the
 * first screen. Both stay, but only the crown is open to begin with — it
 * changes daily, where the titles only move when somebody takes one.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  summary,
  defaultOpen = true,
  storageKey,
  accent = '#86948a',
  containerClassName = 'rounded-2xl border border-[#30363d] bg-[#161b22]',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(() => readStored(storageKey, defaultOpen));

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
    } catch {
      // Remembering the choice is a convenience, never a requirement.
    }
  };

  return (
    <div className={`overflow-hidden ${containerClassName}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#1c2026]"
      >
        <span
          className="shrink-0 font-['JetBrains_Mono'] text-[10px] font-extrabold uppercase tracking-widest"
          style={{ color: accent }}
        >
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {!isOpen && summary}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#86948a] transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      {isOpen && <div className="anim-fade border-t border-white/5 p-3">{children}</div>}
    </div>
  );
};
