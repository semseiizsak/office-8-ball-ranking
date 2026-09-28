import { Player } from '../types';
import { CrownState, describeTimeLeft, isFinalDay } from './league';
import { previewStakes } from './stakes';

/** How close to the end the ladder starts being narrated. */
export const FINALE_WINDOW_MS = 48 * 3_600_000;

export interface FinaleLine {
  kind: 'crown' | 'you' | 'race';
  text: string;
}

export interface SeasonFinale {
  /** "Final day" or "Final 48 hours". */
  heading: string;
  timeLeft: string;
  finalDay: boolean;
  lines: FinaleLine[];
  /** Who could take the crown with one win; the banner offers them as targets. */
  contenderIds: string[];
}

const first = (name: string) => name.split(' ')[0];

const joinNames = (names: string[]): string =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * The last two days of a season, told as what can still happen rather than
 * what has. Every line is a single match away: who can take the crown in one
 * win, what one win does for the reader, and the tightest race left on the
 * ladder. Nothing here is stored; it is all read off the standings.
 */
export function buildSeasonFinale(params: {
  players: Player[];
  crown: CrownState;
  endsAt: number | null;
  now: number;
  viewerId: string | null;
}): SeasonFinale | null {
  const { players, crown, endsAt, now, viewerId } = params;
  if (!endsAt || endsAt <= now || endsAt - now > FINALE_WINDOW_MS) return null;

  const ranked = players
    .filter((player) => player.wins + player.losses > 0)
    .sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id));
  if (ranked.length < 2) return null;

  const rankOf = (id: string) => ranked.findIndex((player) => player.id === id) + 1;
  const lines: FinaleLine[] = [];

  // The crown: who is one win from it.
  const holder = ranked.find((player) => player.id === crown.holderId) ?? ranked[0];
  const contenders = ranked.filter(
    (player) =>
      player.id !== holder.id && previewStakes(player, holder, ranked, crown.bounty).rankIfWin === 1
  );
  const contenderIds = contenders.map((player) => player.id);
  if (contenders.length > 0) {
    lines.push({
      kind: 'crown',
      text:
        `${joinNames(contenders.slice(0, 3).map((player) => first(player.name)))}` +
        `${contenders.length > 3 ? ` and ${contenders.length - 3} more` : ''} can still take ` +
        `${first(holder.name)}'s crown with one win` +
        (crown.bounty > 0 ? ` and the ${crown.bounty} point bounty` : '') +
        '.',
    });
  } else {
    lines.push({
      kind: 'crown',
      text: `Nobody can take ${first(holder.name)}'s crown in a single match. It ends on the table or not at all.`,
    });
  }

  // The reader: what one match does for them.
  const viewer = viewerId ? ranked.find((player) => player.id === viewerId) : undefined;
  if (viewer) {
    const myRank = rankOf(viewer.id);
    if (viewer.id === holder.id) {
      const chaser = ranked[1];
      const threat = previewStakes(chaser, viewer, ranked, crown.bounty);
      lines.push({
        kind: 'you',
        text: threat.rankIfWin === 1
          ? `You hold it. Lose to ${first(chaser.name)} and the season is theirs.`
          : `You hold it, and one loss cannot cost you the crown. Stay sharp anyway.`,
      });
    } else {
      const above = ranked[myRank - 2];
      const up = previewStakes(viewer, above, ranked, above.id === holder.id ? crown.bounty : 0);
      const below = ranked[myRank];
      const down = below ? previewStakes(below, viewer, ranked) : null;
      const climb = up.rankIfWin < myRank
        ? `One win over ${first(above.name)} puts you at #${up.rankIfWin}.`
        : `Beating ${first(above.name)} still leaves you #${myRank}; it would take two.`;
      const guard = down && down.rankIfWin < rankOf(below.id)
        ? ` Lose to ${first(below.name)} and they finish above you.`
        : '';
      lines.push({ kind: 'you', text: `${climb}${guard}` });
    }
  }

  // The tightest race left, top five only, that one result would flip.
  let race: { upper: Player; lower: Player; gap: number } | null = null;
  ranked.slice(0, 5).forEach((upper, index) => {
    const lower = ranked[index + 1];
    if (!lower || upper.id === holder.id) return;
    if (viewer && (upper.id === viewer.id || lower.id === viewer.id)) return;
    const gap = upper.elo - lower.elo;
    if (previewStakes(lower, upper, ranked).rankIfWin <= index + 1 && (!race || gap < race.gap)) {
      race = { upper, lower, gap };
    }
  });
  if (race) {
    const { upper, lower, gap } = race as { upper: Player; lower: Player; gap: number };
    lines.push({
      kind: 'race',
      text: `#${rankOf(upper.id)} is ${gap} point${gap === 1 ? '' : 's'}: ${first(upper.name)} over ${first(lower.name)}. One match settles it.`,
    });
  }

  const finalDay = isFinalDay(endsAt, now);
  return {
    heading: finalDay ? 'Final day' : 'Final 48 hours',
    timeLeft: describeTimeLeft(endsAt, now),
    finalDay,
    lines,
    contenderIds,
  };
}
