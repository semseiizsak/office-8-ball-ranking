import React, { useMemo } from 'react';
import { Player } from '../../types';
import { BallBurst, PlayerAvatar } from '../ui';

const STAMPS = ['POW!', 'CRACK!', "RACK 'EM!", 'SNAP!', 'THWACK!'];

/**
 * Two players collide, copied from the accept/duel `Clash` animation rather
 * than nesting that component — `Clash` owns its own full-screen dismiss
 * behavior, which would fight with the screensaver's own tap-anywhere-to-quit.
 */
export const BallClashScene: React.FC<{ left?: Player; right?: Player }> = ({ left, right }) => {
  const stamp = useMemo(() => STAMPS[Math.floor(Math.random() * STAMPS.length)], []);
  if (!left || !right) return null;

  return (
    <div className="relative mx-auto grid w-full max-w-sm flex-1 content-center justify-items-center gap-3.5 px-6">
      <BallBurst />
      <span className="duel-shake pointer-events-none absolute inset-0 bg-white opacity-0" style={{ animation: 'duel-shake 1300ms var(--ease) both' }} />
      <div className="relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        <span className="duel-shock pointer-events-none absolute left-1/2 top-[34px] -ml-[60px] -mt-[60px] h-[120px] w-[120px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.55),rgba(255,255,255,0))]" />
        {[left, right].map((player, index) => (
          <React.Fragment key={player.id}>
            {index === 1 && (
              <span className="relative z-10 grid h-[84px] w-[116px] place-items-center">
                <span className="col-start-1 row-start-1 font-display text-3xl font-extrabold text-white/55" style={{ animation: 'anim-fade 640ms var(--ease) reverse both 300ms' }}>VS</span>
                <span className="accept-stamp col-start-1 row-start-1 rounded-lg bg-white px-3 py-2 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-bg">
                  {stamp}
                </span>
              </span>
            )}
            <span className={`${index === 0 ? 'accept-close-left' : 'accept-close-right'} relative z-10 grid min-w-0 justify-items-center gap-2`}>
              <PlayerAvatar player={player} size={88} />
              <span className="max-w-full font-display text-xl font-extrabold uppercase leading-none [overflow-wrap:anywhere]">{player.name.split(' ')[0]}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
