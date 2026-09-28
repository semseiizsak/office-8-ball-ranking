import React, { useState } from 'react';
import { Check, Flag, Lock, Pencil, Trash2, X } from 'lucide-react';
import { MatchComment, MatchRecord, Player, Season } from '../types';
import { describeTimeLeft, isFinalDay, matchesInSeason, softResetElo } from '../utils/league';
import { CommentsThread, CommentsToggle, ReactionBar } from './MatchSocial';
import { Ball, PlayerAvatar } from './ui';

interface EventsViewProps {
  matches: MatchRecord[];
  players: Player[];
  season: Season;
  seasons: Season[];
  currentPlayer: Player;
  onEditWinner: (matchId: string, winnerId: string) => Promise<void>;
  onDelete: (matchId: string) => Promise<void>;
  onEndSeason: () => Promise<void>;
  onReact: (matchId: string, emoji: string | null) => Promise<void>;
  onOpenComments: (matchId: string, onChange: (comments: MatchComment[]) => void) => () => void;
  onSubmitComment: (
    matchId: string,
    params: { text: string; imageDataUrl?: string | null }
  ) => Promise<void>;
  onDeleteComment: (matchId: string, commentId: string) => Promise<void>;
  onScheduleSeasonEnd: (endsAt: number | null) => Promise<void>;
  now: number;
}

const formatDate = (value: number) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const EventsView: React.FC<EventsViewProps> = ({
  matches,
  players,
  season,
  seasons,
  currentPlayer,
  onEditWinner,
  onDelete,
  onEndSeason,
  onScheduleSeasonEnd,
  now,
  onReact,
  onOpenComments,
  onSubmitComment,
  onDeleteComment,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  // datetime-local wants local wall-clock time without a zone suffix.
  const toLocalInput = (value: number): string => {
    const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
    return date.toISOString().slice(0, 16);
  };

  const saveDeadline = async () => {
    if (!deadlineDraft) return;
    const endsAt = new Date(deadlineDraft).getTime();
    if (Number.isNaN(endsAt) || endsAt <= now) {
      setError('Pick a date and time in the future.');
      return;
    }
    try {
      setIsScheduling(true);
      setError('');
      await onScheduleSeasonEnd(endsAt);
      setDeadlineDraft('');
    } catch {
      setError('Could not schedule the season end.');
    } finally {
      setIsScheduling(false);
    }
  };

  const clearDeadline = async () => {
    try {
      setIsScheduling(true);
      await onScheduleSeasonEnd(null);
    } catch {
      setError('Could not clear the season end.');
    } finally {
      setIsScheduling(false);
    }
  };
  const [isEnding, setIsEnding] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const toggleComments = (matchId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

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

  const byId = new Map(players.map((player) => [player.id, player]));
  const [limit, setLimit] = useState(20);

  const renderMatch = (match: MatchRecord, editable: boolean) => {
    const winnerIsA = match.winnerId === match.playerAId;
    const winnerName = winnerIsA ? match.playerAName : match.playerBName;
    const loserName = winnerIsA ? match.playerBName : match.playerAName;
    const winner = byId.get(match.winnerId) ?? { id: match.winnerId, name: winnerName, avatarUrl: '' };
    const loser = byId.get(match.loserId) ?? { id: match.loserId, name: loserName, avatarUrl: '' };
    const gain = match.eloDelta + match.bountyCollected;
    const isEditing = editingId === match.id;
    const isBusy = busyId === match.id;
    const extras = [
      match.isUpset && '😱 Upset',
      match.modifiers.tableRun && '🏃 Ran the table',
      match.modifiers.eightOnBreak && '💥 8 on the break',
      match.modifiers.scratchOnEight && '❌ Scratched the 8',
    ].filter(Boolean) as string[];

    return (
      <div key={match.id} className="card-drop grid gap-3 rounded-2xl bg-card p-3.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="grid min-w-0 justify-items-center gap-1.5 text-center">
            <PlayerAvatar player={winner} size={44} />
            <span className="max-w-full truncate text-[13px] font-bold">{winnerName.split(' ')[0]}</span>
            <span className="flex items-center gap-1">
              <span className="rounded-full bg-felt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">W</span>
              {match.winnerBall && <Ball n={match.winnerBall === 'solids' ? 1 : 9} size={20} />}
            </span>
          </div>
          <div className="text-center font-display text-[38px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
            +{gain}
            {match.bountyCollected > 0 && (
              <small className="mt-1.5 block font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-crown">👑 {match.bountyCollected} bounty</small>
            )}
          </div>
          <div className="grid min-w-0 justify-items-center gap-1.5 text-center">
            <PlayerAvatar player={loser} size={44} />
            <span className="max-w-full truncate text-[13px] font-bold text-white/55">{loserName.split(' ')[0]}</span>
            <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">L</span>
          </div>
        </div>

        {extras.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {extras.map((label) => (
              <span key={label} className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-bold">{label}</span>
            ))}
          </div>
        )}

        {isEditing && (
          <div className="flex items-center gap-2 border-t border-white/10 pt-3">
            <select
              value={winnerId}
              onChange={(event) => setWinnerId(event.target.value)}
              aria-label="Winner"
              className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-white outline-none"
            >
              {[match.playerAId, match.playerBId].map((playerId) => (
                <option key={playerId} value={playerId}>
                  {byId.get(playerId)?.name ?? (playerId === match.playerAId ? match.playerAName : match.playerBName)} won
                </option>
              ))}
            </select>
            <button type="button" onClick={() => saveEdit(match)} disabled={isBusy} aria-label="Save" className="press grid h-11 w-11 place-items-center rounded-full bg-white text-bg"><Check className="h-5 w-5" /></button>
            <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel" className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt"><X className="h-5 w-5" /></button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <ReactionBar
            reactions={match.reactions ?? {}}
            myReaction={match.reactions?.[currentPlayer.id]}
            onReact={(emoji) => void onReact(match.id, match.reactions?.[currentPlayer.id] === emoji ? null : emoji)}
          />
        </div>
        <div className="-mt-1 flex items-center justify-between gap-2">
          <CommentsToggle count={match.commentCount ?? 0} open={expandedComments.has(match.id)} onToggle={() => toggleComments(match.id)} />
          <span className="flex items-center gap-1">
            <span className="mr-1 text-xs font-semibold text-white/55">{new Date(match.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            {editable ? (
              <>
                <button type="button" onClick={() => beginEdit(match)} disabled={isBusy} aria-label="Edit result" className="press grid h-9 w-9 place-items-center rounded-full text-white/55 hover:bg-surface-alt hover:text-white disabled:opacity-40">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(match)} disabled={isBusy} aria-label="Delete result" className="press grid h-9 w-9 place-items-center rounded-full text-white/55 hover:bg-surface-alt hover:text-white disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-white/55" title="Closed seasons are a record and cannot be edited">
                <Lock className="h-3.5 w-3.5" />
                Read only
              </span>
            )}
          </span>
        </div>

        {expandedComments.has(match.id) && (
          <CommentsThread
            matchId={match.id}
            currentPlayer={currentPlayer}
            players={players}
            onOpen={onOpenComments}
            onSubmit={(params) => onSubmitComment(match.id, params)}
            onDelete={(commentId) => onDeleteComment(match.id, commentId)}
          />
        )}
      </div>
    );
  };

  const button = 'press h-12 rounded-full px-5 text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50';

  return (
    <div className="stagger grid gap-3 pb-28 pt-1">
      <div className="flex items-center justify-between px-1">
        <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">{season.name}</span>
        <span className="text-xs font-semibold text-white/55">
          {season.startedAt === 0 ? 'Since the beginning' : `Started ${formatDate(season.startedAt)}`}. {currentMatches.length} {currentMatches.length === 1 ? 'match' : 'matches'}
        </span>
      </div>

      {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold">{error}</p>}

      <section className="grid gap-2">
        {currentMatches.length === 0 ? (
          <div className="grid justify-items-center gap-2.5 rounded-2xl bg-card px-4 py-7 text-center">
            <Ball n={7} size={64} className="mb-1" />
            <h3 className="text-lg">Clean slate</h3>
            <p className="text-sm text-white/70">{season.name} just started. Somebody has to make history.</p>
          </div>
        ) : (
          <>
            {currentMatches.slice(0, limit).map((match) => renderMatch(match, true))}
            {currentMatches.length > limit && (
              <button type="button" onClick={() => setLimit((value) => value + 20)} className={`${button} bg-surface-alt`}>
                Show {Math.min(20, currentMatches.length - limit)} more
              </button>
            )}
          </>
        )}
      </section>

      {pastSeasons.length > 0 && (
        <section className="mt-2 grid gap-2">
          <h3 className="px-1 text-base">Hall of fame</h3>
          {pastSeasons.map((entry) => (
            <div key={entry.id} className="grid gap-3 rounded-2xl bg-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base">{entry.name}</h3>
                <span className="text-xs font-semibold text-white/55">{formatDate(entry.startedAt)}{entry.endedAt ? `  ${formatDate(entry.endedAt)}` : ''}</span>
              </div>
              {entry.standings.length === 0 ? (
                <p className="text-sm text-white/55">No matches were played.</p>
              ) : (
                <div className="grid gap-0.5">
                  {entry.standings.slice(0, 3).map((standing, index) => (
                    <div
                      key={standing.playerId}
                      className={`grid grid-cols-[22px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 ${index === 0 ? 'bg-crown text-bg' : 'bg-surface'}`}
                    >
                      <span className="text-[13px] font-black tabular-nums">{standing.rank}</span>
                      <span className="truncate text-sm font-bold">{index === 0 ? '🏆 ' : ''}{standing.name}</span>
                      <span className="text-[15px] font-black tabular-nums">{standing.elo}</span>
                    </div>
                  ))}
                </div>
              )}
              {entry.titles.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-white/70">
                  {entry.titles.map((title) => (
                    <span key={title.key}>{title.emoji} {title.holderName.split(' ')[0]}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {archivedMatches.length > 0 && (
        <section className="mt-2 grid gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base">Earlier seasons</h3>
            <span className="text-xs font-semibold text-white/55">Read only</span>
          </div>
          {archivedMatches.slice(0, 10).map((match) => renderMatch(match, false))}
        </section>
      )}

      {/* A deadline turns the season into a story with an ending everybody can see coming. */}
      <section className="mt-2 grid gap-3 rounded-2xl bg-card p-3.5">
        <h3 className="text-base">Season end</h3>
        <p className="text-sm text-white/70">
          {season.endsAt
            ? isFinalDay(season.endsAt, now)
              ? `Final day. ${describeTimeLeft(season.endsAt, now)} left, then it closes itself.`
              : `Closes itself in ${describeTimeLeft(season.endsAt, now)}: ${new Date(season.endsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Standings get archived, a champion is crowned, the next season opens.`
            : 'No end date. Pick one and it closes itself, crowns a champion and starts the next one.'}
        </p>
        <label className="grid gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">End date and time</span>
          <input
            type="datetime-local"
            value={deadlineDraft || (season.endsAt ? toLocalInput(season.endsAt) : '')}
            min={toLocalInput(now)}
            onChange={(event) => setDeadlineDraft(event.target.value)}
            className="h-12 rounded-xl bg-surface px-4 text-white outline-none [color-scheme:dark] focus-visible:shadow-[inset_0_0_0_2px_#fff]"
          />
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={saveDeadline} disabled={isScheduling || !deadlineDraft} className={`${button} bg-white text-bg`}>
            {isScheduling ? 'Saving' : season.endsAt ? 'Change end' : 'Set end'}
          </button>
          {season.endsAt && (
            <button type="button" onClick={clearDeadline} disabled={isScheduling} className={`${button} bg-surface-alt`}>
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Closing a season is the one destructive action in the app, so it states
          exactly what it will do before it does it. */}
      {confirmingEnd ? (
        <section className="grid gap-3 rounded-2xl bg-card p-3.5 shadow-[inset_0_0_0_1.5px_#fff]">
          <h3 className="text-base">Close {season.name}?</h3>
          <div className="grid gap-1.5 text-sm text-white/70">
            <p>Final standings and titles go to the hall of fame.</p>
            <p>Wins, losses, streaks and the crown reset.</p>
            <p>
              Ratings move halfway back to 1000: a {players.length > 0 ? Math.max(...players.map((p) => p.elo)) : 1000} becomes{' '}
              {softResetElo(players.length > 0 ? Math.max(...players.map((p) => p.elo)) : 1000)}.
            </p>
            <p>This season's matches become read only.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmingEnd(false)} disabled={isEnding} className={`${button} bg-surface-alt`}>
              Keep playing
            </button>
            <button type="button" onClick={endSeason} disabled={isEnding} className={`${button} bg-white text-bg`}>
              {isEnding ? 'Closing' : 'Close it'}
            </button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setConfirmingEnd(true)} className={`${button} flex items-center justify-center gap-2 bg-surface-alt`}>
          <Flag className="h-[18px] w-[18px]" strokeWidth={2.25} />
          Close {season.name} now
        </button>
      )}
    </div>
  );
};
