import { Challenge, MatchRecord, Player } from '../types';
import { MatchRecap } from './recap';

export type EarnedNotificationType = 'match_result' | 'rank_change' | 'prediction_result' | 'crown_taken';

export interface EarnedNotification {
  recipientPlayerId: string;
  type: EarnedNotificationType;
  title: string;
  body: string;
}

const first = (name: string) => name.split(' ')[0];

const joinNames = (names: string[]): string =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Who a logged result is worth telling, and what to say to each of them.
 *
 * The rule is that a notification has to be about you: you lost, you won and
 * were not the one logging, someone went past you on the ladder, your call
 * came in or did not, or the crown moved. Everybody else hears nothing, so
 * when the phone buzzes it means something happened to the reader. One
 * message per person; the most personal reason wins.
 */
export function earnedNotifications(params: {
  match: MatchRecord;
  recap: MatchRecap;
  players: Player[];
  challenge: Challenge | null;
  crownChangedHands: boolean;
  /** Whoever tapped log: they are looking at the recap and get nothing. */
  loggedBy: string;
}): EarnedNotification[] {
  const { match, recap, challenge, crownChangedHands, loggedBy } = params;
  const winner = recap.winner;
  const loser = recap.loser;
  const winnerFirst = first(winner.name);
  const loserFirst = first(loser.name);
  const gain = match.eloDelta + match.bountyCollected;

  const out = new Map<string, EarnedNotification>();
  const tell = (recipientPlayerId: string, type: EarnedNotificationType, title: string, body: string) => {
    if (!recipientPlayerId || recipientPlayerId === loggedBy || out.has(recipientPlayerId)) return;
    out.set(recipientPlayerId, { recipientPlayerId, type, title, body });
  };

  const placeLine = (after: number, before: number | null) =>
    before === null || before === after ? `still #${after}` : `now #${after}`;

  tell(
    loser.id,
    'match_result',
    `${winnerFirst} beat you`,
    `−${gain}, ${placeLine(loser.rank.after, loser.rank.before)}` +
      (loser.rank.passedBy.length > 0 ? ` · ${joinNames(loser.rank.passedBy)} went by` : '') +
      (crownChangedHands ? ' · the crown is gone' : '') +
      '.'
  );
  tell(
    winner.id,
    'match_result',
    `Logged: you beat ${loserFirst}`,
    `+${gain}, ${placeLine(winner.rank.after, winner.rank.before)}` +
      (winner.rank.passed.length > 0 ? ` · past ${joinNames(winner.rank.passed)}` : '') +
      (crownChangedHands ? ' · you wear the crown' : '') +
      '.'
  );

  // Anyone the winner climbed over feels it on the ladder, not in the match.
  winner.rank.passedIds.forEach((id, index) => {
    const theirRank = winner.rank.after + 1 + (winner.rank.passedIds.length - 1 - index);
    tell(
      id,
      'rank_change',
      `${winnerFirst} went past you`,
      `Beat ${loserFirst} and climbed to #${winner.rank.after}. You're #${theirRank} now.`
    );
  });

  if (challenge) {
    for (const prediction of challenge.predictions) {
      const right = prediction.predictedWinnerId === winner.id;
      tell(
        prediction.predictorId,
        'prediction_result',
        right ? 'You called it' : 'Wrong call',
        `${winnerFirst} beat ${loserFirst}.` +
          (prediction.stake ? (right ? ' Your chips came in.' : ` ${prediction.stake} chips gone.`) : '')
      );
    }
  }

  if (crownChangedHands) {
    for (const player of params.players) {
      tell(
        player.id,
        'crown_taken',
        `New #1: ${winnerFirst}`,
        `Took the crown off ${loserFirst}` +
          (match.bountyCollected > 0 ? ` with a ${match.bountyCollected} point bounty` : '') +
          '.'
      );
    }
  }

  return [...out.values()];
}
