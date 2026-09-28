import React, { useEffect, useState } from 'react';
import { Player } from '../types';
import { WeekAwards } from '../utils/awards';
import { PlayerAvatar } from './ui';

const weekLabel = (from: number) => new Date(from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Friday's award show: a title card, then one award per screen. Tap or swipe
 * forward, the arrow goes back, the cross closes it at any point.
 */
export const WeeklyAwardsScene: React.FC<{ week: WeekAwards; players: Player[]; onClose: () => void }> = ({ week, players, onClose }) => {
  const [page, setPage] = useState(0);
  const pages = week.awards.length + 2;
  const byId = new Map(players.map((p) => [p.id, p]));
  const next = () => (page + 1 >= pages ? onClose() : setPage(page + 1));
  const back = () => setPage(Math.max(0, page - 1));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' || event.key === ' ') next();
      if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const award = page >= 1 && page <= week.awards.length ? week.awards[page - 1] : null;
  const winner = award ? byId.get(award.playerId) : null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Weekly awards" className="anim-fade fixed inset-0 z-[70] flex flex-col bg-bg">
      <div className="flex gap-1 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        {Array.from({ length: pages }, (_, index) => (
          <span key={index} className={`h-1 flex-1 rounded-full ${index <= page ? 'bg-white' : 'bg-surface-alt'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <button type="button" onClick={back} disabled={page === 0} aria-label="Previous" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-lg disabled:opacity-0">
          ‹
        </button>
        <span className="text-xs font-semibold text-white/55">
          {award ? `${page} of ${week.awards.length}` : ''}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-lg">
          ✕
        </button>
      </div>

      <button type="button" onClick={next} className="grid flex-1 place-items-center px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center">
        {page === 0 && (
          <span key="intro" className="anim-rise grid justify-items-center gap-4">
            <span className="text-7xl">🎖️</span>
            <h2 className="text-[44px] leading-[1.05]">Weekly awards</h2>
            <span className="text-base font-semibold text-white/70">
              Week of {weekLabel(week.from)}. {week.matches} {week.matches === 1 ? 'match' : 'matches'}, {week.awards.length} awards.
            </span>
            <span className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-white/55">Tap to start</span>
          </span>
        )}
        {award && (
          <span key={award.key} className="anim-rise grid justify-items-center gap-4">
            <span className="anim-pop text-[88px] leading-none">{award.e}</span>
            <h2 className="text-[36px] leading-[1.05]">{award.title}</h2>
            <span className={`grid justify-items-center gap-3 rounded-3xl px-8 py-6 ${award.funny ? 'bg-surface' : 'bg-crown text-bg'}`}>
              <PlayerAvatar player={winner ?? null} size={96} />
              <b className="font-display text-[30px] font-extrabold uppercase leading-none">{winner?.name.split(' ')[0] ?? '?'}</b>
              <span className={`text-sm font-semibold ${award.funny ? 'text-white/70' : ''}`}>{award.line}</span>
            </span>
          </span>
        )}
        {page === pages - 1 && (
          <span key="outro" className="anim-rise grid justify-items-center gap-4">
            <span className="text-7xl">🎱</span>
            <h2 className="text-[40px] leading-[1.05]">That's the week</h2>
            <span className="text-base font-semibold text-white/70">Every week is in History under Weekly awards.</span>
            <span className="mt-6 h-12 rounded-full bg-white px-8 text-sm font-extrabold uppercase leading-[48px] tracking-[0.06em] text-bg">Done</span>
          </span>
        )}
      </button>
    </div>
  );
};
