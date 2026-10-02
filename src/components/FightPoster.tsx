import React, { useRef } from 'react';
import { Challenge, MatchRecord, Player } from '../types';
import { CrownState, computeRivalry } from '../utils/league';
import { previewStakes } from '../utils/stakes';
import { ballColor, playerBall } from '../utils/balls';
import { shamed } from '../utils/shame';
import { CallSplit, PlayerAvatar, SponsorPatch } from './ui';
import { sponsorOf } from '../utils/sponsors';
import { gsap, useGSAP, prefersReducedMotion } from '../utils/gsap';

export type PosterReason = 'crown' | 'derby' | 'grudge' | null;

const HEADLINE: Record<Exclude<PosterReason, null> | 'plain', string> = {
  plain: 'Fight night',
  crown: 'Crown match',
  derby: 'Top 3 derby',
  grudge: 'Grudge match',
};

/**
 * Why a match deserves a poster on its own: the crown is on the line, two of
 * the top three meet, or they have played each other ten times or more.
 */
export function posterReason(challenge: Challenge, players: Player[], matches: MatchRecord[], crown: CrownState): PosterReason {
  const pair = [challenge.challengerId, challenge.opponentId];
  if (crown.holderId && pair.includes(crown.holderId)) return 'crown';
  const ladder = [...players].filter((p) => p.wins + p.losses > 0).sort((a, b) => b.elo - a.elo);
  const rank = (id: string) => ladder.findIndex((p) => p.id === id) + 1;
  if (pair.every((id) => rank(id) > 0 && rank(id) <= 3)) return 'derby';
  const rivalry = computeRivalry(challenge.challengerId, challenge.opponentId, players, matches);
  if (rivalry && rivalry.meetings >= 10) return 'grudge';
  return null;
}

/**
 * The poster's banner on its own: two players on their ball colours, split
 * down a diagonal, a giant VS between them, and a slow idle pulse/shine so it
 * stays alive for however long it sits on screen — reused anywhere a match
 * deserves the fight-night treatment.
 */
export const FightPosterHero: React.FC<{
  a: Pick<Player, 'id' | 'name' | 'avatarUrl' | 'ball'>;
  b: Pick<Player, 'id' | 'name' | 'avatarUrl' | 'ball'>;
  height?: number | string;
}> = ({ a, b, height = 250 }) => {
  const colourA = ballColor(playerBall(a)).c;
  const colourB = ballColor(playerBall(b)).c;

  const heroRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const avatarARef = useRef<HTMLSpanElement>(null);
  const avatarBRef = useRef<HTMLSpanElement>(null);
  const shineRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      gsap.set(shineRef.current, { skewX: -20 });
      if (prefersReducedMotion()) return;
      // Each idle tween's first render is when GSAP samples its target's current
      // transform as a baseline. Starting before the CSS entrance animation
      // (duel-in-*: 620ms, accept-stamp: 940ms) finishes bakes in its mid-flight
      // offset forever, since the idle tween only ever touches y/scale from then
      // on — so delay past the entrance before letting GSAP take over.
      gsap.to(stampRef.current, { scale: 1.08, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.95 });
      gsap.to(avatarARef.current, { y: -7, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.65 });
      gsap.to(avatarBRef.current, { y: -7, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.05 });
      gsap.fromTo(
        shineRef.current,
        { xPercent: -150 },
        { xPercent: 250, duration: 2.2, ease: 'power1.inOut', repeat: -1, repeatDelay: 2.4 }
      );
    },
    { scope: heroRef }
  );

  return (
    <div ref={heroRef} className="relative overflow-hidden" style={{ height }}>
      <span className="accept-close-left absolute inset-0" style={{ background: colourA, clipPath: 'polygon(0 0, 64% 0, 36% 100%, 0 100%)' }} />
      <span className="accept-close-right absolute inset-0" style={{ background: colourB, clipPath: 'polygon(64% 0, 100% 0, 100% 100%, 36% 100%)' }} />
      <span
        ref={shineRef}
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-60"
        style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent)' }}
      />
      <span className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(10,10,10,1) 100%)' }} />
      <span ref={avatarARef} className="duel-in-left absolute left-[8%] top-[14%]"><PlayerAvatar player={a} size={112} /></span>
      <span ref={avatarBRef} className="duel-in-right absolute bottom-[12%] right-[8%]"><PlayerAvatar player={b} size={112} /></span>
      <span className="absolute left-1/2 top-1/2 -ml-[38px] -mt-[38px]">
        <span ref={stampRef} className="accept-stamp grid h-[76px] w-[76px] place-items-center rounded-full bg-bg font-display text-[34px] font-extrabold text-white shadow-[0_0_0_3px_#fff]">
          VS
        </span>
      </span>
    </div>
  );
};

/**
 * A boxing-style poster for a match on the table: the two of them on their
 * ball colours split down a diagonal, a giant VS, and underneath everything
 * the room is talking about. In the app only; tap anywhere to close.
 */
export const FightPoster: React.FC<{
  challenge: Challenge;
  players: Player[];
  matches: MatchRecord[];
  crown: CrownState;
  pot: number;
  onClose: () => void;
}> = ({ challenge, players, matches, crown, pot, onClose }) => {
  const byId = new Map(players.map((p) => [p.id, p]));
  const a = byId.get(challenge.challengerId);
  const b = byId.get(challenge.opponentId);
  if (!a || !b) return null;
  const reason = posterReason(challenge, players, matches, crown) ?? 'plain';
  const rivalry = computeRivalry(a.id, b.id, players, matches);
  const bountyOn = (p: Player) => (crown.holderId === p.id ? crown.bounty : 0);
  const stakeA = previewStakes(a, b, players, bountyOn(b), bountyOn(a));
  const stakeB = previewStakes(b, a, players, bountyOn(a), bountyOn(b));
  const forA = challenge.predictions.filter((p) => p.predictedWinnerId === a.id).length;
  const forB = challenge.predictions.filter((p) => p.predictedWinnerId === b.id).length;
  const streak = (p: Player) => (p.currentStreak > 0 ? `W${p.currentStreak}` : p.currentStreak < 0 ? `L${-p.currentStreak}` : 'Even');
  const rankMove = (s: typeof stakeA) => (s.rankIfWin < s.currentRank ? `#${s.currentRank} to #${s.rankIfWin}` : `stays #${s.currentRank}`);
  const form = (p: Player) => (
    <span className="flex gap-1">
      {[...p.recentForm].slice(0, 5).reverse().map((result, index) => (
        <i key={index} className={`block h-2 w-2 rounded-full ${result === 'W' ? 'bg-felt' : 'bg-loss'}`} />
      ))}
    </span>
  );
  const row = (label: string, left: React.ReactNode, right: React.ReactNode) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[10px] bg-elev px-3 py-2">
      <span className="justify-self-start text-sm font-black tabular-nums">{left}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/55">{label}</span>
      <span className="justify-self-end text-sm font-black tabular-nums">{right}</span>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={HEADLINE[reason]} onClick={onClose} className="anim-fade fixed inset-0 z-[65] grid place-items-center overflow-y-auto bg-black/90 p-4">
      <div className="anim-pop grid w-full max-w-sm overflow-hidden rounded-3xl bg-bg">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-[26px] leading-none">{HEADLINE[reason]}</h2>
          <span className="flex h-[26px] items-center gap-1.5 rounded-full bg-live px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">
            <span className="live-dot" />
            {challenge.status === 'live' ? 'Live' : 'Tonight'}
          </span>
        </div>

        <FightPosterHero a={a} b={b} />

        <div className="grid grid-cols-2 gap-2 px-4">
          {[[a, stakeA], [b, stakeB]].map(([p, s], index) => (
            <div key={(p as Player).id} className={`grid gap-0.5 ${index === 1 ? 'text-right' : ''}`}>
              <span className="font-display text-[28px] font-extrabold uppercase leading-[.95] tracking-[-0.02em] [overflow-wrap:anywhere]">
                {shamed((p as Player).name.split(' ')[0], p as Player)}
              </span>
              <span className="text-xs font-semibold tabular-nums text-white/55">
                {(p as Player).elo} Elo, #{(s as typeof stakeA).currentRank}
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-1 px-4 pb-4 pt-3">
          {row('Head to head', rivalry?.wins ?? 0, rivalry?.losses ?? 0)}
          {row('Form', form(a), form(b))}
          {row('Streak', streak(a), streak(b))}
          {row('If they win', `+${stakeA.winDelta}`, `+${stakeB.winDelta}`)}
          {row('Ladder', rankMove(stakeA), rankMove(stakeB))}
          {crown.holderId && [a.id, b.id].includes(crown.holderId) && crown.bounty > 0 && (
            <span className="justify-self-center rounded-full bg-crown px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg">👑 {crown.bounty} bounty on the line</span>
          )}
          <div className="grid gap-1.5 rounded-[10px] bg-elev px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/55">The office calls it</span>
              {pot > 0 && <span className="text-xs font-bold tabular-nums">🪙 {pot} in the pot</span>}
            </div>
            <CallSplit left={{ player: a, count: forA }} right={{ player: b, count: forB }} />
          </div>
          {(sponsorOf(a) || sponsorOf(b)) && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-1">
              <span className="justify-self-start">{sponsorOf(a) && <SponsorPatch sponsor={sponsorOf(a)!} height={26} />}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/55">Presented by</span>
              <span className="justify-self-end">{sponsorOf(b) && <SponsorPatch sponsor={sponsorOf(b)!} height={26} />}</span>
            </div>
          )}
          <p className="pt-1 text-center text-xs font-semibold text-white/55">Tap anywhere to close</p>
        </div>
      </div>
    </div>
  );
};
