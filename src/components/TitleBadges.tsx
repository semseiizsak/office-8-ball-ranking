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
 * Titles stay emojis, free standing and big, no frames.
 */
export const TitleBadges: React.FC<TitleBadgesProps> = ({ titles, variant = 'chip' }) => {
  if (titles.length === 0) return null;

  if (variant === 'chip') {
    return (
      <span className="flex shrink-0 items-center gap-0.5 text-[13px] leading-none">
        {titles.map((title) => (
          <span key={title.key} title={`${title.label}: ${title.blurb} (${title.valueLabel})`} aria-label={title.label}>
            {title.emoji}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-3.5 p-1">
      {titles.map((title) => (
        <div key={title.key} className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex-none text-[56px] leading-none">{title.emoji}</span>
          <div className="grid min-w-0 gap-0.5">
            <span className="text-[11px] font-extrabold uppercase leading-tight tracking-[0.06em]">{title.label}</span>
            <span className="text-[13px] font-semibold leading-tight">{title.holderName.split(' ')[0]}</span>
            <span className="text-[11px] leading-tight text-white/55">{title.valueLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
