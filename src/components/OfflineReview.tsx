import React, { useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { Player } from '../types';
import { OfflineMatch, resolveName } from '../utils/outbox';

interface OfflineReviewProps {
  entries: OfflineMatch[];
  players: Player[];
  onFix: (id: string, winnerId: string, loserId: string) => void;
  onRemove: (id: string) => void;
}

const selectClass =
  'h-10 w-full min-w-0 rounded-lg bg-surface px-2 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-white/40';

/** A queued game whose typed names matched nobody for sure: pick who was meant. */
const FixRow: React.FC<{ entry: OfflineMatch; players: Player[]; onFix: OfflineReviewProps['onFix']; onRemove: (id: string) => void }> = ({
  entry,
  players,
  onFix,
  onRemove,
}) => {
  const ids = new Set(players.map((player) => player.id));
  const guess = (id: string | null, name: string) => (id && ids.has(id) ? id : resolveName(name, players) ?? '');
  const [winnerId, setWinnerId] = useState(guess(entry.winnerId, entry.winnerName));
  const [loserId, setLoserId] = useState(guess(entry.loserId, entry.loserName));
  const sorted = [...players].sort((left, right) => left.name.localeCompare(right.name));
  const ready = !!winnerId && !!loserId && winnerId !== loserId;

  return (
    <li className="grid gap-2 rounded-xl bg-card p-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-white/60">
        <span className="min-w-0 truncate">
          Typed: <span className="font-bold text-white">{entry.winnerName}</span> beat{' '}
          <span className="font-bold text-white">{entry.loserName}</span> ·{' '}
          {new Date(entry.playedAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        <button type="button" onClick={() => onRemove(entry.id)} aria-label="Remove this game" className="press grid h-7 w-7 place-items-center rounded-full bg-surface-alt">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <select aria-label="Winner" value={winnerId} onChange={(event) => setWinnerId(event.target.value)} className={selectClass}>
          <option value="">Winner?</option>
          {sorted.map((player) => (
            <option key={player.id} value={player.id}>{player.name}</option>
          ))}
        </select>
        <span className="text-xs font-bold text-white/55">beat</span>
        <select aria-label="Loser" value={loserId} onChange={(event) => setLoserId(event.target.value)} className={selectClass}>
          <option value="">Loser?</option>
          {sorted.map((player) => (
            <option key={player.id} value={player.id}>{player.name}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => onFix(entry.id, winnerId, loserId)}
        className="press h-10 rounded-full bg-white text-[12px] font-extrabold uppercase tracking-[0.06em] text-bg disabled:opacity-40"
      >
        Add to the league
      </button>
    </li>
  );
};

/**
 * Games logged on this phone while the league was down. The ones whose players
 * are known go in by themselves; this only asks about the ones it cannot place.
 */
export const OfflineReview: React.FC<OfflineReviewProps> = ({ entries, players, onFix, onRemove }) => {
  if (players.length === 0) return null;
  const ids = new Set(players.map((player) => player.id));
  const known = (id: string | null, name: string) => (id && ids.has(id)) || !!resolveName(name, players);
  const unresolved = entries.filter(
    (entry) => !known(entry.winnerId, entry.winnerName) || !known(entry.loserId, entry.loserName)
  );
  const pending = entries.length - unresolved.length;

  return (
    <section id="offline-review" className="anim-rise mb-2 grid gap-2 rounded-2xl bg-elev p-3">
      <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-white/70">
        <CloudUpload className="h-4 w-4" />
        Games from while the league was down
      </h2>
      {pending > 0 && (
        <p className="text-sm text-white/70">
          {pending} game{pending === 1 ? '' : 's'} saved on this phone. {pending === 1 ? 'It goes' : 'They go'} into the league as soon as it answers.
        </p>
      )}
      {unresolved.length > 0 && (
        <>
          <p className="text-sm text-white/70">These names didn't match anyone for sure. Pick who played.</p>
          <ul className="grid gap-1.5">
            {unresolved.map((entry) => (
              <FixRow key={entry.id} entry={entry} players={players} onFix={onFix} onRemove={onRemove} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
