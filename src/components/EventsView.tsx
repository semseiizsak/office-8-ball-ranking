import React, { useState } from 'react';
import { Flag, Settings } from 'lucide-react';
import { WeekAwards } from '../utils/awards';
import { MatchDetailProps, MatchDetailSheet } from './MatchDetailSheet';
import { MatchComment, MatchRecord, Player, Season } from '../types';
import { describeTimeLeft, isFinalDay, matchesInSeason, softResetElo } from '../utils/league';
import { withoutTemporarilyHiddenMatches } from '../utils/tempHideMatches';
import { Ball, PlayerAvatar, Sheet } from './ui';
import { shamed } from '../utils/shame';

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
  awards?: WeekAwards[];
  onOpenAwards?: (week: WeekAwards) => void;
  onOpenWrap?: (season: Season) => void;
  /** For the match detail sheet. */
  detail: Pick<MatchDetailProps, 'challenges' | 'payouts' | 'dailies' | 'tournaments' | 'subscribeChat' | 'subscribeCheers'>;
}

/** History keeps only the latest few on screen; every match stays in the data. */
const RECENT = 10;

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
  awards = [],
  onOpenAwards,
  onOpenWrap,
  detail,
  onReact,
  onOpenComments,
  onSubmitComment,
  onDeleteComment,
}) => {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  /** One section at a time, and the season settings behind the gear. */
  const [view, setView] = useState<'matches' | 'alltime' | 'awards' | 'fame'>('matches');
  const [showSettings, setShowSettings] = useState(false);
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

  const currentMatches = withoutTemporarilyHiddenMatches(matchesInSeason(matches, season));
  const detailMatch = detailId ? currentMatches.find((match) => match.id === detailId) ?? null : null;
  const pastSeasons = seasons.filter((entry) => entry.endedAt !== null);

  // All time: every season added together. The Elo starts at 1000 and takes
  // every rating change from every match, with no soft reset between seasons.
  const allSeasons = seasons.some((entry) => entry.id === season.id) ? seasons : [...seasons, season];
  const seasonOf = (match: MatchRecord) => allSeasons.find((entry) => matchesInSeason([match], entry).length > 0)?.id ?? season.id;
  const allTime = new Map<string, { id: string; name: string; elo: number; wins: number; losses: number; peak: number; seasons: Set<string> }>();
  [...matches]
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((match) => {
      const sides = [
        { id: match.playerAId, name: match.playerAName, before: match.playerAEloBefore, after: match.playerAEloAfter },
        { id: match.playerBId, name: match.playerBName, before: match.playerBEloBefore, after: match.playerBEloAfter },
      ];
      for (const side of sides) {
        const row = allTime.get(side.id) ?? { id: side.id, name: side.name, elo: 1000, wins: 0, losses: 0, peak: 1000, seasons: new Set<string>() };
        row.elo += side.after - side.before;
        row.peak = Math.max(row.peak, row.elo);
        if (match.winnerId === side.id) row.wins++;
        else row.losses++;
        row.seasons.add(seasonOf(match));
        allTime.set(side.id, row);
      }
    });
  const allTimeRows = [...allTime.values()].sort((a, b) => b.elo - a.elo || b.wins - a.wins);
  const [showAllTime, setShowAllTime] = useState(false);

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

  const renderMatch = (match: MatchRecord, index: number) => {
    const winnerIsA = match.winnerId === match.playerAId;
    const winnerName = winnerIsA ? match.playerAName : match.playerBName;
    const loserName = winnerIsA ? match.playerBName : match.playerAName;
    const winner = byId.get(match.winnerId) ?? { id: match.winnerId, name: winnerName, avatarUrl: '' };
    const loser = byId.get(match.loserId) ?? { id: match.loserId, name: loserName, avatarUrl: '' };
    const gain = match.eloDelta + match.bountyCollected;
    const extras = [
      match.isUpset && '😱',
      match.bountyCollected > 0 && '👑',
      match.modifiers.tableRun && '🏃',
      match.modifiers.eightOnBreak && '💥',
      match.modifiers.scratchOnEight && '❌',
    ].filter(Boolean) as string[];
    const reactions = Object.values(match.reactions ?? {}).length;

    return (
      <button
        key={match.id}
        type="button"
        onClick={() => setDetailId(match.id)}
        className="press lift card-drop grid gap-2.5 rounded-2xl bg-card p-3.5 text-left"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="grid min-w-0 justify-items-center gap-1.5 text-center">
            <PlayerAvatar player={winner} size={44} />
            <span className="max-w-full truncate text-[13px] font-bold">{shamed(winnerName.split(' ')[0], byId.get(match.winnerId))}</span>
            <span className="flex items-center gap-1">
              <span className="rounded-full bg-felt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">W</span>
              {match.winnerBall && <Ball n={match.winnerBall === 'solids' ? 1 : 9} size={20} />}
            </span>
          </div>
          <div className="text-center font-display text-[38px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">+{gain}</div>
          <div className="grid min-w-0 justify-items-center gap-1.5 text-center">
            <PlayerAvatar player={loser} size={44} />
            <span className="max-w-full truncate text-[13px] font-bold text-white/55">{shamed(loserName.split(' ')[0], byId.get(match.loserId))}</span>
            <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">L</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs font-semibold text-white/55">
          <span>
            {new Date(match.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, {new Date(match.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="flex items-center gap-2">
            {extras.length > 0 && <span className="text-sm">{extras.join(' ')}</span>}
            {reactions > 0 && <span>{reactions} reaction{reactions === 1 ? '' : 's'}</span>}
            {(match.commentCount ?? 0) > 0 && <span>{match.commentCount} comment{match.commentCount === 1 ? '' : 's'}</span>}
            <span className="font-extrabold uppercase tracking-[0.08em] text-white">Details ›</span>
          </span>
        </div>
      </button>
    );
  };

  const button = 'press h-12 rounded-full px-5 text-[13px] font-extrabold uppercase tracking-[0.06em] disabled:opacity-50';

  return (
    <div className="stagger grid gap-3 pb-28 pt-1">
      <div className="flex items-center justify-between px-1">
        <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em]">{season.name}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/55">
            {season.startedAt === 0 ? 'Since the beginning' : `Started ${formatDate(season.startedAt)}`}. {currentMatches.length} {currentMatches.length === 1 ? 'match' : 'matches'}
          </span>
          <button type="button" onClick={() => setShowSettings(true)} aria-label="Season settings" className="press grid h-10 w-10 flex-none place-items-center rounded-full bg-surface-alt">
            <Settings className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
        </span>
      </div>

      {(allTimeRows.length > 0 || awards.length > 0 || pastSeasons.length > 0) && (
        <div role="tablist" aria-label="History" className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-surface p-[3px]">
          {([
            ['matches', 'Matches', true],
            ['alltime', 'All time', allTimeRows.length > 0],
            ['awards', 'Awards', awards.length > 0],
            ['fame', 'Hall of fame', pastSeasons.length > 0],
          ] as const)
            .filter(([, , shown]) => shown)
            .map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={`press h-9 flex-1 whitespace-nowrap rounded-full px-3 text-xs font-extrabold uppercase tracking-[0.06em] transition-colors ${view === value ? 'bg-white text-bg' : 'text-white'}`}
              >
                {label}
              </button>
            ))}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-surface-alt p-3 text-sm font-semibold">{error}</p>}

      {view === 'matches' && <section className="grid gap-2">
        {currentMatches.length === 0 ? (
          <div className="grid justify-items-center gap-2.5 rounded-2xl bg-card px-4 py-7 text-center">
            <Ball n={7} size={64} className="mb-1" />
            <h3 className="text-lg">Clean slate</h3>
            <p className="text-sm text-white/70">{season.name} just started. Somebody has to make history.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <h3 className="text-base">Last {Math.min(RECENT, currentMatches.length)} matches</h3>
              <span className="text-xs font-semibold text-white/55">Tap one for everything</span>
            </div>
            {currentMatches.slice(0, RECENT).map((match, index) => renderMatch(match, index))}
          </>
        )}
      </section>}

      {view === 'alltime' && allTimeRows.length > 0 && (
        <section className="mt-2 grid gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base">All time</h3>
            <span className="text-xs font-semibold text-white/55">
              {allSeasons.length} {allSeasons.length === 1 ? 'season' : 'seasons'} added up
            </span>
          </div>
          <div className="stagger-rows grid gap-0.5">
            {(showAllTime ? allTimeRows : allTimeRows.slice(0, 5)).map((row, index) => {
              const games = row.wins + row.losses;
              const medal = index < 3;
              return (
                <div
                  key={row.id}
                  style={{ ['--j' as string]: Math.min(index, 12) }}
                  className={`grid min-h-[54px] grid-cols-[22px_auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 ${index === 0 ? 'bg-crown text-bg' : 'bg-card'} ${
                    index === 1 ? 'shadow-[inset_0_0_0_1.5px_#C9CCD1]' : index === 2 ? 'shadow-[inset_0_0_0_1.5px_#A8622C]' : ''
                  } ${row.id === currentPlayer.id && index > 2 ? 'shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.26)]' : ''}`}
                >
                  {medal ? (
                    <span className={`grid h-[22px] w-[22px] place-items-center rounded-full text-xs font-black tabular-nums ${index === 0 ? 'bg-bg text-crown' : index === 1 ? 'bg-silver text-bg' : 'bg-bronze text-white'}`}>
                      {index + 1}
                    </span>
                  ) : (
                    <span className="text-center text-[13px] font-black tabular-nums text-white/55">{index + 1}</span>
                  )}
                  <PlayerAvatar player={byId.get(row.id) ?? { id: row.id, name: row.name, avatarUrl: '' }} size={34} />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm font-bold">{index === 0 ? '👑 ' : ''}{byId.get(row.id)?.name ?? row.name}</span>
                    <span className={`text-xs font-semibold ${index === 0 ? 'text-bg' : 'text-white/55'}`}>
                      {row.wins}W {row.losses}L, {games ? Math.round((row.wins / games) * 100) : 0}%, {row.seasons.size} {row.seasons.size === 1 ? 'season' : 'seasons'}
                    </span>
                  </span>
                  <span className="grid justify-items-end">
                    <span className="text-[17px] font-black tabular-nums">{row.elo}</span>
                    <span className={`text-[10px] font-extrabold uppercase tracking-[0.1em] ${index === 0 ? 'text-bg' : 'text-white/55'}`}>Peak {row.peak}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {allTimeRows.length > 5 && (
            <button type="button" onClick={() => setShowAllTime((value) => !value)} className={`${button} bg-surface-alt`}>
              {showAllTime ? 'Show top 5' : `Show all ${allTimeRows.length}`}
            </button>
          )}
          <p className="px-1 text-xs font-semibold text-white/55">Starts everyone on 1000 and adds every rating change from every season, with no reset in between.</p>
        </section>
      )}

      {view === 'awards' && awards.length > 0 && (
        <section className="mt-2 grid gap-2">
          <h3 className="px-1 text-base">Weekly awards</h3>
          {awards.slice(0, 8).map((week) => (
            <button
              key={week.week}
              type="button"
              onClick={() => onOpenAwards?.(week)}
              className="press lift flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left"
            >
              <span className="grid min-w-0 gap-0.5">
                <b className="text-sm">Week of {new Date(week.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</b>
                <span className="truncate text-xs font-semibold text-white/55">
                  {week.matches} {week.matches === 1 ? 'match' : 'matches'}, {week.awards.length} awards
                </span>
              </span>
              <span className="flex flex-none items-center gap-1 text-lg" aria-hidden>
                {week.awards.slice(0, 4).map((award) => (
                  <span key={award.key}>{award.e}</span>
                ))}
                <span className="pl-1 text-white/55">›</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {view === 'fame' && pastSeasons.length > 0 && (
        <section className="mt-2 grid gap-2">
          <h3 className="px-1 text-base">Hall of fame</h3>
          {pastSeasons.map((entry) => (
            <div key={entry.id} className="grid gap-3 rounded-2xl bg-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base">{entry.name}</h3>
                {onOpenWrap && (
                  <button type="button" onClick={() => onOpenWrap(entry)} className="press ml-auto mr-2 h-8 rounded-full bg-white px-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-bg">
                    Wrap
                  </button>
                )}
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


      {showSettings && (
        <Sheet title={`${season.name} settings`} onClose={() => setShowSettings(false)}>
          <div className="grid gap-3 pb-2">
      {/* A deadline turns the season into a story with an ending everybody can see coming. */}
      <section className="grid gap-3 rounded-2xl bg-card p-3.5">
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
        </Sheet>
      )}

      {detailMatch && (
        <MatchDetailSheet
          match={detailMatch}
          players={players}
          allMatches={matches}
          seasonMatches={currentMatches}
          startingElo={season.startingElo}
          currentPlayer={currentPlayer}
          editable
          onEditWinner={onEditWinner}
          onDelete={onDelete}
          onReact={onReact}
          onOpenComments={onOpenComments}
          onSubmitComment={onSubmitComment}
          onDeleteComment={onDeleteComment}
          onClose={() => setDetailId(null)}
          {...detail}
        />
      )}
    </div>
  );
};
