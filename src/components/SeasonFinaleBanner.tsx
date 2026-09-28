import React from 'react';
import { SeasonFinale } from '../utils/finale';

/**
 * The closing-days banner on the ranks screen. A season that ends quietly
 * gets no ending; this one tells everybody what is still on the table.
 */
export const SeasonFinaleBanner: React.FC<{ finale: SeasonFinale }> = ({ finale }) => (
  <div id="season-finale" className="grid gap-3 rounded-2xl bg-card p-3.5 shadow-[inset_0_0_0_1.5px_#F2B705]">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base">{finale.heading}</h3>
      <span className="rounded-full bg-crown px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg tabular-nums">
        {finale.timeLeft} left
      </span>
    </div>
    {finale.lines.map((line) => (
      <p key={line.kind} className={`text-sm leading-snug text-white ${line.kind === 'you' ? 'font-semibold' : ''}`}>
        {line.text}
      </p>
    ))}
  </div>
);
