import { Challenge, MatchRecord, Player } from '../types';
import { LeagueInsights, LeagueTitle, Rivalry, computeRivalry } from './league';

export interface RankMove {
  /** Null when the player had no rank yet — their first ever match. */
  before: number | null;
  after: number;
  /** First names of the people this player moved past. */
  passed: string[];
  /** First names of the people who moved past this player. */
  passedBy: string[];
}

export interface RecapSide {
  id: string;
  name: string;
  rank: RankMove;
  streak: number;
  /** The streak they walked in with, so a broken run can be named. */
  streakBefore: number;
  elo: number;
  delta: number;
}

export interface MatchRecap {
  winner: RecapSide;
  loser: RecapSide;
  /** The head-to-head, told from the winner's side. */
  rivalry: Rivalry | null;
  /** Who called it, split by whether they were right. Null when nobody could. */
  calls: { right: string[]; wrong: string[] } | null;
  /** Titles the winner holds now and did not hold before this match. */
  titlesWon: LeagueTitle[];
}

const first = (name: string) => name.split(' ')[0];

/** Ladder order the way the ranks screen shows it: every player, best rating first. */
const rankOrder = (players: Player[]): string[] =>
  [...players]
    .sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id))
    .map((player) => player.id);

/**
 * What a result actually changed, for the one screen everybody is guaranteed
 * to see.
 *
 * Logging used to show two numbers and a badge. Everything here — the places
 * moved, who was passed, the head-to-head, whose calls came in, the titles —
 * was already being computed for other screens. This just puts it where the
 * player is looking at the moment they care most.
 */
export function buildMatchRecap(params: {
  match: MatchRecord;
  playersBefore: Player[];
  playersAfter: Player[];
  matchesAfter: MatchRecord[];
  challenge: Challenge | null;
  leagueBefore: LeagueInsights;
  leagueAfter: LeagueInsights;
  now?: number;
}): MatchRecap {
  const { match } = params;
  const before = rankOrder(params.playersBefore);
  const after = rankOrder(params.playersAfter);
  const nameOf = (id: string) =>
    first(params.playersAfter.find((player) => player.id === id)?.name ?? '');
  const hadPlayed = (id: string) => {
    const player = params.playersBefore.find((entry) => entry.id === id);
    return Boolean(player && player.wins + player.losses > 0);
  };

  const move = (id: string): RankMove => {
    const wasAt = before.indexOf(id);
    const isAt = after.indexOf(id);
    const beforeRank = hadPlayed(id) && wasAt >= 0 ? wasAt + 1 : null;
    const afterRank = isAt + 1;
    // Anyone above you before and below you now, you went past — and the other way round.
    const passed = after
      .slice(isAt + 1)
      .filter((other) => other !== id && before.indexOf(other) >= 0 && before.indexOf(other) < wasAt)
      .map(nameOf);
    const passedBy = after
      .slice(0, isAt)
      .filter((other) => other !== id && before.indexOf(other) > wasAt)
      .map(nameOf);
    return { before: beforeRank, after: afterRank, passed, passedBy };
  };

  const side = (id: string, delta: number): RecapSide => {
    const player = params.playersAfter.find((entry) => entry.id === id);
    const earlier = params.playersBefore.find((entry) => entry.id === id);
    return {
      id,
      name: player?.name ?? '',
      rank: move(id),
      streak: player?.currentStreak ?? 0,
      streakBefore: earlier?.currentStreak ?? 0,
      elo: player?.elo ?? 0,
      delta,
    };
  };

  const winnerId = match.winnerId;
  const loserId = match.loserId;
  const gain = match.eloDelta + match.bountyCollected;

  const rivalry = computeRivalry(winnerId, loserId, params.playersAfter, params.matchesAfter, params.now);

  let calls: MatchRecap['calls'] = null;
  if (params.challenge && params.challenge.predictions.length > 0) {
    calls = { right: [], wrong: [] };
    for (const prediction of params.challenge.predictions) {
      (prediction.predictedWinnerId === winnerId ? calls.right : calls.wrong).push(
        first(prediction.predictorName)
      );
    }
  }

  const heldBefore = new Set(
    (params.leagueBefore.titlesByPlayer.get(winnerId) ?? []).map((title) => title.key)
  );
  const titlesWon = (params.leagueAfter.titlesByPlayer.get(winnerId) ?? []).filter(
    (title) => !heldBefore.has(title.key)
  );

  return {
    winner: side(winnerId, gain),
    loser: side(loserId, -gain),
    rivalry,
    calls,
    titlesWon,
  };
}
