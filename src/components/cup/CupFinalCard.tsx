import React, { useEffect } from 'react';
import { Player } from '../../types';
import { CupState, FINAL_ROUND, Tournament, roundDeadline } from '../../utils/tournament';
import { cupIn, gameKey, hm, weekday } from '../../utils/cupView';
import { PlayerAvatar } from '../ui';

const anim = (name: string, delay: number, duration: number) => `${name} ${duration}ms var(--ease) ${Math.round(delay)}ms both`;

/**
 * The final as a fight poster: the two finalists face each other under a gold
 * spotlight. Before round 2 is done the slots wait for the top two; once it
 * is played the winner's half turns gold and the trophy rises between them.
 */
export const CupFinalCard: React.FC<{
  state: CupState;
  tournament: Tournament;
  byId: Map<string, Player>;
  names: Map<string, string>;
  meId: string;
  now: number;
  seen: Set<string>;
  force: boolean;
  motion: boolean;
  base: number;
  hold: boolean;
  onSelectPlayer: (player: Player) => void;
  onSeen?: (keys: string[]) => void;
}> = ({ state, tournament, byId, names, meId, now, seen, force, motion, base, hold, onSelectPlayer, onSeen }) => {
  const final = state.final;
  const deadline = final?.deadline ?? roundDeadline(tournament, FINAL_ROUND);
  const champion = state.champion;
  const fresh = (key: string) => motion && (force || !seen.has(key));
  const setKey = final ? `final:${gameKey(final)}` : '';
  const fillAt = final && fresh(setKey) ? base + 620 : undefined;
  const goldAt = champion && fresh('final:won') ? base + (fillAt !== undefined ? 1100 : 760) : undefined;

  useEffect(() => {
    if (hold || !onSeen || !final) return;
    const timer = window.setTimeout(() => !document.hidden && onSeen([setKey, ...(champion ? ['final:won'] : [])]), (goldAt ?? fillAt ?? base) + 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, setKey, champion]);

  const leaders = state.standings.slice(0, 2);
  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Former player' : '');
  const notPlayed = !champion && (state.unfinished || now > deadline);
  // An unplayed final carries no gold anywhere: silver, like the crest that week.
  const tone = notPlayed ? '#C9CCD1' : '#F2B705';
  const glow = notPlayed ? 'rgba(201,204,209,.12)' : 'rgba(242,183,5,.22)';

  const side = (slot: 0 | 1) => {
    const id = final ? (slot === 0 ? final.a : final.b) : null;
    const mirrored = slot === 1;
    const player = id ? byId.get(id) ?? null : null;
    const won = !!id && id === champion;
    const lost = !!id && !!champion && !won;
    const mine = !!id && id === meId;
    const waiting = (
      <span className="grid justify-items-center gap-2 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full border-[1.5px] border-dashed border-loss font-display text-lg font-extrabold text-white/55">{slot === 0 ? '1st' : '2nd'}</span>
        <span className="text-xs font-semibold text-white/55">{slot === 0 ? 'Top of the table' : 'Second place'}</span>
      </span>
    );
    const anims = [
      ...(fillAt !== undefined ? [anim('anim-pop', fillAt, 360)] : []),
      ...(won && goldAt !== undefined ? [anim('cup-gold-in', goldAt, 420)] : []),
    ];
    const filled = (
      <span
        className={`grid w-full justify-items-center gap-2 rounded-3xl px-2 py-3 text-center ${won ? 'bg-crown text-bg' : lost ? 'text-white/40' : 'text-white'} ${mine ? (won ? 'shadow-[inset_0_0_0_2px_#0A0A0A]' : 'shadow-[inset_0_0_0_2px_#fff]') : ''}`}
        style={anims.length ? { animation: anims.join(', ') } : undefined}
      >
        <span className={lost ? 'opacity-40 grayscale' : ''} style={lost && goldAt !== undefined ? { animation: anim('cup-dim', goldAt, 420) } : undefined}>
          <PlayerAvatar player={player ?? { id: id ?? 'gone', name: '?', avatarUrl: '' }} size={64} />
        </span>
        <b className="w-full truncate font-display text-xl font-extrabold uppercase leading-none">{nameOf(id)}</b>
        {player && <span className={`text-xs font-semibold tabular-nums ${won ? '' : 'text-white/55'}`}>{won ? 'Champion' : lost ? 'Runner up' : `${player.elo} Elo`}</span>}
      </span>
    );
    const body = id ? filled : waiting;
    return (
      <span className="cup-in min-w-0" style={cupIn(mirrored ? 'duel-in-right' : 'duel-in-left', base + 260, 620)}>
        {player ? (
          <button type="button" onClick={() => onSelectPlayer(player)} className="press block w-full" aria-label={`${nameOf(id)}${won ? ', champion' : lost ? ', runner up' : ', finalist'}`}>
            {body}
          </button>
        ) : (
          body
        )}
      </span>
    );
  };

  return (
    <section
      className="cup-in relative isolate grid gap-4 overflow-hidden rounded-[28px] bg-card p-5"
      style={{ ...cupIn('cup-final-in', base, 420), boxShadow: `inset 0 0 0 1.5px ${tone}` }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[-1]">
        <div className="cup-glow absolute left-1/2 top-[-140px] ml-[-160px] h-[320px] w-[320px] rounded-full" style={{ background: `radial-gradient(circle, ${glow} 0%, rgba(0,0,0,0) 64%)` }} />
      </div>
      <div className="grid justify-items-center gap-1 text-center">
        <h2 className="cup-in font-display text-[32px] font-extrabold uppercase leading-none" style={cupIn('wa-wipe', base + 120, 620)}>The final</h2>
        <span className="cup-in text-xs font-semibold text-white/55" style={cupIn('rise-in', base + 240, 340)}>
          {champion ? `Played ${weekday(deadline)}` : notPlayed ? `Not played by ${weekday(deadline)} ${hm(deadline)}` : `Play by ${weekday(deadline)} ${hm(deadline)}`}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center gap-2">
        {side(0)}
        <span className="relative grid h-[52px] w-[52px] place-items-center">
          {champion ? (
            <span className="cup-in text-[40px] leading-none" style={cupIn('cup-trophy-rise', (goldAt ?? base + 500) + 80, 640)}>🏆</span>
          ) : (
            <>
              <span className="cup-in grid h-[52px] w-[52px] place-items-center rounded-full bg-bg font-display text-lg font-extrabold" style={{ ...cupIn('anim-pop', base + 520, 280), boxShadow: `0 0 0 2px ${tone}` }}>
                VS
              </span>
              {final && !notPlayed && <span aria-hidden="true" className="cup-live pointer-events-none absolute -inset-1 rounded-full border-[1.5px] border-crown" style={{ animationDelay: `${base + 1400}ms` }} />}
            </>
          )}
        </span>
        {side(1)}
      </div>

      {!final && leaders.length === 2 && (
        <p className="cup-in text-center text-xs font-semibold text-white/55" style={cupIn('rise-in', base + 640, 340)}>
          Leading now: {nameOf(leaders[0].id)} and {nameOf(leaders[1].id)}
        </p>
      )}
    </section>
  );
};
