import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Player } from '../types';
import { Tournament } from '../utils/tournament';
import { Ball, BallBurst, PlayerAvatar } from './ui';
import { Check } from './cup/icons';

const pad = (n: number) => String(n).padStart(2, '0');
const countdownOf = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/** The balls drifting round the edges, placed once so they don't jump about on re-render. */
const DRIFTERS = [
  { n: 1, left: '4%', top: '12%', size: 54, d: 0 },
  { n: 11, left: '88%', top: '8%', size: 44, d: 1.4 },
  { n: 3, left: '92%', top: '46%', size: 60, d: 0.6 },
  { n: 14, left: '2%', top: '58%', size: 40, d: 2.1 },
  { n: 5, left: '80%', top: '86%', size: 50, d: 1 },
  { n: 8, left: '10%', top: '90%', size: 46, d: 2.6 },
];

/**
 * Monday morning on the wall: the week's cup is open, and everyone can see who
 * is already in. Names in felt green are signed up; anyone else taps their
 * name, confirms, and lands in the list with a burst of balls.
 */
export const KioskCupSignup: React.FC<{
  cup: Tournament | null;
  players: Player[];
  onJoin: (playerId: string) => Promise<void>;
  onClose: () => void;
}> = ({ cup, players, onJoin, onClose }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const entrants = cup?.entrants ?? [];
  const joinedAt = useMemo(() => new Map(entrants.map((entry) => [entry.id, entry.at])), [entrants]);
  // Who is in first, in the order they signed up; everyone else alphabetically after.
  const ordered = useMemo(
    () =>
      [...players].sort((a, b) => {
        const left = joinedAt.get(a.id);
        const right = joinedAt.get(b.id);
        if (left !== undefined && right !== undefined) return left - right;
        if (left !== undefined) return -1;
        if (right !== undefined) return 1;
        return a.name.localeCompare(b.name);
      }),
    [players, joinedAt]
  );

  // Celebrate whoever joined since the last snapshot, from here or a phone,
  // but not everybody already in when the screen first opens.
  const seenRef = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  useEffect(() => {
    if (!cup) return;
    const ids = new Set(cup.entrants.map((entry) => entry.id));
    if (seenRef.current) {
      const added = cup.entrants.find((entry) => !seenRef.current!.has(entry.id));
      if (added) {
        setFresh(added.id);
        setBurstKey((key) => key + 1);
      }
    }
    seenRef.current = ids;
  }, [cup]);
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => setFresh(null), 1600);
    return () => window.clearTimeout(timer);
  }, [fresh, burstKey]);

  const [confirming, setConfirming] = useState<Player | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (!confirming) return;
    setIsJoining(true);
    setError(null);
    try {
      await onJoin(confirming.id);
      setConfirming(null);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not sign up. Try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const isOpen = !!cup && now >= cup.opensAt && now < cup.closesAt;
  const closesAt = cup ? new Date(cup.closesAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '12:00';

  return (
    <div className="anim-fade fixed inset-0 z-[60] flex flex-col overflow-hidden bg-bg px-6 pb-[calc(var(--safe-bottom)+1.25rem)] pt-[calc(var(--safe-top)+1.5rem)] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {DRIFTERS.map((ball) => (
          <span key={ball.n} className="cup-drift absolute" style={{ left: ball.left, top: ball.top, animationDelay: `-${ball.d}s` }}>
            <Ball n={ball.n} size={ball.size} />
          </span>
        ))}
      </div>

      <header className="relative flex items-end justify-between gap-6">
        <div className="flex items-center gap-5">
          <span className="cup-swing flex h-20 w-20 flex-none items-center justify-center rounded-full bg-crown text-bg">
            <Trophy className="h-10 w-10" strokeWidth={2.25} />
          </span>
          <div>
            <h1 className="font-display text-6xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em]">Weekly cup</h1>
            <p className="mt-2 text-xl font-semibold text-white/60">
              <b className="font-extrabold text-white">{entrants.length}</b> in
              <span className="ml-4">Sign-ups close at {closesAt}</span>
            </p>
          </div>
        </div>
        <div className="flex-none text-right">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-white/55">{isOpen ? 'Draw in' : 'Sign-ups closed'}</p>
          <p className="font-display text-6xl font-extrabold tabular-nums leading-none">{countdownOf(cup && isOpen ? cup.closesAt - now : 0)}</p>
        </div>
      </header>

      <div className="relative mt-8 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto pb-4 md:grid-cols-3 xl:grid-cols-4">
        {ordered.map((player, index) => {
          const isIn = joinedAt.has(player.id);
          const [first, ...rest] = player.name.split(' ');
          return (
            <button
              key={player.id}
              type="button"
              disabled={isIn || !isOpen}
              onClick={() => {
                setError(null);
                setConfirming(player);
              }}
              style={{ animationDelay: `${Math.min(index, 16) * 40}ms` }}
              className={`card-drop press relative flex min-h-[112px] items-center gap-4 rounded-3xl px-5 py-4 text-left transition-colors ${
                isIn ? 'bg-felt text-white' : 'bg-surface-alt text-white'
              } ${fresh === player.id ? 'cup-joined' : ''}`}
            >
              <PlayerAvatar player={player} size={64} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[34px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em]">{first}</span>
                <span className={`mt-1 block truncate text-base font-semibold ${isIn ? 'text-white' : 'text-white/55'}`}>
                  {isIn ? 'In the cup' : rest.join(' ') || 'Tap to join'}
                </span>
              </span>
              {isIn && (
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white">
                  <Check size={24} stroke="#0B7A3E" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {fresh && (
        <div key={burstKey} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[62]">
          <BallBurst />
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="press relative mt-2 flex h-[60px] w-full flex-none items-center justify-center rounded-full bg-surface-alt text-base font-extrabold uppercase tracking-[0.06em]"
      >
        Back to the ladder
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !isJoining && setConfirming(null)}
          className="anim-fade fixed inset-0 z-[64] flex items-center justify-center bg-black/70 px-6"
        >
          <div onClick={(event) => event.stopPropagation()} className="anim-pop grid w-full max-w-md justify-items-center gap-5 rounded-[32px] bg-elev p-8 text-center">
            <PlayerAvatar player={confirming} size={120} />
            <h2 className="font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em]">
              {confirming.name.split(' ')[0]}, you in?
            </h2>
            <p className="text-lg font-semibold text-white/60">Draw at {closesAt}. Final by Friday 17:00.</p>
            {error && <p className="text-base font-semibold text-live">{error}</p>}
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isJoining}
                onClick={() => setConfirming(null)}
                className="press h-[60px] rounded-full bg-surface-alt text-base font-extrabold uppercase tracking-[0.06em]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isJoining}
                onClick={() => void confirm()}
                className="press h-[60px] rounded-full bg-felt text-base font-extrabold uppercase tracking-[0.06em] text-white"
              >
                {isJoining ? 'Signing up' : "I'm in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
