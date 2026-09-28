import React, { useEffect, useState } from 'react';
import { MatchRecord, Player } from '../types';
import { Ball, BallBurst, PlayerAvatar } from './ui';
import { MatchRecap, RankMove } from '../utils/recap';

interface MatchSuccessModalProps {
  result: {
    match: MatchRecord;
    winnerName: string;
    loserName: string;
    eloDelta: number;
    bountyCollected: number;
    winnerNewElo: number;
    loserNewElo: number;
    isUpset: boolean;
    crownChangedHands: boolean;
    recap?: MatchRecap;
  } | null;
  onClose: () => void;
  onViewLeaderboard: () => void;
  /** The winner, for the face above the number. */
  winner?: Player | null;
  /** Anything else the result unlocked, like badges and achievement tiers. */
  extraRows?: Array<[string, React.ReactNode]>;
}

const first = (name: string) => name.split(' ')[0];

const joinNames = (names: string[]): string =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Counts a number up from zero with the app's easing, once. */
const useCountUp = (target: number, ms = 420, delay = 150): number => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / ms));
      setValue(Math.round(target * ease(k)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, delay]);
  return value;
};

const rankText = (name: string, move: RankMove, tone: 'up' | 'down'): string => {
  if (move.before === null) return `${name} joins the ladder at #${move.after}.`;
  if (tone === 'up') {
    if (move.after < move.before) return `${name} up to #${move.after}${move.passed.length ? `, past ${joinNames(move.passed)}` : ''}.`;
    return `${name} stays #${move.after}.`;
  }
  if (move.after > move.before) return `${name} down to #${move.after}${move.passedBy.length ? `. ${joinNames(move.passedBy)} went by` : ''}.`;
  return `${name} holds #${move.after}.`;
};

/**
 * The one screen every player is certain to see, so it carries what the result
 * actually changed: the places moved, who was passed, the head-to-head, whose
 * calls came in, the balls, any title or badge taken.
 */
export const MatchSuccessModal: React.FC<MatchSuccessModalProps> = ({
  result,
  onClose,
  onViewLeaderboard,
  winner,
  extraRows = [],
}) => {
  const gain = result ? result.eloDelta + result.bountyCollected : 0;
  const shown = useCountUp(gain);
  if (!result) return null;
  const recap = result.recap;
  const winnerFirst = first(result.winnerName);
  const loserFirst = first(result.loserName);
  const endedRun = recap && recap.loser.streakBefore >= 2 ? recap.loser.streakBefore : 0;

  const rows: Array<[string, React.ReactNode]> = [];
  if (recap) {
    rows.push(['Ladder', rankText(winnerFirst, recap.winner.rank, 'up')]);
    rows.push(['Drop', `${loserFirst} drops ${gain}. ${rankText(loserFirst, recap.loser.rank, 'down').replace(`${loserFirst} `, 'Now ').replace('Now holds', 'Holds')}`]);
    if (endedRun > 0) rows.push(['Streak', `Ended ${loserFirst}'s run of ${endedRun} wins.`]);
    else if (recap.winner.streak >= 2) rows.push(['Streak', `${winnerFirst} has won ${recap.winner.streak} in a row.`]);
    if (recap.rivalry && recap.rivalry.meetings > 1) {
      rows.push(['Head to head', `${winnerFirst} ${recap.rivalry.wins}, ${loserFirst} ${recap.rivalry.losses}.`]);
    }
    if (recap.calls && recap.calls.right.length + recap.calls.wrong.length > 0) {
      rows.push([
        'Calls',
        `${recap.calls.right.length ? `Right: ${joinNames(recap.calls.right)}.` : 'Nobody saw it coming.'}${recap.calls.wrong.length ? ` Wrong: ${joinNames(recap.calls.wrong)}.` : ''}`,
      ]);
    }
  }
  if (result.match.winnerBall) {
    rows.push([
      'Balls',
      <span className="inline-flex items-center gap-1.5">
        {winnerFirst} won on {result.match.winnerBall}.
        <Ball n={result.match.winnerBall === 'solids' ? 1 : 9} size={18} />
      </span>,
    ]);
  }
  recap?.titlesWon.forEach((title) => rows.push(['New title', `${title.emoji} ${title.label}`]));
  rows.push(...extraRows);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="win-title" className="anim-fade fixed inset-0 z-50 grid place-items-center overflow-hidden overflow-y-auto bg-black px-6 py-8 text-center">
      <BallBurst />
      <div className="relative z-10 grid w-full max-w-sm justify-items-center gap-3.5">
        {result.crownChangedHands ? (
          <>
            <span aria-hidden="true" className="anim-rise text-[84px] leading-none">👑</span>
            <h1 id="win-title" className="anim-rise text-[64px] leading-[.92] tracking-[-0.03em] [animation-delay:60ms]">Crown taken</h1>
            <p className="anim-rise font-semibold text-white/70 [animation-delay:120ms]">
              {winnerFirst} took {result.bountyCollected ? `${result.bountyCollected} bounty off ` : 'the top spot from '}
              {loserFirst}. The whole office just got told.
            </p>
          </>
        ) : (
          <>
            {winner && <span className="anim-rise"><PlayerAvatar player={winner} size={68} /></span>}
            <div className="anim-rise font-display text-[113px] font-extrabold leading-[.9] tracking-[-0.04em] tabular-nums [animation-delay:60ms]">+{shown}</div>
            <h1 id="win-title" className="anim-rise text-[40px] leading-[.92] [animation-delay:120ms] [overflow-wrap:anywhere]">{winnerFirst} wins</h1>
            {result.isUpset && <p className="anim-rise font-semibold text-white/70 [animation-delay:160ms]">That was an upset.</p>}
          </>
        )}

        {rows.length > 0 && (
          <div className="anim-rise grid w-full gap-0.5 text-left [animation-delay:180ms]">
            {rows.map(([label, value], index) => (
              <div key={index} className="grid grid-cols-[96px_1fr] items-baseline gap-2.5 rounded-[10px] bg-elev px-3 py-2.5 text-[13px] font-semibold leading-snug">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="anim-rise flex gap-2 [animation-delay:220ms]">
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewLeaderboard();
            }}
            className="press h-12 rounded-full bg-surface-alt px-5 text-[13px] font-extrabold uppercase tracking-[0.06em]"
          >
            See the ladder
          </button>
          <button type="button" onClick={onClose} autoFocus className="press h-12 rounded-full bg-white px-6 text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
            {result.crownChangedHands ? 'Long live the king' : 'Nice'}
          </button>
        </div>
      </div>
    </div>
  );
};
