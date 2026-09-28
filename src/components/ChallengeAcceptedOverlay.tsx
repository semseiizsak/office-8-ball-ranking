import React, { useEffect } from 'react';
import { Challenge, Player } from '../types';
import { PlayerAvatar } from './ui';

interface ChallengeAcceptedOverlayProps {
  challenge: Challenge;
  players: Player[];
  onComplete: () => void;
}

/**
 * Answering a callout. The two of them come in from either side, the VS
 * flashes, and an ACCEPTED stamp comes down where they meet.
 */
export const ChallengeAcceptedOverlay: React.FC<ChallengeAcceptedOverlayProps> = ({ challenge, players, onComplete }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);
  const challenger = players.find((player) => player.id === challenge.challengerId);
  const opponent = players.find((player) => player.id === challenge.opponentId);
  return <Clash stamp="Accepted" onComplete={onComplete} left={{ player: challenger, id: challenge.challengerId, name: challenge.challengerName }} right={{ player: opponent, id: challenge.opponentId, name: challenge.opponentName }} headline="It's on" text="Calls stay open until one of you starts the match." />;
};

interface Side {
  player?: Player;
  id: string;
  name: string;
}

/** The shared clash scene: sides close in, flash, stamp, then the words. */
export const Clash: React.FC<{
  left: Side;
  right: Side;
  stamp: string;
  live?: boolean;
  headline: string;
  text: React.ReactNode;
  onComplete: () => void;
}> = ({ left, right, stamp, live, headline, text, onComplete }) => (
  <div role="status" aria-live="polite" onClick={onComplete} className="anim-fade fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-black p-6 text-center">
    <span className="duel-shake pointer-events-none absolute inset-0 bg-white opacity-0" style={{ animation: 'duel-shake 1300ms var(--ease) both' }} />
    <div className="relative grid w-full max-w-sm justify-items-center gap-3.5">
      <div className="relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        <span className="duel-shock pointer-events-none absolute left-1/2 top-[34px] -ml-[60px] -mt-[60px] h-[120px] w-[120px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.55),rgba(255,255,255,0))]" />
        {[left, right].map((side, index) => (
          <React.Fragment key={side.id}>
            {index === 1 && (
              <span className="relative z-10 grid h-[84px] w-[116px] place-items-center">
                <span className="col-start-1 row-start-1 font-display text-3xl font-extrabold text-white/55" style={{ animation: 'anim-fade 640ms var(--ease) reverse both 300ms' }}>VS</span>
                <span className={`accept-stamp col-start-1 row-start-1 rounded-lg px-3 py-2 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] ${live ? 'bg-live text-white' : 'bg-white text-bg'}`}>
                  {stamp}
                </span>
              </span>
            )}
            <span className={`${index === 0 ? 'accept-close-left' : 'accept-close-right'} relative z-10 grid min-w-0 justify-items-center gap-2`}>
              <PlayerAvatar player={side.player ?? { id: side.id, name: side.name, avatarUrl: '' }} size={68} />
              <span className="max-w-full font-display text-base font-extrabold uppercase leading-none [overflow-wrap:anywhere]">{side.name.split(' ')[0]}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
      <h1 className="after-1 text-[64px] leading-[.92] tracking-[-0.03em]">{headline}</h1>
      <p className="after-2 max-w-[30ch] font-semibold text-white/70">{text}</p>
    </div>
  </div>
);
