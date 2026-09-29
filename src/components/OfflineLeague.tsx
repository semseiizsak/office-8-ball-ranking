import React, { useMemo, useState } from 'react';
import { CloudOff, RotateCw, Trophy, X } from 'lucide-react';
import { Ball, fieldClass, labelClass } from './ui';
import { CachedPlayer, OfflineMatch, provisionalStandings } from '../utils/outbox';

interface OfflineLeagueProps {
  roster: CachedPlayer[];
  outbox: OfflineMatch[];
  currentPlayerId: string | null;
  resetsAt: number;
  reason: string;
  checking: boolean;
  onQueue: (entry: { winnerId: string | null; loserId: string | null; winnerName: string; loserName: string }) => void;
  onRemove: (id: string) => void;
  onRetry: () => void;
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (at: number) => {
  const date = new Date(at);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? clock(at)
    : `${date.toLocaleDateString([], { weekday: 'short' })} ${clock(at)}`;
};

const button =
  'press flex h-12 w-full items-center justify-center gap-2 rounded-full text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-40';

/** One tappable name. */
const Pick: React.FC<{ player: CachedPlayer; active: boolean; tone: 'win' | 'lose'; onClick: () => void }> = ({
  player,
  active,
  tone,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`press flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-bold ${
      active ? (tone === 'win' ? 'bg-white text-bg' : 'bg-surface-alt text-white ring-2 ring-white/70') : 'bg-card text-white'
    }`}
  >
    <Ball n={player.ball ?? 8} size={16} bare />
    <span className="min-w-0 truncate">{player.name.split(' ')[0]}</span>
  </button>
);

/**
 * What the app becomes when the league database will not answer.
 *
 * Everything that needs the database is gone; what is left is the one thing
 * that must never stop: saying who beat whom. Results are kept on this phone
 * and go into the league, in the order they were played, the next time the
 * database answers. A phone that has never seen the roster takes typed names.
 */
export const OfflineLeague: React.FC<OfflineLeagueProps> = ({
  roster,
  outbox,
  currentPlayerId,
  resetsAt,
  reason,
  checking,
  onQueue,
  onRemove,
  onRetry,
}) => {
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [loserId, setLoserId] = useState<string | null>(null);
  const [winnerName, setWinnerName] = useState('');
  const [loserName, setLoserName] = useState('');
  const [justLogged, setJustLogged] = useState<string | null>(null);

  const hasRoster = roster.length >= 2;
  const standings = useMemo(() => provisionalStandings(roster, outbox), [roster, outbox]);
  const nameOf = (id: string | null) => roster.find((player) => player.id === id)?.name ?? '';
  // Names typed on this phone before, so the second game is two taps too.
  const typedNames = useMemo(
    () => [...new Set(outbox.flatMap((entry) => [entry.winnerName, entry.loserName]))].sort(),
    [outbox]
  );
  const picks = useMemo(() => [...roster].sort((left, right) => left.name.localeCompare(right.name)), [roster]);

  const winner = hasRoster ? nameOf(winnerId) : winnerName.trim();
  const loser = hasRoster ? nameOf(loserId) : loserName.trim();
  const sameName = !!winner && winner.toLowerCase() === loser.toLowerCase();
  const ready = !!winner && !!loser && !sameName;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onQueue({
      winnerId: hasRoster ? winnerId : null,
      loserId: hasRoster ? loserId : null,
      winnerName: winner,
      loserName: loser,
    });
    setJustLogged(`${winner.split(' ')[0]} beat ${loser.split(' ')[0]}`);
    setWinnerId(null);
    setLoserId(null);
    setWinnerName('');
    setLoserName('');
  };

  const queued = [...outbox].sort((left, right) => right.playedAt - left.playedAt);
  const me = currentPlayerId ? roster.find((player) => player.id === currentPlayerId) : undefined;

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto grid w-full max-w-md gap-4 px-3 pb-[calc(var(--safe-bottom)+1.5rem)] pt-[calc(var(--safe-top)+1.5rem)]">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-card">
            <CloudOff className="h-6 w-6 text-white/70" />
          </span>
          <h1 className="text-[34px] leading-none">Keep playing</h1>
          <p className="text-sm text-white/70">
            The league database hit its free daily limit. Log games here. They stay on this phone and go into the
            league, in the order you played them, when it's back around <span className="font-bold text-white">{clock(resetsAt)}</span>.
          </p>
        </div>

        <form id="offline-log" onSubmit={submit} className="grid gap-3 rounded-2xl bg-elev p-3">
          {hasRoster ? (
            <>
              <div className={labelClass}>
                Who won?
                <div className="grid grid-cols-3 gap-1.5">
                  {picks.map((player) => (
                    <Pick
                      key={player.id}
                      player={player}
                      tone="win"
                      active={winnerId === player.id}
                      onClick={() => {
                        setWinnerId(player.id);
                        if (loserId === player.id) setLoserId(null);
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className={labelClass}>
                Who lost?
                <div className="grid grid-cols-3 gap-1.5">
                  {picks
                    .filter((player) => player.id !== winnerId)
                    .map((player) => (
                      <Pick key={player.id} player={player} tone="lose" active={loserId === player.id} onClick={() => setLoserId(player.id)} />
                    ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-white/55">
                This phone hasn't loaded the roster yet, so type first names. They're matched to the right players when the
                league is back.
              </p>
              <label className={labelClass}>
                Who won?
                <input
                  value={winnerName}
                  onChange={(event) => setWinnerName(event.target.value)}
                  list="offline-names"
                  autoComplete="off"
                  placeholder="First name"
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                Who lost?
                <input
                  value={loserName}
                  onChange={(event) => setLoserName(event.target.value)}
                  list="offline-names"
                  autoComplete="off"
                  placeholder="First name"
                  className={fieldClass}
                />
              </label>
              <datalist id="offline-names">
                {typedNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          )}
          {sameName && <p className="text-sm font-bold">Pick two different players.</p>}
          <button type="submit" disabled={!ready} className={`${button} bg-white text-bg`}>
            <Trophy className="h-[18px] w-[18px]" strokeWidth={2.25} />
            {ready ? `${winner.split(' ')[0]} beat ${loser.split(' ')[0]}` : 'Log the result'}
          </button>
          {justLogged && (
            <p role="status" className="anim-rise text-center text-sm font-bold text-white/80">
              Saved on this phone: {justLogged}.
            </p>
          )}
        </form>

        {queued.length > 0 && (
          <section className="grid gap-1.5">
            <h2 className="px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-white/55">
              Waiting on this phone · {queued.length}
            </h2>
            <ul className="grid gap-0.5">
              {queued.map((entry) => (
                <li key={entry.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl bg-card px-3 py-2.5">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-bold">{entry.winnerName.split(' ')[0]}</span>
                    <span className="text-white/55"> beat </span>
                    {entry.loserName.split(' ')[0]}
                  </span>
                  <span className="text-xs tabular-nums text-white/55">{day(entry.playedAt)}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    aria-label={`Remove ${entry.winnerName} beat ${entry.loserName}`}
                    className="press grid h-8 w-8 place-items-center rounded-full bg-surface-alt text-white/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasRoster && (
          <section className="grid gap-1.5">
            <h2 className="px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-white/55">
              Standings on this phone{outbox.length > 0 ? ' · provisional' : ''}
            </h2>
            <ol className="grid gap-0.5">
              {standings.slice(0, 12).map((player, index) => (
                <li
                  key={player.id}
                  className={`grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-xl px-3 py-2 ${player.id === me?.id ? 'bg-surface-alt' : 'bg-card'}`}
                >
                  <span className="text-sm font-black tabular-nums text-white/55">{index + 1}</span>
                  <span className="truncate text-sm font-bold">{player.name}</span>
                  <span className="text-sm font-black tabular-nums">{player.elo}</span>
                </li>
              ))}
            </ol>
            <p className="px-1 text-xs text-white/45">
              Other phones may be holding games too. The real numbers are worked out when everything syncs.
            </p>
          </section>
        )}

        <button type="button" onClick={onRetry} disabled={checking} className={`${button} bg-surface-alt`}>
          <RotateCw className={`h-[18px] w-[18px] ${checking ? 'animate-spin' : ''}`} strokeWidth={2.25} />
          {checking ? 'Checking' : 'Try the league now'}
        </button>
        <p className="break-words px-1 text-center text-[11px] text-white/35">{reason}</p>
      </div>
    </div>
  );
};
