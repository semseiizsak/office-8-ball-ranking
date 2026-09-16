import React, { useState } from 'react';
import { Check, Crown, Lock, Medal, Pencil, Trash2, X } from 'lucide-react';
import { MatchRecord, Player, Season } from '../types';
import { matchesInSeason, softResetElo } from '../utils/league';

interface EventsViewProps {
  matches: MatchRecord[];
  players: Player[];
  season: Season;
  seasons: Season[];
  onEditWinner: (matchId: string, winnerId: string) => Promise<void>;
  onDelete: (matchId: string) => Promise<void>;
  onEndSeason: () => Promise<void>;
}

const formatDate = (value: number) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const EventsView: React.FC<EventsViewProps> = ({
  matches,
  players,
  season,
  seasons,
  onEditWinner,
  onDelete,
  onEndSeason,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const currentMatches = matchesInSeason(matches, season);
  const currentIds = new Set(currentMatches.map((match) => match.id));
  const archivedMatches = matches.filter((match) => !currentIds.has(match.id));
  const pastSeasons = seasons.filter((entry) => entry.endedAt !== null);

  const beginEdit = (match: MatchRecord) => {
    setEditingId(match.id);
    setWinnerId(match.winnerId);
    setError('');
  };

  const saveEdit = async (match: MatchRecord) => {
    if (!winnerId || winnerId === match.winnerId) {
      setEditingId(null);
      return;
    }
    try {
      setBusyId(match.id);
      await onEditWinner(match.id, winnerId);
      setEditingId(null);
    } catch {
      setError('Could not edit this event.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (match: MatchRecord) => {
    if (!window.confirm(`Delete ${match.playerAName} vs ${match.playerBName}? Ratings will be recalculated.`)) return;
    try {
      setBusyId(match.id);
      await onDelete(match.id);
    } catch {
      setError('Could not delete this event.');
    } finally {
      setBusyId(null);
    }
  };

  const endSeason = async () => {
    try {
      setIsEnding(true);
      await onEndSeason();
      setConfirmingEnd(false);
    } catch {
      setError('Could not close the season.');
    } finally {
      setIsEnding(false);
    }
  };

  const renderMatch = (match: MatchRecord, editable: boolean) => {
    const winnerIsA = match.winnerId === match.playerAId;
    const isEditing = editingId === match.id;
    const isBusy = busyId === match.id;

    return (
      <div key={match.id} className={`rounded-2xl border border-[#30363d] bg-[#161b22] p-4 ${editable ? '' : 'opacity-70'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#86948a]">
              {new Date(match.timestamp).toLocaleString()}
            </p>
            <p className="mt-1 font-['Chivo'] text-sm font-bold text-white">
              {match.playerAName} <span className="text-[#86948a]">vs</span> {match.playerBName}
            </p>
            <p className="mt-1 text-xs text-[#bbcabf]">
              Winner: <span className="font-bold text-[#4edea3]">{winnerIsA ? match.playerAName : match.playerBName}</span> ·{' '}
              {match.eloDelta} Elo
              {match.bountyCollected > 0 && (
                <span className="text-[#f59e0b]"> + {match.bountyCollected} bounty</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {editable ? (
              <>
                <button type="button" onClick={() => beginEdit(match)} disabled={isBusy} className="rounded-lg border border-[#30363d] p-2 text-[#86948a] hover:border-[#10b981] hover:text-[#4edea3] disabled:opacity-40" title="Edit event">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(match)} disabled={isBusy} className="rounded-lg border border-[#30363d] p-2 text-[#86948a] hover:border-[#ef4444] hover:text-[#ffb4ab] disabled:opacity-40" title="Delete event">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="flex items-center gap-1 rounded-lg border border-[#30363d] px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-[#86948a]" title="Archived seasons are a record and cannot be edited">
                <Lock className="h-3 w-3" />
                Archived
              </span>
            )}
          </div>
        </div>
        {isEditing && (
          <div className="mt-3 flex items-center gap-2 border-t border-[#30363d] pt-3">
            <select value={winnerId} onChange={(event) => setWinnerId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#30363d] bg-[#10141a] px-2 py-2 text-xs text-white outline-none focus:border-[#10b981]">
              {[match.playerAId, match.playerBId].map((playerId) => {
                const player = players.find((entry) => entry.id === playerId);
                return (
                  <option key={playerId} value={playerId}>
                    {player?.name ?? (playerId === match.playerAId ? match.playerAName : match.playerBName)}
                  </option>
                );
              })}
            </select>
            <button type="button" onClick={() => saveEdit(match)} disabled={isBusy} className="rounded-lg bg-[#10b981] p-2 text-[#002113]" title="Save event"><Check className="h-4 w-4" /></button>
            <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-[#30363d] p-2 text-[#86948a]" title="Cancel edit"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24 pt-1">
      <div className="px-1">
        <h2 className="font-['Chivo'] text-2xl font-black text-white">{season.name}</h2>
        <p className="mt-0.5 text-xs text-[#86948a]">
          {season.startedAt === 0 ? 'Since the beginning' : `Started ${formatDate(season.startedAt)}`} ·{' '}
          {currentMatches.length} {currentMatches.length === 1 ? 'match' : 'matches'}
        </p>
      </div>

      {error && <p className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-xs text-[#ffb4ab]">{error}</p>}

      {/* Closing a season is the one destructive action in the app, so it states
          exactly what it will do before it does it. */}
      <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-4">
        {confirmingEnd ? (
          <div className="space-y-3">
            <p className="font-['Chivo'] text-sm font-bold text-white">Close {season.name}?</p>
            <ul className="space-y-1 font-['Space_Grotesk'] text-xs text-[#bbcabf]">
              <li>• Final standings and titles are archived to the hall of fame.</li>
              <li>• Wins, losses, streaks and the crown reset to zero.</li>
              <li>
                • Ratings move halfway back to 1000 — a {players.length > 0 ? Math.max(...players.map((p) => p.elo)) : 1000} becomes{' '}
                {softResetElo(players.length > 0 ? Math.max(...players.map((p) => p.elo)) : 1000)}.
              </li>
              <li>• This season's matches become read-only.</li>
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={endSeason} disabled={isEnding} className="rounded-xl bg-[#ef4444] px-3 py-2.5 font-['Chivo'] text-xs font-bold text-white disabled:opacity-50">
                {isEnding ? 'Closing...' : 'Close the season'}
              </button>
              <button type="button" onClick={() => setConfirmingEnd(false)} disabled={isEnding} className="rounded-xl border border-[#30363d] px-3 py-2.5 font-['Chivo'] text-xs font-bold text-[#86948a]">
                Keep playing
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-['Chivo'] text-sm font-bold text-white">End the season</p>
              <p className="mt-0.5 font-['Space_Grotesk'] text-[11px] text-[#86948a]">
                Crowns a champion and starts everyone closer together.
              </p>
            </div>
            <button type="button" onClick={() => setConfirmingEnd(true)} className="shrink-0 rounded-xl border border-[#30363d] px-3 py-2 font-['Chivo'] text-xs font-bold text-[#ffb95f] hover:border-[#ffb95f]">
              End season
            </button>
          </div>
        )}
      </div>

      {pastSeasons.length > 0 && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 px-1 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#f59e0b]">
            <Medal className="h-3.5 w-3.5" />
            Hall of fame
          </span>
          {pastSeasons.map((entry) => {
            const champion = entry.standings[0] ?? null;
            return (
              <div key={entry.id} className="rounded-2xl border border-[#f59e0b]/30 bg-gradient-to-br from-[#241a07] to-[#161b22] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-['Chivo'] text-sm font-bold text-white">{entry.name}</h3>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#86948a]">
                    {formatDate(entry.startedAt)} – {formatDate(entry.endedAt!)}
                  </span>
                </div>

                {champion ? (
                  <p className="mt-2 flex items-center gap-2 font-['Chivo'] text-base font-black text-[#f59e0b]">
                    <Crown className="h-4 w-4 fill-[#f59e0b]" />
                    {champion.name}
                    <span className="font-['JetBrains_Mono'] text-xs font-bold text-[#86948a]">
                      {champion.elo} · {champion.wins}W-{champion.losses}L
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 font-['Space_Grotesk'] text-xs text-[#86948a]">No matches were played.</p>
                )}

                {entry.standings.length > 1 && (
                  <ol className="mt-2 space-y-0.5 border-t border-[#f59e0b]/20 pt-2">
                    {entry.standings.slice(1, 3).map((standing) => (
                      <li key={standing.playerId} className="flex justify-between font-['Space_Grotesk'] text-[11px] text-[#bbcabf]">
                        <span>{standing.rank}. {standing.name}</span>
                        <span className="font-['JetBrains_Mono'] text-[#86948a]">{standing.elo}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {entry.titles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#f59e0b]/20 pt-2">
                    {entry.titles.map((title) => (
                      <span key={title.key} className="inline-flex items-center gap-1 rounded-lg border border-[#3c4a42] bg-[#1c2026] px-2 py-1 font-['Space_Grotesk'] text-[10px] text-[#bbcabf]">
                        <span>{title.emoji}</span>
                        <span className="font-bold text-white">{title.label}</span>
                        <span className="text-[#86948a]">{title.holderName.split(' ')[0]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <span className="px-1 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
          This season
        </span>
        {currentMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-5 py-12 text-center">
            <p className="font-['Chivo'] text-sm font-bold text-white">No matches yet this season</p>
            <p className="mt-1 text-xs text-[#86948a]">Completed matches will appear here.</p>
          </div>
        ) : (
          currentMatches.map((match) => renderMatch(match, true))
        )}
      </div>

      {archivedMatches.length > 0 && (
        <div className="space-y-2">
          <span className="px-1 font-['JetBrains_Mono'] text-[11px] font-extrabold uppercase tracking-widest text-[#86948a]">
            Earlier seasons
          </span>
          {archivedMatches.map((match) => renderMatch(match, false))}
        </div>
      )}
    </div>
  );
};
