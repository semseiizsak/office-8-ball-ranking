import React from 'react';
import { LeagueTitle } from '../utils/league';

interface TitleBadgesProps {
  titles: LeagueTitle[];
  /** `chip` for inline use in a list row, `card` for the dossier. */
  variant?: 'chip' | 'card';
}

/**
 * Orthogonal identities. A single rating means everyone but one person is
 * losing; these give the rest of the office something they can hold.
 */
export const TitleBadges: React.FC<TitleBadgesProps> = ({ titles, variant = 'chip' }) => {
  if (titles.length === 0) return null;

  if (variant === 'chip') {
    return (
      <span className="flex shrink-0 items-center gap-1">
        {titles.map((title) => (
          <span
            key={title.key}
            title={`${title.label} — ${title.blurb} (${title.valueLabel})`}
            className="inline-flex items-center rounded bg-[#262a31] px-1 py-0.5 text-[11px] leading-none border border-[#3c4a42]"
          >
            {title.emoji}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {titles.map((title) => (
        <div
          key={title.key}
          className="flex items-start gap-2.5 rounded-xl border border-[#30363d] bg-[#161b22] p-3"
        >
          <span className="text-lg leading-none">{title.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-['Chivo'] text-sm font-bold text-white">{title.label}</h4>
              <span className="shrink-0 font-['JetBrains_Mono'] text-[11px] font-bold text-[#4edea3]">
                {title.valueLabel}
              </span>
            </div>
            <p className="mt-0.5 font-['Space_Grotesk'] text-[11px] leading-snug text-[#86948a]">
              {title.blurb}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
