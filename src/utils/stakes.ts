import { Player } from '../types';
import { calculateMatchElo } from './elo';

export interface StakesPreview {
  /** Rating swing in each direction, bounty included. */
  winDelta: number;
  loseDelta: number;
  currentRank: number;
  rankIfWin: number;
  rankIfLose: number;
  /** Nearest player this result would move you past, or drop you behind. */
  overtakes: string | null;
  fallsBelow: string | null;
  bounty: number;
  isUnderdog: boolean;
  /** One sentence stating what the match is actually worth. */
  headline: string;
}

const rankIn = (standings: Array<{ id: string; elo: number }>, playerId: string): number =>
  [...standings].sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id))
    .findIndex((entry) => entry.id === playerId) + 1;

/**
 * What a match is worth to `player` before anybody picks up a cue.
 *
 * Both ratings are simulated, because beating the player above you moves them
 * too — the interesting part is not the points, it is the position.
 */
export function previewStakes(
  player: Player,
  opponent: Player,
  players: Player[],
  bountyOnOpponent: number = 0,
  bountyOnPlayer: number = 0
): StakesPreview {
  const playerWins = calculateMatchElo(player.elo, opponent.elo, 'A');
  const opponentWins = calculateMatchElo(player.elo, opponent.elo, 'B');

  const winDelta = Math.abs(playerWins.deltaA) + bountyOnOpponent;
  const loseDelta = Math.abs(opponentWins.deltaA) + bountyOnPlayer;

  const baseline = players.map((entry) => ({ id: entry.id, elo: entry.elo }));
  const scenario = (playerElo: number, opponentElo: number) =>
    baseline.map((entry) =>
      entry.id === player.id
        ? { ...entry, elo: playerElo }
        : entry.id === opponent.id
        ? { ...entry, elo: opponentElo }
        : entry
    );

  const currentRank = rankIn(baseline, player.id);
  const winStandings = scenario(player.elo + winDelta, Math.max(100, opponent.elo - winDelta));
  const loseStandings = scenario(Math.max(100, player.elo - loseDelta), opponent.elo + loseDelta);
  const rankIfWin = rankIn(winStandings, player.id);
  const rankIfLose = rankIn(loseStandings, player.id);

  const nameOf = (id: string) => players.find((entry) => entry.id === id)?.name.split(' ')[0] ?? null;

  // Whoever currently sits directly above you and would end up below you.
  const above = [...baseline]
    .sort((left, right) => right.elo - left.elo)
    .filter((entry) => rankIn(baseline, entry.id) < currentRank);
  const overtakes = rankIfWin < currentRank
    ? nameOf(above.filter((entry) => rankIn(winStandings, entry.id) > rankIfWin).pop()?.id ?? '')
    : null;

  const below = [...baseline]
    .sort((left, right) => right.elo - left.elo)
    .filter((entry) => rankIn(baseline, entry.id) > currentRank);
  const fallsBelow = rankIfLose > currentRank
    ? nameOf(below.find((entry) => rankIn(loseStandings, entry.id) < rankIfLose)?.id ?? '')
    : null;

  const isUnderdog = player.elo < opponent.elo;

  const upside = overtakes
    ? `Win and you go past ${overtakes} into #${rankIfWin}.`
    : rankIfWin < currentRank
    ? `Win and you climb to #${rankIfWin}.`
    : `Win and you take ${winDelta} off them.`;
  const downside = fallsBelow
    ? `Lose and ${fallsBelow} goes past you.`
    : rankIfLose > currentRank
    ? `Lose and you slip to #${rankIfLose}.`
    : `Lose and it costs you ${loseDelta}.`;

  return {
    winDelta,
    loseDelta,
    currentRank,
    rankIfWin,
    rankIfLose,
    overtakes,
    fallsBelow,
    bounty: bountyOnOpponent,
    isUnderdog,
    headline: `${upside} ${downside}`,
  };
}
