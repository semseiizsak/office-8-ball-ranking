import React from 'react';
import { Crown, Hourglass, Swords, User } from 'lucide-react';
import { SeasonFinale } from '../utils/finale';

const ICONS = { crown: Crown, you: User, race: Swords } as const;

/**
 * The closing-days banner on the ranks screen. A season that ends quietly
 * gets no ending; this one tells everybody what is still on the table.
 */
export const SeasonFinaleBanner: React.FC<{ finale: SeasonFinale }> = ({ finale }) => (
  <div
    id="season-finale"
    className={`anim-pop relative overflow-hidden rounded-2xl border p-4 ${
      finale.finalDay
        ? 'border-[#f59e0b] bg-gradient-to-br from-[#f59e0b]/20 via-[#1c2026] to-[#10141a] shadow-[0_0_28px_rgba(245,158,11,0.25)]'
        : 'border-[#f59e0b]/40 bg-gradient-to-br from-[#f59e0b]/10 via-[#1c2026] to-[#10141a]'
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] font-extrabold uppercase tracking-widest text-[#f59e0b]">
        <Hourglass className={`h-3.5 w-3.5 ${finale.finalDay ? 'animate-pulse' : ''}`} />
        {finale.heading}
      </span>
      <span className="font-['JetBrains_Mono'] text-xs font-bold text-white">
        ends in {finale.timeLeft}
      </span>
    </div>
    <ul className="mt-3 space-y-2">
      {finale.lines.map((line) => {
        const Icon = ICONS[line.kind];
        return (
          <li key={line.kind} className="flex items-start gap-2.5">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#30363d] bg-[#10141a] ${
              line.kind === 'crown' ? 'text-[#f59e0b]' : line.kind === 'you' ? 'text-[#4edea3]' : 'text-[#ffb95f]'
            }`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={`font-['Space_Grotesk'] text-sm leading-snug ${line.kind === 'you' ? 'font-semibold text-white' : 'text-[#dfe2eb]'}`}>
              {line.text}
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);
