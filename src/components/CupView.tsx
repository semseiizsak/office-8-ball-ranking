import React from 'react';
import { MatchRecord, Player } from '../types';
import { CHAMPION_CHIPS, CupRecord, CupState, FINALIST_CHIPS, Tournament, resolveCup, weekTournament } from '../utils/tournament';
import { CupCard } from './CupCard';
import { PlayerAvatar } from './ui';

const first = (name: string) => name.split(' ')[0];
const weekLabel = (from: number) => new Date(from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Everything about the weekly cup in one tab: this week's sign-up or bracket,
 * how it works, the trophy cabinet and every past final.
 */
export const CupView: React.FC<{
  tournaments: Tournament[];
  current: Tournament | null;
  currentState: CupState | null;
  records: Map<string, CupRecord>;
  matches: MatchRecord[];
  players: Player[];
  currentPlayer: Player;
  now: number;
  onJoin: () => void;
  onPlay: (opponentId: string) => void;
  onSelectPlayer: (player: Player) => void;
}> = ({ tournaments, current, currentState, records, matches, players, currentPlayer, now, onJoin, onPlay, onSelectPlayer }) => {
  const byId = new Map(players.map((p) => [p.id, p]));
  const past = tournaments
    .filter((cup) => cup.week !== current?.week)
    .sort((a, b) => b.week.localeCompare(a.week))
    .map((cup) => ({ cup, state: resolveCup(cup, matches, now) }))
    .filter((entry) => entry.state);
  const cabinet = [...records]
    .filter(([id, record]) => byId.has(id) && (record.titles > 0 || record.finals > 0))
    .sort((a, b) => b[1].titles - a[1].titles || b[1].finals - a[1].finals || b[1].matchWins - a[1].matchWins);
  const next = weekTournament(now + 7 * 86_400_000);

  return (
    <div className="stagger grid gap-3 pb-28">
      {current ? (
        <CupCard tournament={current} state={currentState} players={players} currentPlayer={currentPlayer} now={now} onJoin={onJoin} onPlay={onPlay} />
      ) : (
        <div className="grid gap-2 rounded-2xl bg-card p-3.5">
          <h3 className="text-base">Weekly cup</h3>
          <p className="text-sm text-white/70">
            Next one opens {new Date(next.opensAt).toLocaleDateString(undefined, { weekday: 'long' })} at{' '}
            {new Date(next.opensAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.
          </p>
        </div>
      )}

      <section className="grid gap-2 rounded-2xl bg-card p-3.5">
        <h3 className="text-base">How it works</h3>
        <ol className="grid gap-1.5 text-sm text-white/70">
          <li><b className="text-white">Monday morning</b> sign-ups open. The first 8 in play, or 4 if fewer come.</li>
          <li><b className="text-white">At the close</b> the draw is completely random.</li>
          <li><b className="text-white">Straight knockout</b> until Friday 17:00. Your first match against your opponent after the draw decides it.</li>
          <li><b className="text-white">Every match counts for Elo</b> as usual.</li>
          <li><b className="text-white">The champion</b> gets 🏆 and {CHAMPION_CHIPS} chips, the runner-up {FINALIST_CHIPS}.</li>
        </ol>
      </section>

      {cabinet.length > 0 && (
        <section className="grid gap-2">
          <h3 className="px-1 text-base">Trophy cabinet</h3>
          <div className="grid gap-0.5">
            {cabinet.map(([id, record], index) => {
              const player = byId.get(id)!;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectPlayer(player)}
                  className={`press grid grid-cols-[22px_auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === 0 ? 'bg-crown text-bg' : 'bg-surface'}`}
                >
                  <span className="text-[13px] font-black tabular-nums">{index + 1}</span>
                  <PlayerAvatar player={player} size={28} />
                  <span className="truncate text-sm font-bold">{first(player.name)}</span>
                  <span className="text-sm font-black tabular-nums">
                    {'🏆'.repeat(Math.min(record.titles, 5))}
                    {record.titles > 5 ? ` ${record.titles}` : ''}
                    {record.titles === 0 ? `${record.finals} final${record.finals === 1 ? '' : 's'}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="grid gap-2">
          <h3 className="px-1 text-base">Past cups</h3>
          {past.map(({ cup, state }) => (
            <div key={cup.week} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
              <span className="grid min-w-0 gap-0.5">
                <b className="text-sm">Week of {weekLabel(cup.opensAt)}</b>
                <span className="truncate text-xs font-semibold text-white/55">
                  {state!.champion
                    ? `Beat ${first(byId.get(state!.runnerUp ?? '')?.name ?? '?')} in the final`
                    : 'Final never played'}
                </span>
              </span>
              {state!.champion ? (
                <span className="flex flex-none items-center gap-2">
                  <PlayerAvatar player={byId.get(state!.champion) ?? null} size={32} />
                  <b className="text-sm">🏆 {first(byId.get(state!.champion)?.name ?? '?')}</b>
                </span>
              ) : (
                <span className="text-xs font-semibold text-white/55">{cup.bracket?.length ?? 0} players</span>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
