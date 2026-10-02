import React, { useState } from 'react';
import { Moon, Search, UserPlus, X } from 'lucide-react';
import { Player, MatchRecord, Season } from '../types';
import { LeagueInsights, DORMANT_AFTER_DAYS, describeTimeLeft, isFinalDay } from '../utils/league';
import { SeasonFinaleBanner } from './SeasonFinaleBanner';
import { buildSeasonFinale } from '../utils/finale';
import { CrownBanner } from './CrownBanner';
import { TitleBadges } from './TitleBadges';
import { PlayerAvatar } from './ui';
import { SHAME_STREAK, isShamed, shamed } from '../utils/shame';

interface LeaderboardViewProps {
  players: Player[];
  matches: MatchRecord[];
  league: LeagueInsights;
  season: Season;
  currentPlayer: Player | null;
  /** Ticks from the app clock so countdowns move without a re-render trigger. */
  now: number;
  leaderboardChanges: Record<string, 'reordered' | 'woke'>;
  onSelectPlayer: (player: Player) => void;
  onChallenge: (player: Player) => void;
  onAddPlayer: () => void;
  /** The kiosk has nobody to crown a challenger or show off titles to — just the ladder. */
  hideCrown?: boolean;
  hideTitles?: boolean;
  /** On the kiosk's much wider rows, a handful of tiny dots reads sparse — cap it down from the phone's 5. */
  formDotsLimit?: number;
}

/** Recent-form dots, green for a win and grey for a loss; on the yellow row, black filled or hollow. */
const FormDots: React.FC<{ form: ('W' | 'L')[]; onYellow?: boolean; limit?: number }> = ({ form, onYellow, limit = 5 }) => {
  const recent = form.slice(0, limit).reverse();
  if (recent.length === 0) return null;
  return (
    <span className="flex gap-1" role="img" aria-label={`Form ${recent.join(' ')}`}>
      {recent.map((result, index) => (
        <i
          key={index}
          className={`block h-2 w-2 rounded-full ${
            onYellow
              ? result === 'W' ? 'bg-bg' : 'shadow-[inset_0_0_0_1.5px_#0A0A0A]'
              : result === 'W' ? 'bg-felt' : 'bg-loss'
          }`}
        />
      ))}
    </span>
  );
};

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  players,
  matches,
  league,
  season,
  currentPlayer,
  now,
  leaderboardChanges,
  onSelectPlayer,
  onChallenge,
  onAddPlayer,
  hideCrown = false,
  hideTitles = false,
  formDotsLimit = 5,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id));

  // Dormant players keep their rating but drop out of the live ladder, so the
  // ranking answers "who is good now" rather than "who played a lot in March".
  const active = sortedPlayers.filter((player) => !league.insights.get(player.id)?.isDormant);
  const dormant = sortedPlayers.filter((player) => league.insights.get(player.id)?.isDormant);

  const matchesQuery = (player: Player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (player.department ?? '').toLowerCase().includes(searchQuery.toLowerCase());

  const finale = buildSeasonFinale({
    players,
    crown: league.crown,
    endsAt: season.endsAt,
    now,
    viewerId: currentPlayer?.id ?? null,
  });

  const visibleActive = active.filter(matchesQuery);
  const visibleDormant = dormant.filter(matchesQuery);

  const renderRow = (player: Player, rank: number, isDormantRow: boolean, index: number) => {
    const insight = league.insights.get(player.id);
    const titles = league.titlesByPlayer.get(player.id) ?? [];
    const change = leaderboardChanges[player.id];
    const first = !isDormantRow && rank === 1;
    const isMe = currentPlayer?.id === player.id;
    const medal = !isDormantRow && rank >= 2 && rank <= 3 ? rank : 0;

    return (
      <button
        type="button"
        key={player.id}
        id={`player-row-${player.id}`}
        onClick={() => onSelectPlayer(player)}
        style={{ ['--j' as string]: Math.min(index, 12) }}
        className={`press grid min-h-[54px] w-full grid-cols-[22px_auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          first ? 'bg-crown text-bg' : 'bg-card hover:bg-[#161616]'
        } ${medal === 2 ? 'shadow-[inset_0_0_0_1.5px_#C9CCD1]' : ''} ${medal === 3 ? 'shadow-[inset_0_0_0_1.5px_#A8622C]' : ''} ${
          isMe && !first && !medal ? 'shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.26)]' : ''
        } ${change === 'woke' ? 'leaderboard-woke' : change === 'reordered' ? 'leaderboard-reordered' : ''}`}
      >
        {isDormantRow ? (
          <Moon className="h-[15px] w-[15px] justify-self-center text-white/55" aria-label="Dormant" />
        ) : rank <= 3 ? (
          <span
            aria-label={`Rank ${rank}`}
            className={`grid h-[22px] w-[22px] place-items-center rounded-full text-xs font-black tabular-nums ${
              rank === 1 ? 'bg-bg text-crown' : rank === 2 ? 'bg-silver text-bg' : 'bg-bronze text-white'
            }`}
          >
            {rank}
          </span>
        ) : (
          <span className="text-center text-[13px] font-black tabular-nums text-white/55">{rank}</span>
        )}

        <PlayerAvatar player={player} size={34} />

        <span className="grid min-w-0 gap-[5px]">
          <span className={`flex min-w-0 items-center gap-1.5 text-sm font-bold leading-tight ${isDormantRow ? 'text-white/55' : ''}`}>
            <span className="truncate">{first ? '👑 ' : ''}{shamed(player.name, player)}</span>
            {isMe && (
              <span className={`flex-none rounded-md px-1.5 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.1em] ${first ? 'bg-bg text-white' : 'bg-white text-bg'}`}>
                You
              </span>
            )}
            {!hideTitles && <TitleBadges titles={titles} />}
          </span>
          {isDormantRow ? (
            <span className="text-xs font-semibold text-white/55">
              {insight?.daysSincePlayed === null || insight?.daysSincePlayed === undefined
                ? 'No matches yet'
                : `Last played ${insight.daysSincePlayed} days ago`}
            </span>
          ) : (
            <FormDots form={player.recentForm} onYellow={first} limit={formDotsLimit} />
          )}
        </span>

        <span className={`text-[17px] font-black tabular-nums ${isDormantRow ? 'text-white/55' : ''}`}>{player.elo}</span>
      </button>
    );
  };

  const finalDay = season.endsAt ? isFinalDay(season.endsAt, now) : false;

  return (
    <div id="leaderboard-view" className="stagger grid gap-3 pb-28 pt-1">
      {!hideCrown && <CrownBanner crown={league.crown} players={players} currentPlayer={currentPlayer} onChallenge={onChallenge} />}

      {finale && <SeasonFinaleBanner finale={finale} />}

      <section className="mt-2 grid gap-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-base">Ladder</h3>
          <span className="flex items-center gap-2 text-xs font-semibold text-white/55">
            {season.name}
            {season.endsAt &&
              (finalDay ? (
                <span className="rounded-full bg-crown px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-bg">Final day</span>
              ) : (
                <span>Ends in {describeTimeLeft(season.endsAt, now)}</span>
              ))}
          </span>
        </div>

        {players.length > 8 && (
          <label className="relative block">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find a player"
              aria-label="Find a player"
              className="h-11 w-full rounded-full bg-surface pl-10 pr-10 text-white outline-none placeholder:text-white/55 focus-visible:shadow-[inset_0_0_0_2px_#fff]"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/55">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        )}

        <div className="stagger-rows grid gap-0.5">
          {visibleActive.map((player, index) => renderRow(player, active.indexOf(player) + 1, false, index))}
        </div>

        {visibleActive.length === 0 && visibleDormant.length === 0 && (
          <div className="grid justify-items-center gap-2.5 rounded-2xl bg-card px-4 py-7 text-center">
            <h3 className="text-lg">{searchQuery ? 'Nobody by that name' : 'Empty ladder'}</h3>
            <p className="text-sm text-white/70">{searchQuery ? `No one matches "${searchQuery}".` : `${matches.length === 0 ? 'Play a match to get on it.' : ''}`}</p>
          </div>
        )}
      </section>

      {sortedPlayers.some(isShamed) && (
        <section className="mt-2 grid gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base">Wall of shame</h3>
            <span className="text-xs font-semibold text-white/55">One win takes it off</span>
          </div>
          <div className="grid gap-0.5">
            {sortedPlayers.filter(isShamed).map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => onSelectPlayer(player)}
                className="press card-drop grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left hover:bg-[#161616]"
              >
                <span className="relative">
                  <PlayerAvatar player={player} size={34} />
                  <span aria-hidden="true" className="duck-waddle absolute -right-2 -top-2 text-lg leading-none">🤡</span>
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-bold">{player.name}</span>
                  <span className="text-xs font-semibold text-white/55">{-player.currentStreak} losses in a row</span>
                </span>
                <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] tabular-nums">L{-player.currentStreak}</span>
              </button>
            ))}
          </div>
          <p className="px-1 text-xs font-semibold text-white/55">{SHAME_STREAK} losses in a row puts you here. The clown follows your name everywhere until you win.</p>
        </section>
      )}

      {!hideTitles && league.titles.length > 0 && (
        <section className="mt-2 grid gap-2">
          <h3 className="px-1 text-base">Titles</h3>
          <TitleBadges titles={league.titles} variant="card" />
        </section>
      )}

      {visibleDormant.length > 0 && (
        <section className="mt-2 grid gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base">Dormant</h3>
            <span className="text-xs font-semibold text-white/55">{DORMANT_AFTER_DAYS}+ days away</span>
          </div>
          <div className="stagger-rows grid gap-0.5">
            {visibleDormant.map((player, index) => renderRow(player, 0, true, index))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onAddPlayer}
        className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-alt text-[13px] font-extrabold uppercase tracking-[0.06em] text-white hover:bg-[#2C2C2C]"
      >
        <UserPlus className="h-[18px] w-[18px]" strokeWidth={2.25} />
        Enrol a player
      </button>
    </div>
  );
};
