import React from 'react';
import { Player } from '../types';
import { CHAMPION_CHIPS, CupState, Tournament, roundName } from '../utils/tournament';
import { PlayerAvatar } from './ui';

const first = (name: string) => name.split(' ')[0];
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * The weekly cup in the arena: sign up on Monday morning, then the bracket,
 * round by round, with a one-tap way to play your own tie.
 */
export const CupCard: React.FC<{
  tournament: Tournament;
  state: CupState | null;
  players: Player[];
  currentPlayer: Player;
  now: number;
  onJoin: () => void;
  onPlay: (opponentId: string) => void;
}> = ({ tournament, state, players, currentPlayer, now, onJoin, onPlay }) => {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? first(byId.get(id)?.name ?? '?') : 'TBD');
  const signedUp = tournament.entrants.some((entry) => entry.id === currentPlayer.id);
  const open = now >= tournament.opensAt && now < tournament.closesAt;
  const before = now < tournament.opensAt;
  const drawn = tournament.bracket !== null;

  const header = (aside: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-base">Weekly cup</h3>
      <span className="text-xs font-semibold text-white/55">{aside}</span>
    </div>
  );

  if (before || open || !drawn) {
    return (
      <div className="card-drop grid gap-3 rounded-2xl bg-card p-3.5">
        {header(before ? `Sign-ups open ${clock(tournament.opensAt)}` : open ? `Closes ${clock(tournament.closesAt)}` : 'Drawing')}
        <p className="text-sm text-white/70">
          Knockout for the first 8 to sign up, or 4 if fewer come. Random draw at {clock(tournament.closesAt)}, done by Friday {clock(tournament.deadline)}. The champion takes 🏆 and {CHAMPION_CHIPS} chips.
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="flex -space-x-1.5">
            {tournament.entrants.slice(0, 8).map((entry) => (
              <span key={entry.id} className="rounded-full ring-2 ring-card">
                <PlayerAvatar player={byId.get(entry.id) ?? { id: entry.id, name: '?', avatarUrl: '' }} size={28} />
              </span>
            ))}
          </span>
          <span className="text-xs font-bold tabular-nums">{tournament.entrants.length} signed up</span>
        </div>
        {open && (
          <button
            type="button"
            disabled={signedUp}
            onClick={onJoin}
            className="press h-11 rounded-full bg-white text-xs font-extrabold uppercase tracking-[0.06em] text-bg disabled:bg-surface-alt disabled:text-white"
          >
            {signedUp ? "You're in" : 'Sign me up'}
          </button>
        )}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="grid gap-2 rounded-2xl bg-card p-3.5">
        {header('Off this week')}
        <p className="text-sm text-white/70">Fewer than 4 signed up, so no cup this week. Next one opens Monday morning.</p>
      </div>
    );
  }

  return (
    <div className="card-drop grid gap-3 rounded-2xl bg-card p-3.5">
      {header(state.champion ? 'Done' : state.unfinished ? 'Unfinished' : `Ends Friday ${clock(tournament.deadline)}`)}
      {state.champion && (
        <div className="flex items-center gap-3 rounded-xl bg-crown p-3 text-bg">
          <PlayerAvatar player={byId.get(state.champion) ?? null} size={44} />
          <span className="grid">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">Champion</span>
            <b className="font-display text-lg font-extrabold uppercase leading-none">🏆 {name(state.champion)}</b>
          </span>
        </div>
      )}
      {state.rounds.map((games, round) => (
        <div key={round} className="grid gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{roundName(round, state.rounds.length)}</span>
          {games.map((game, index) => {
            const mine = !game.winnerId && game.a && game.b && [game.a, game.b].includes(currentPlayer.id);
            const opponent = game.a === currentPlayer.id ? game.b : game.a;
            return (
              <div key={index} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl px-3 py-2 ${mine ? 'bg-surface-alt shadow-[inset_0_0_0_1.5px_#fff]' : 'bg-surface'}`}>
                {[game.a, game.b].map((id, side) => (
                  <React.Fragment key={side}>
                    {side === 1 && <span className="font-display text-xs font-extrabold text-white/55">VS</span>}
                    <span className={`flex min-w-0 items-center gap-2 ${side === 1 ? 'flex-row-reverse text-right' : ''}`}>
                      {id ? <PlayerAvatar player={byId.get(id) ?? null} size={24} /> : <span className="h-6 w-6 flex-none rounded-full bg-surface-alt" />}
                      <span className={`truncate text-sm font-bold ${game.winnerId && game.winnerId !== id ? 'text-white/40' : ''}`}>
                        {id && game.winnerId === id ? '✓ ' : ''}{name(id)}
                      </span>
                    </span>
                  </React.Fragment>
                ))}
                {mine && opponent && (
                  <button
                    type="button"
                    onClick={() => onPlay(opponent)}
                    className="press col-span-3 mt-1 h-9 rounded-full bg-white text-[11px] font-extrabold uppercase tracking-[0.08em] text-bg"
                  >
                    Play your tie now
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
