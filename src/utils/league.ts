import { Challenge, MatchRecord, Player, Season } from '../types';
import { calculateMatchElo } from './elo';

export const DAY_MS = 86_400_000;

/** Rating the crown accrues for each full day it goes undefended. */
export const BOUNTY_PER_DAY = 3;
/** Ceiling on the bounty, so a long reign cannot hand out a career in one match. */
export const BOUNTY_CAP = 60;
/** A player with no match in this many days drops off the active ladder. */
export const DORMANT_AFTER_DAYS = 14;
/** How long a challenge stands before it lapses. */
export const CHALLENGE_EXPIRY_HOURS = 8;
/** Predictions needed before a player is eligible for the Oracle title. */
export const ORACLE_MIN_PREDICTIONS = 5;
/**
 * How much of a player's lead above the baseline carries into the next season.
 * A full wipe throws away everything anyone learned about the field; no reset
 * at all means season two is season one with a new label.
 */
export const SEASON_CARRYOVER = 0.5;
export const BASE_ELO = 1000;

/** Rating a player starts the next season on, given where they finished. */
export function softResetElo(finalElo: number): number {
  return Math.round(BASE_ELO + (finalElo - BASE_ELO) * SEASON_CARRYOVER);
}

/**
 * The season in force before anybody has ever closed one: everything logged so
 * far, counted as season one. Materialised here so no client has to race to
 * write a bootstrap document.
 */
export const IMPLICIT_SEASON: Season = {
  id: 'implicit-season-1',
  number: 1,
  name: 'Season 1',
  startedAt: 0,
  endedAt: null,
  startingElo: {},
  standings: [],
  titles: [],
};

/** Matches belonging to a season's window. */
export function matchesInSeason(matches: MatchRecord[], season: Season | null): MatchRecord[] {
  if (!season) return matches;
  return matches.filter(
    (match) =>
      match.timestamp >= season.startedAt &&
      (season.endedAt === null || match.timestamp < season.endedAt)
  );
}

/** Local midnight for a moment in time. */
const startOfDay = (value: number): number => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/**
 * Calendar days between two moments, counting midnights crossed rather than
 * elapsed hours. Rounded so the 23 and 25 hour days either side of a clock
 * change still count as one day.
 */
export function calendarDaysBetween(from: number, to: number): number {
  return Math.max(0, Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS));
}

/**
 * The bounty riding on the crown.
 *
 * Priced on mornings survived, not on a rolling 24 hours: the crown is worth
 * more every morning it is still undefended, which is something the office can
 * see coming. A rolling timer ticked over at whatever hour the crown happened
 * to change hands, so the board moved at a time nobody could predict and
 * looked stuck the morning after a win.
 *
 * It is still worth nothing on the day it is won, so taking the crown and
 * handing it straight back pays no one.
 */
export function bountyForReign(startedAt: number, now: number): number {
  return Math.min(BOUNTY_CAP, calendarDaysBetween(startedAt, now) * BOUNTY_PER_DAY);
}

/** Per-player state carried through a replay of the whole match history. */
interface MemberState {
  id: string;
  elo: number;
  peakElo: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestWinStreak: number;
  breakAndRuns: number;
  recentForm: ('W' | 'L')[];
  lastPlayedAt: number | null;
  /** Matches played so far without the player's rank getting worse. */
  rankDefence: number;
  bestRankDefence: number;
  winsVsHigherRated: number;
  lossesVsLowerRated: number;
  bountyCollected: number;
  matchesPlayed: number;
}

export interface CrownReign {
  playerId: string;
  startedAt: number;
  endedAt: number | null;
  /** Matches the holder played while wearing the crown. */
  defences: number;
}

export interface LeagueReplay {
  members: Map<string, MemberState>;
  reigns: CrownReign[];
  /** Match snapshots rewritten to agree with the replayed ratings. */
  matches: MatchRecord[];
}

const createMember = (id: string, startingElo: number): MemberState => ({
  id,
  elo: startingElo,
  peakElo: startingElo,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  bestWinStreak: 0,
  breakAndRuns: 0,
  recentForm: [],
  lastPlayedAt: null,
  rankDefence: 0,
  bestRankDefence: 0,
  winsVsHigherRated: 0,
  lossesVsLowerRated: 0,
  bountyCollected: 0,
  matchesPlayed: 0,
});

/** Ranks every member who has played at least once, best rating first. */
const rankMap = (members: Map<string, MemberState>): Map<string, number> => {
  const ranked = [...members.values()]
    .filter((member) => member.matchesPlayed > 0)
    .sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id));
  return new Map(ranked.map((member, index) => [member.id, index + 1]));
};

/**
 * Replays a season's matches from the ratings players carried into it.
 *
 * This is the single source of truth for what a match does: live logging and
 * the post-edit rebuild both run through it, so a corrected result can never
 * drift from a freshly logged one. Everything downstream — the crown, its
 * bounty, and every title — falls out of win/loss and timestamps alone, which
 * is why none of it asks anyone to log extra detail at the table.
 */
export function runLeagueReplay(
  playerIds: string[],
  matchRecords: MatchRecord[],
  startingElo: Record<string, number> = {}
): LeagueReplay {
  const members = new Map(
    playerIds.map((id) => [id, createMember(id, startingElo[id] ?? BASE_ELO)])
  );
  const reigns: CrownReign[] = [];
  let crownHolderId: string | null = null;

  const ordered = [...matchRecords].sort((left, right) => left.timestamp - right.timestamp);

  const matches = ordered.map((match) => {
    const winnerId = match.winnerId;
    const loserId = match.winnerId === match.playerAId ? match.playerBId : match.playerAId;
    const winner = members.get(winnerId);
    const loser = members.get(loserId);
    // A match referencing a deleted player is left untouched rather than dropped,
    // so history stays readable even after someone leaves the office.
    if (!winner || !loser) return match;

    const ranksBefore = rankMap(members);
    const winnerEloBefore = winner.elo;
    const loserEloBefore = loser.elo;
    const winnerIsA = winnerId === match.playerAId;

    const elo = calculateMatchElo(
      winnerIsA ? winnerEloBefore : loserEloBefore,
      winnerIsA ? loserEloBefore : winnerEloBefore,
      winnerIsA ? 'A' : 'B'
    );
    const gained = Math.abs(winnerIsA ? elo.deltaA : elo.deltaB);

    // The crown only pays out when someone other than the holder takes it down.
    const openReign = reigns.length > 0 ? reigns[reigns.length - 1] : null;
    const bounty =
      crownHolderId === loserId && openReign && openReign.endedAt === null
        ? bountyForReign(openReign.startedAt, match.timestamp)
        : 0;

    winner.elo = winnerEloBefore + gained + bounty;
    loser.elo = Math.max(100, loserEloBefore - gained - bounty);
    winner.bountyCollected += bounty;

    winner.peakElo = Math.max(winner.peakElo, winner.elo);
    loser.peakElo = Math.max(loser.peakElo, loser.elo);
    winner.wins += 1;
    loser.losses += 1;
    winner.currentStreak = winner.currentStreak > 0 ? winner.currentStreak + 1 : 1;
    loser.currentStreak = loser.currentStreak < 0 ? loser.currentStreak - 1 : -1;
    winner.bestWinStreak = Math.max(winner.bestWinStreak, winner.currentStreak);
    winner.breakAndRuns += match.modifiers.eightOnBreak ? 1 : 0;
    winner.recentForm = ['W', ...winner.recentForm.slice(0, 4)];
    loser.recentForm = ['L', ...loser.recentForm.slice(0, 4)];
    winner.lastPlayedAt = match.timestamp;
    loser.lastPlayedAt = match.timestamp;
    winner.matchesPlayed += 1;
    loser.matchesPlayed += 1;

    if (winnerEloBefore < loserEloBefore) winner.winsVsHigherRated += 1;
    if (loserEloBefore > winnerEloBefore) loser.lossesVsLowerRated += 1;

    // Rank defence: a player extends their run by playing a match that does not
    // cost them ground. Sitting on a rank without playing extends nothing.
    const ranksAfter = rankMap(members);
    for (const member of [winner, loser]) {
      const before = ranksBefore.get(member.id);
      const after = ranksAfter.get(member.id);
      if (before === undefined || after === undefined) {
        member.rankDefence = 0;
      } else {
        member.rankDefence = after <= before ? member.rankDefence + 1 : 0;
      }
      member.bestRankDefence = Math.max(member.bestRankDefence, member.rankDefence);
    }

    // A reign ends when the crown moves, and also whenever the bounty is paid
    // out: the pot is claimed once, then starts accruing again. Without this a
    // holder with a big enough lead to survive a loss keeps a maxed-out bounty
    // that the same opponent can collect over and over.
    const leaderId = [...ranksAfter.entries()].find(([, rank]) => rank === 1)?.[0] ?? null;
    if (leaderId !== crownHolderId || bounty > 0) {
      if (openReign && openReign.endedAt === null) openReign.endedAt = match.timestamp;
      if (leaderId) reigns.push({ playerId: leaderId, startedAt: match.timestamp, endedAt: null, defences: 0 });
      crownHolderId = leaderId;
    } else if (openReign && openReign.endedAt === null && openReign.playerId === winnerId) {
      openReign.defences += 1;
    }

    return {
      ...match,
      loserId,
      playerAName: match.playerAName,
      playerBName: match.playerBName,
      playerAEloBefore: winnerIsA ? winnerEloBefore : loserEloBefore,
      playerAEloAfter: winnerIsA ? winner.elo : loser.elo,
      playerBEloBefore: winnerIsA ? loserEloBefore : winnerEloBefore,
      playerBEloAfter: winnerIsA ? loser.elo : winner.elo,
      eloDelta: gained,
      bountyCollected: bounty,
      isUpset: elo.isUpset,
    };
  });

  return { members, reigns, matches };
}

export interface CrownState {
  holderId: string | null;
  heldSince: number | null;
  heldDays: number;
  bounty: number;
  defences: number;
  /** Days since the holder last played anyone, which is what grows the bounty. */
  idleDays: number | null;
}

export interface LeagueTitle {
  key: string;
  label: string;
  emoji: string;
  /** Exactly what the number measures, so nothing here reads as invented. */
  blurb: string;
  holderId: string;
  holderName: string;
  value: number;
  valueLabel: string;
}

export interface PlayerInsight {
  rankDefence: number;
  bestRankDefence: number;
  winsVsHigherRated: number;
  lossesVsLowerRated: number;
  bountyCollected: number;
  matchesLast7Days: number;
  isDormant: boolean;
  daysSincePlayed: number | null;
}

export interface LeagueInsights {
  crown: CrownState;
  titles: LeagueTitle[];
  titlesByPlayer: Map<string, LeagueTitle[]>;
  insights: Map<string, PlayerInsight>;
}

export const daysBetween = (from: number, to: number): number =>
  Math.max(0, Math.floor((to - from) / DAY_MS));

export const isDormant = (lastPlayedAt: number | null, now: number): boolean =>
  lastPlayedAt === null || daysBetween(lastPlayedAt, now) >= DORMANT_AFTER_DAYS;

const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/** Picks the highest scorer above a floor, tie-broken deterministically. */
function awardTitle(
  key: string,
  label: string,
  emoji: string,
  blurb: string,
  scores: Array<{ id: string; name: string; value: number; valueLabel: string }>,
  minimum: number
): LeagueTitle | null {
  const best = scores
    .filter((entry) => entry.value >= minimum)
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id))[0];
  if (!best) return null;
  return {
    key,
    label,
    emoji,
    blurb,
    holderId: best.id,
    holderName: best.name,
    value: best.value,
    valueLabel: best.valueLabel,
  };
}

/**
 * Derives the crown, the titles, and per-player colour from match history.
 *
 * Nothing here is stored and nothing here is invented: every number traces back
 * to a logged win, a loss, or a timestamp.
 */
export function deriveLeagueInsights(
  players: Player[],
  matches: MatchRecord[],
  challenges: Challenge[],
  now: number = Date.now(),
  startingElo: Record<string, number> = {}
): LeagueInsights {
  const replay = runLeagueReplay(players.map((player) => player.id), matches, startingElo);
  const byId = new Map(players.map((player) => [player.id, player]));
  const weekAgo = now - 7 * DAY_MS;

  const matchesLast7 = new Map<string, number>();
  for (const match of matches) {
    if (match.timestamp < weekAgo) continue;
    for (const id of [match.playerAId, match.playerBId]) {
      matchesLast7.set(id, (matchesLast7.get(id) ?? 0) + 1);
    }
  }

  const insights = new Map<string, PlayerInsight>();
  for (const player of players) {
    const member = replay.members.get(player.id);
    const lastPlayedAt = member?.lastPlayedAt ?? player.lastPlayedAt ?? null;
    insights.set(player.id, {
      rankDefence: member?.rankDefence ?? 0,
      bestRankDefence: member?.bestRankDefence ?? 0,
      winsVsHigherRated: member?.winsVsHigherRated ?? 0,
      lossesVsLowerRated: member?.lossesVsLowerRated ?? 0,
      bountyCollected: member?.bountyCollected ?? 0,
      matchesLast7Days: matchesLast7.get(player.id) ?? 0,
      isDormant: isDormant(lastPlayedAt, now),
      daysSincePlayed: lastPlayedAt === null ? null : daysBetween(lastPlayedAt, now),
    });
  }

  // The crown belongs to whoever tops the live standings; the open reign tells
  // us how long it has gone undefended, which is what the bounty is priced on.
  const ranked = [...players]
    .filter((player) => player.wins + player.losses > 0)
    .sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id));
  const holder = ranked[0] ?? null;
  const openReign = [...replay.reigns].reverse().find((reign) => reign.playerId === holder?.id && reign.endedAt === null) ?? null;
  const heldSince = openReign?.startedAt ?? null;
  const holderInsight = holder ? insights.get(holder.id) ?? null : null;

  const crown: CrownState = {
    holderId: holder?.id ?? null,
    heldSince,
    heldDays: heldSince === null ? 0 : calendarDaysBetween(heldSince, now),
    bounty: heldSince === null ? 0 : bountyForReign(heldSince, now),
    defences: openReign?.defences ?? 0,
    idleDays: holderInsight?.daysSincePlayed ?? null,
  };

  const declineCounts = new Map<string, number>();
  for (const challenge of challenges) {
    if (challenge.status !== 'declined' && challenge.status !== 'expired') continue;
    declineCounts.set(challenge.opponentId, (declineCounts.get(challenge.opponentId) ?? 0) + 1);
  }

  const score = (
    pick: (player: Player, insight: PlayerInsight) => { value: number; valueLabel: string }
  ) =>
    players.map((player) => {
      const picked = pick(player, insights.get(player.id)!);
      return { id: player.id, name: player.name, ...picked };
    });

  const titles = [
    awardTitle(
      'giant-killer',
      'Giant Killer',
      '🗡️',
      'Most wins over an opponent rated higher than them at the time.',
      score((_, insight) => ({
        value: insight.winsVsHigherRated,
        valueLabel: plural(insight.winsVsHigherRated, 'upset win', 'upset wins'),
      })),
      1
    ),
    awardTitle(
      'iron-man',
      'Iron Man',
      '⚙️',
      'Most matches played in the last seven days.',
      score((_, insight) => ({
        value: insight.matchesLast7Days,
        valueLabel: plural(insight.matchesLast7Days, 'match this week', 'matches this week'),
      })),
      2
    ),
    awardTitle(
      'the-wall',
      'The Wall',
      '🧱',
      'Longest run of matches played without their rank getting worse.',
      score((_, insight) => ({
        value: insight.bestRankDefence,
        valueLabel: plural(insight.bestRankDefence, 'match held', 'matches held'),
      })),
      3
    ),
    awardTitle(
      'kingslayer',
      'Kingslayer',
      '👑',
      'Most bounty rating taken off the crown.',
      score((_, insight) => ({
        value: insight.bountyCollected,
        valueLabel: `${insight.bountyCollected} claimed`,
      })),
      1
    ),
    awardTitle(
      'cursed',
      'Cursed',
      '💀',
      'Most losses to an opponent rated lower than them at the time.',
      score((_, insight) => ({
        value: insight.lossesVsLowerRated,
        valueLabel: plural(insight.lossesVsLowerRated, 'bad loss', 'bad losses'),
      })),
      1
    ),
    awardTitle(
      'the-duck',
      'The Duck',
      '🦆',
      'Most challenges declined or left to expire.',
      score((player) => {
        const value = declineCounts.get(player.id) ?? 0;
        return { value, valueLabel: `${value} ducked` };
      }),
      1
    ),
    awardTitle(
      'the-oracle',
      'The Oracle',
      '🔮',
      `Best prediction accuracy over at least ${ORACLE_MIN_PREDICTIONS} calls.`,
      score((player) => {
        const eligible = player.predictionsTotal >= ORACLE_MIN_PREDICTIONS;
        const accuracy = eligible
          ? Math.round((player.predictionsCorrect / player.predictionsTotal) * 100)
          : 0;
        return {
          value: accuracy,
          valueLabel: `${accuracy}% of ${player.predictionsTotal}`,
        };
      }),
      1
    ),
  ].filter((title): title is LeagueTitle => title !== null);

  const titlesByPlayer = new Map<string, LeagueTitle[]>();
  for (const title of titles) {
    titlesByPlayer.set(title.holderId, [...(titlesByPlayer.get(title.holderId) ?? []), title]);
  }

  return { crown, titles, titlesByPlayer, insights };
}

export interface Rivalry {
  opponentId: string;
  opponentName: string;
  meetings: number;
  wins: number;
  losses: number;
  /** Who is on the current unbroken run, and how long it is. */
  runHolderId: string | null;
  runLength: number;
  lastMeetingAt: number | null;
  /** Office series: first to ten meetings won takes it. */
  raceTarget: number;
  /** Truthful one-liners built only from the numbers above. */
  commentary: string[];
}

export const RIVALRY_RACE_TARGET = 10;

const relativeDays = (from: number, to: number): string => {
  const days = daysBetween(from, to);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

/**
 * The real head-to-head ledger between two players.
 *
 * Every line of commentary restates a number that came from a logged match.
 * Nothing is inferred about how anybody plays.
 */
export function computeRivalry(
  playerId: string,
  opponentId: string,
  players: Player[],
  matches: MatchRecord[],
  now: number = Date.now()
): Rivalry | null {
  const opponent = players.find((entry) => entry.id === opponentId);
  if (!opponent) return null;

  const meetings = matches
    .filter(
      (match) =>
        (match.playerAId === playerId && match.playerBId === opponentId) ||
        (match.playerAId === opponentId && match.playerBId === playerId)
    )
    .sort((left, right) => right.timestamp - left.timestamp);

  const wins = meetings.filter((match) => match.winnerId === playerId).length;
  const losses = meetings.length - wins;

  let runHolderId: string | null = null;
  let runLength = 0;
  for (const match of meetings) {
    if (runHolderId === null) {
      runHolderId = match.winnerId;
      runLength = 1;
    } else if (match.winnerId === runHolderId) {
      runLength += 1;
    } else {
      break;
    }
  }

  const player = players.find((entry) => entry.id === playerId);
  const myName = player?.name.split(' ')[0] ?? 'They';
  const theirName = opponent.name.split(' ')[0];
  const lastMeetingAt = meetings[0]?.timestamp ?? null;

  const commentary: string[] = [];
  if (meetings.length === 0) {
    commentary.push(`No history yet. The first meeting sets the ledger.`);
  } else {
    if (wins === losses) {
      commentary.push(`Dead level at ${wins}–${losses} across ${meetings.length} meetings.`);
    } else if (wins > losses) {
      commentary.push(`${myName} leads the ledger ${wins}–${losses}.`);
    } else {
      commentary.push(`${theirName} leads the ledger ${losses}–${wins}.`);
    }

    if (runLength >= 2 && runHolderId) {
      const runner = runHolderId === playerId ? myName : theirName;
      commentary.push(`${runner} has taken the last ${runLength}.`);
    }

    const leader = Math.max(wins, losses);
    if (leader >= RIVALRY_RACE_TARGET) {
      const champion = wins > losses ? myName : theirName;
      commentary.push(`${champion} has already taken the race to ${RIVALRY_RACE_TARGET}.`);
    } else {
      commentary.push(`Race to ${RIVALRY_RACE_TARGET}: ${wins}–${losses}.`);
    }

    if (lastMeetingAt !== null) {
      commentary.push(`Last played ${relativeDays(lastMeetingAt, now)}.`);
    }
  }

  return {
    opponentId,
    opponentName: opponent.name,
    meetings: meetings.length,
    wins,
    losses,
    runHolderId,
    runLength,
    lastMeetingAt,
    raceTarget: RIVALRY_RACE_TARGET,
    commentary,
  };
}

/**
 * The opponent a player has faced most. Ties go to whoever they played most
 * recently, so the headline rivalry is the one that is actually live.
 */
export function findTopRival(
  playerId: string,
  players: Player[],
  matches: MatchRecord[],
  now: number = Date.now()
): Rivalry | null {
  const tally = new Map<string, { meetings: number; lastAt: number }>();
  for (const match of matches) {
    const isMine = match.playerAId === playerId || match.playerBId === playerId;
    if (!isMine) continue;
    const opponentId = match.playerAId === playerId ? match.playerBId : match.playerAId;
    const current = tally.get(opponentId) ?? { meetings: 0, lastAt: 0 };
    tally.set(opponentId, {
      meetings: current.meetings + 1,
      lastAt: Math.max(current.lastAt, match.timestamp),
    });
  }

  const top = [...tally.entries()].sort(
    ([, left], [, right]) => right.meetings - left.meetings || right.lastAt - left.lastAt
  )[0];
  if (!top) return null;
  return computeRivalry(playerId, top[0], players, matches, now);
}
