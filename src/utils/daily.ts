import { MatchRecord } from '../types';

/**
 * The match of the day. Every morning everyone active gets one opponent,
 * paired both ways (if you got Dave, Dave got you); with an odd number one
 * person sits it out. The pairing is drawn once, on the day's first open, and
 * stored, so a player enrolling at lunch does not reshuffle everyone.
 *
 * Playing it pays chips to both, more to the winner, and a run of days played
 * builds a streak. All of that is read off the matches, not stored.
 */

export const DAILY_PLAY_BONUS = 50;
export const DAILY_WIN_BONUS = 50;

export interface DailyPairing {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  pairs: Array<[string, string]>;
  bye: string | null;
}

export const dayKeyOf = (at: number) => {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const seeded = (seed: string) => {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
};

/** Draws the day's pairs from a seed on the date, so any client draws the same. */
export function drawPairing(day: string, playerIds: string[]): DailyPairing {
  const random = seeded(`8ball-${day}`);
  const ids = [...playerIds].sort();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  return { day, pairs, bye: ids.length % 2 ? ids[ids.length - 1] : null };
}

export interface DailyResult {
  day: string;
  opponentId: string | null;
  played: boolean;
  won: boolean;
  upset: boolean;
}

export interface DailyRecord {
  completed: number;
  wins: number;
  upsets: number;
  skipped: number;
  byes: number;
  streak: number;
  bestStreak: number;
  bonus: number;
  /** Also played at least three other matches on a day they played the daily. */
  doubleDuty: number;
  history: DailyResult[];
}

const emptyRecord = (): DailyRecord => ({
  completed: 0, wins: 0, upsets: 0, skipped: 0, byes: 0, streak: 0, bestStreak: 0, bonus: 0, doubleDuty: 0, history: [],
});

export function deriveDaily(dailies: DailyPairing[], matches: MatchRecord[], now: number): Map<string, DailyRecord> {
  const records = new Map<string, DailyRecord>();
  const get = (id: string) => {
    const existing = records.get(id);
    if (existing) return existing;
    const fresh = emptyRecord();
    records.set(id, fresh);
    return fresh;
  };
  const today = dayKeyOf(now);
  const byDay = new Map<string, MatchRecord[]>();
  for (const match of matches) {
    const key = dayKeyOf(match.timestamp);
    byDay.set(key, [...(byDay.get(key) ?? []), match]);
  }

  for (const daily of [...dailies].sort((a, b) => a.day.localeCompare(b.day))) {
    const onDay = (byDay.get(daily.day) ?? []).sort((a, b) => a.timestamp - b.timestamp);
    if (daily.bye) {
      const record = get(daily.bye);
      record.byes++;
      record.history.push({ day: daily.day, opponentId: null, played: false, won: false, upset: false });
    }
    for (const [a, b] of daily.pairs) {
      const match = onDay.find((entry) => [entry.playerAId, entry.playerBId].includes(a) && [entry.playerAId, entry.playerBId].includes(b));
      for (const [me, them] of [[a, b], [b, a]] as const) {
        const record = get(me);
        const won = match?.winnerId === me;
        record.history.push({ day: daily.day, opponentId: them, played: !!match, won, upset: !!match && won && match.isUpset });
        if (match) {
          record.completed++;
          record.bonus += DAILY_PLAY_BONUS + (won ? DAILY_WIN_BONUS : 0);
          if (won) record.wins++;
          if (won && match.isUpset) record.upsets++;
          record.streak++;
          record.bestStreak = Math.max(record.bestStreak, record.streak);
          const others = onDay.filter((entry) => entry !== match && (entry.playerAId === me || entry.playerBId === me)).length;
          if (others >= 3) record.doubleDuty++;
        } else if (daily.day !== today) {
          // Today is still open; an unplayed daily only counts once the day is over.
          record.skipped++;
          record.streak = 0;
        }
      }
    }
  }
  return records;
}

/** Today's opponent for a player, if they have one. */
export function todaysDaily(dailies: DailyPairing[], playerId: string, now: number) {
  const daily = dailies.find((entry) => entry.day === dayKeyOf(now));
  if (!daily) return null;
  if (daily.bye === playerId) return { bye: true as const, opponentId: null };
  const pair = daily.pairs.find(([a, b]) => a === playerId || b === playerId);
  if (!pair) return null;
  return { bye: false as const, opponentId: pair[0] === playerId ? pair[1] : pair[0] };
}
