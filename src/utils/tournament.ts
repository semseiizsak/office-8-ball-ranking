import { MatchRecord } from '../types';
import { dayKeyOf } from './daily';

/**
 * The weekly cup: a straight knockout that works for whoever turns up.
 *
 * Sign-ups open Monday morning and close at noon; everyone who signed up
 * plays. At the close the field is seeded by Elo, best first. The main
 * bracket is the biggest power of two that fits (2, 4, 8 or 16) and is seeded
 * the classic way (1 v 8, 4 v 5, 2 v 7, 3 v 6), so the two best can only meet
 * in the final. When the field is not a power of two, everyone plays a first
 * round (the play-in), best against worst (with 6: 1 v 6, 2 v 5, 3 v 4). Only
 * an odd field gives a bye, to seed 1. Seats the play-in winners do not fill
 * are byes in the next round, taken by the best play-in winners. Weeks before
 * CUP_ALL_PLAY_FROM keep their old shape, where only the lowest seeds played in.
 *
 * Each round has a deadline, counting back from the final on Friday 17:00. A
 * game can be played as soon as both players are known. If it is not played
 * by its deadline, a player who said they were ready takes it as a walkover;
 * if nobody (or both) did, the higher seed goes through. Either way the
 * bracket keeps moving, and no match means no Elo.
 */

export const CUP_OPENS_HOUR = 8;
export const CUP_CLOSES_HOUR = 12;
export const CUP_DEADLINE_HOUR = 17;
export const CHAMPION_CHIPS = 300;
export const FINALIST_CHIPS = 100;

export const CUP_MIN_PLAYERS = 3;

/** From this week on everyone plays the first round; only an odd one out gets a bye. */
export const CUP_ALL_PLAY_FROM = '2026-11-02';
export const CUP_MAX_PLAYERS = 16;

/** Weeks whose sign-ups close later than usual: week key to closing hour. */
export const CUP_CLOSE_OVERRIDES: Record<string, number> = { '2026-09-28': 16 };

/**
 * Weeks whose draw is thrown away and redone once: week key to the moment
 * the old draw stopped counting. 2026-09-28 was drawn as a Swiss cup before
 * the cup became a seeded knockout.
 */
export const CUP_REDRAWS: Record<string, number> = { '2026-09-28': 1790609400000 };

export interface Tournament {
  /** The Monday of the week, YYYY-MM-DD. */
  week: string;
  opensAt: number;
  closesAt: number;
  /** Friday afternoon: the final's deadline. */
  deadline: number;
  entrants: Array<{ id: string; at: number }>;
  /** Everyone playing, best seed first; null until drawn, empty if too few signed up. */
  field: string[] | null;
  drawnAt: number | null;
  /** Players who said they were ready to play a game, by game key. */
  claims: Array<{ game: string; id: string; at: number }>;
}

const undrawn = { field: null, drawnAt: null, claims: [] as Tournament['claims'] };

/**
 * Applies a later closing hour to a week's cup. A cup already drawn before the
 * new close is treated as undrawn, so sign-ups reopen and it is drawn again.
 */
export function withCloseOverride(tournament: Tournament): Tournament {
  const hour = CUP_CLOSE_OVERRIDES[tournament.week];
  if (hour === undefined) return tournament;
  const closes = new Date(tournament.opensAt);
  closes.setHours(hour, 0, 0, 0);
  const closesAt = closes.getTime();
  const early = tournament.drawnAt !== null && tournament.drawnAt < closesAt;
  return { ...tournament, closesAt, ...(early ? undrawn : {}) };
}

/** Throws away a draw made before the week's redraw moment, so the next open draws again. */
export function withRedraw(tournament: Tournament): Tournament {
  const redrawAt = CUP_REDRAWS[tournament.week];
  if (redrawAt === undefined || tournament.drawnAt === null || tournament.drawnAt >= redrawAt) return tournament;
  return { ...tournament, ...undrawn };
}

/** The Monday midnight of the week `at` falls in. */
export function mondayOf(at: number): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  const shift = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - shift);
  return date;
}

const hourOf = (monday: Date, days: number, h: number) => {
  const d = new Date(monday);
  d.setDate(d.getDate() + days);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

export function weekTournament(at: number): Tournament {
  const monday = mondayOf(at);
  return withCloseOverride({
    week: dayKeyOf(monday.getTime()),
    opensAt: hourOf(monday, 0, CUP_OPENS_HOUR),
    closesAt: hourOf(monday, 0, CUP_CLOSES_HOUR),
    deadline: hourOf(monday, 4, CUP_DEADLINE_HOUR),
    entrants: [],
    ...undrawn,
  });
}

/**
 * The field at the close: everyone who signed up (the first 16 if more),
 * best Elo first; equal ratings go to whoever signed up first.
 */
export function seedField(tournament: Tournament, elo: Record<string, number>): string[] {
  const inOrder = [...tournament.entrants].sort((a, b) => a.at - b.at).slice(0, CUP_MAX_PLAYERS);
  if (inOrder.length < CUP_MIN_PLAYERS) return [];
  return inOrder
    .map((entry, index) => ({ id: entry.id, index, elo: elo[entry.id] ?? 1000 }))
    .sort((a, b) => b.elo - a.elo || a.index - b.index)
    .map((entry) => entry.id);
}

/** The main bracket: the biggest power of two that fits the field. */
export const mainSize = (n: number) => {
  let size = 1;
  while (size * 2 <= n) size *= 2;
  return size;
};

/** Seed numbers in bracket order, so 1 and 2 can only meet in the final: 8 gives 1 8 4 5 2 7 3 6. */
export function slotOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

const allPlay = (week?: string) => week === undefined || week >= CUP_ALL_PLAY_FROM || !/^\d{4}-/.test(week);

/** The shape of a cup of `n`: how many main rounds and how many play-in games. */
export function bracketShape(n: number, week?: string) {
  const size = mainSize(n);
  const rounds = Math.round(Math.log2(size));
  const playIns = size === n ? 0 : allPlay(week) ? Math.floor(n / 2) : n - size;
  return { size, rounds, playIns };
}

/** Who takes each main-bracket seat, 1 to size: a seed straight in, a play-in winner, or nobody (a bye). */
export type Seat = { kind: 'seed'; seed: number } | { kind: 'playin'; hi: number; lo: number } | { kind: 'empty' };

export function seatPlan(n: number, week?: string): Seat[] {
  const { size, playIns } = bracketShape(n, week);
  const seats: Seat[] = Array.from({ length: size + 1 }, () => ({ kind: 'empty' }));
  if (!allPlay(week) || !playIns) {
    for (let k = 1; k <= size; k++) seats[k] = k <= size - playIns ? { kind: 'seed', seed: k } : { kind: 'playin', hi: k, lo: 2 * size + 1 - k };
    return seats;
  }
  // Seed 1 sits out the play-in only when the field is odd; the rest play best against worst.
  const direct = n % 2;
  const entries: Seat[] = [
    ...(direct ? [{ kind: 'seed', seed: 1 } as Seat] : []),
    ...Array.from({ length: playIns }, (_, j): Seat => ({ kind: 'playin', hi: direct + j + 1, lo: n - j })),
  ];
  const rank = (seat: Seat) => (seat.kind === 'seed' ? seat.seed : seat.kind === 'playin' ? seat.hi : Infinity);
  // Empty seats go to the best play-in winners, so nobody gets two byes.
  const byes = size - entries.length;
  const takers: Seat[] = entries.filter((seat) => seat.kind === 'playin').slice(0, byes);
  const rest = entries.filter((seat) => !takers.includes(seat));
  const units: Array<[Seat, Seat]> = [
    ...takers.map((seat): [Seat, Seat] => [seat, { kind: 'empty' }]),
    ...rest.slice(0, rest.length / 2).map((seat, i): [Seat, Seat] => [seat, rest[rest.length - 1 - i]]),
  ].sort((x, y) => rank(x[0]) - rank(y[0]));
  units.forEach(([top, bottom], i) => {
    seats[i + 1] = top;
    seats[size - i] = bottom;
  });
  return seats;
}

export const roundName = (round: number, rounds: number) =>
  round === rounds - 1 ? 'Final' : round === rounds - 2 ? 'Semi-final' : round === rounds - 3 ? 'Quarter-final' : 'Round of 16';

/**
 * Deadlines count back from Friday 17:00: the final on Friday, the round
 * before on Thursday and so on; the play-in closes the day before the first
 * main round.
 */
export function gameDeadline(tournament: Tournament, key: string): number {
  const n = tournament.field?.length ?? 0;
  const { rounds } = bracketShape(Math.max(n, 2), tournament.week);
  const monday = mondayOf(tournament.opensAt);
  const round = key.startsWith('p') ? -1 : Number(key.slice(1).split('-')[0]);
  const day = 4 - (rounds - 1 - round);
  return hourOf(monday, Math.max(day, 1), CUP_DEADLINE_HOUR);
}

export interface CupGame {
  /** Stable id: `p<seed>` for a play-in, `r<round>-<index>` in the main bracket. */
  key: string;
  stage: 'playin' | 'main';
  /** Main round index, 0 first; -1 for the play-in. */
  round: number;
  label: string;
  a: string | null;
  b: string | null;
  seedA: number | null;
  seedB: number | null;
  winnerId: string | null;
  matchId: string | null;
  /** Not played: the only player who said they were ready went through. */
  walkover: boolean;
  /** Not played and nobody (or both) ready: the higher seed went through. */
  auto: boolean;
  /** One seat is empty: whoever takes the other goes through without a match. */
  bye: boolean;
  /** Who of the two has said they are ready to play. */
  ready: string[];
  deadline: number;
  /** When it was decided: the match, or the deadline for a walkover. */
  decidedAt: number | null;
}

export interface CupState {
  /** Seed number per player, 1 is the best. */
  seeds: Map<string, number>;
  playIn: CupGame[];
  /** The main bracket, first round first; the last round is the final. */
  rounds: CupGame[][];
  final: CupGame;
  champion: string | null;
  runnerUp: string | null;
  /** The label of the round being played now, for headers. */
  current: string;
  unfinished: boolean;
}

/** Walks the bracket forward through the matches logged since the draw. */
export function resolveCup(tournament: Tournament, matches: MatchRecord[], now: number): CupState | null {
  const field = tournament.field;
  if (!field || field.length < CUP_MIN_PLAYERS || tournament.drawnAt === null) return null;
  const drawnAt = tournament.drawnAt;
  const { size, rounds: roundCount } = bracketShape(field.length, tournament.week);
  const plan = seatPlan(field.length, tournament.week);
  const seeds = new Map(field.map((id, index) => [id, index + 1]));
  const idOf = (seed: number) => field[seed - 1] ?? null;
  const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
  const used = new Set<string>();

  const settle = (key: string, stage: CupGame['stage'], round: number, label: string, a: string | null, b: string | null, since: number | null): CupGame => {
    const deadline = gameDeadline(tournament, key);
    const ready = [...new Set(tournament.claims.filter((claim) => claim.game === key && claim.at <= deadline && (claim.id === a || claim.id === b)).map((claim) => claim.id))];
    const base = { key, stage, round, label, a, b, seedA: a ? seeds.get(a)! : null, seedB: b ? seeds.get(b)! : null, ready, deadline, bye: false };
    const open = { ...base, winnerId: null, matchId: null, walkover: false, auto: false, decidedAt: null };
    if (!a || !b || since === null) return open;
    const match = sorted.find(
      (entry) =>
        !used.has(entry.id) &&
        entry.timestamp >= since &&
        entry.timestamp <= deadline &&
        [entry.playerAId, entry.playerBId].includes(a) &&
        [entry.playerAId, entry.playerBId].includes(b)
    );
    if (match) {
      used.add(match.id);
      return { ...base, winnerId: match.winnerId, matchId: match.id, walkover: false, auto: false, decidedAt: match.timestamp };
    }
    if (now <= deadline) return open;
    if (ready.length === 1) return { ...base, winnerId: ready[0], matchId: null, walkover: true, auto: false, decidedAt: deadline };
    const higher = seeds.get(a)! < seeds.get(b)! ? a : b;
    return { ...base, winnerId: higher, matchId: null, walkover: false, auto: true, decidedAt: deadline };
  };

  // The play-in, keyed by the main seat its winner takes.
  const playIn: CupGame[] = [];
  const intoSlot = new Map<number, CupGame>();
  plan.forEach((seat, k) => {
    if (seat.kind !== 'playin') return;
    const game = settle(`p${k}`, 'playin', -1, 'Play-in', idOf(seat.hi), idOf(seat.lo), drawnAt);
    playIn.push(game);
    intoSlot.set(k, game);
  });
  playIn.sort((x, y) => x.seedA! - y.seedA!);

  // The main bracket in seeding order; a play-in seat is filled by its winner, an empty one is a bye.
  type Entry = { id: string | null; ready: number | null; empty?: boolean };
  let entries: Entry[] = slotOrder(size).map((k) => {
    const seat = plan[k];
    const feeder = intoSlot.get(k);
    if (feeder) return { id: feeder.winnerId, ready: feeder.decidedAt };
    return seat.kind === 'seed' ? { id: idOf(seat.seed), ready: drawnAt } : { id: null, ready: null, empty: true };
  });
  const rounds: CupGame[][] = [];
  for (let round = 0; round < roundCount; round++) {
    const games: CupGame[] = [];
    for (let i = 0; i < entries.length; i += 2) {
      const [x, y] = [entries[i], entries[i + 1]];
      const since = x.ready !== null && y.ready !== null ? Math.max(x.ready, y.ready) : null;
      const game = settle(`r${round}-${i / 2}`, 'main', round, roundName(round, roundCount), x.id, y.id, since);
      const through = x.empty ? y : y.empty ? x : null;
      games.push(through ? { ...game, bye: true, winnerId: through.id, decidedAt: through.id ? through.ready : null } : game);
    }
    rounds.push(games);
    entries = games.map((game) => ({ id: game.winnerId, ready: game.decidedAt }));
  }
  const final = rounds[rounds.length - 1][0];
  const champion = final.winnerId;
  const runnerUp = champion ? (final.a === champion ? final.b : final.a) : null;
  const all = [...playIn, ...rounds.flat()];
  const live = all.find((game) => !game.winnerId && game.a && game.b) ?? all.find((game) => !game.winnerId);
  return { seeds, playIn, rounds, final, champion, runnerUp, current: live?.label ?? 'Final', unfinished: !champion && now > tournament.deadline };
}

/** Every game of the cup, play-in first. */
export const allGames = (state: CupState) => [...state.playIn, ...state.rounds.flat()];

/** A player's cup games this week, in order. */
export const gamesOf = (state: CupState, id: string) => allGames(state).filter((game) => game.a === id || game.b === id);

export interface CupRecord {
  entered: number;
  titles: number;
  finals: number;
  matchWins: number;
  bonus: number;
}

export function deriveCups(tournaments: Tournament[], matches: MatchRecord[], now: number): Map<string, CupRecord> {
  const records = new Map<string, CupRecord>();
  const get = (id: string) => {
    const existing = records.get(id);
    if (existing) return existing;
    const fresh: CupRecord = { entered: 0, titles: 0, finals: 0, matchWins: 0, bonus: 0 };
    records.set(id, fresh);
    return fresh;
  };
  for (const tournament of tournaments) {
    const state = resolveCup(tournament, matches, now);
    if (!state || !tournament.field) continue;
    for (const id of tournament.field) get(id).entered++;
    // Only a played match is a win; walkovers and seed advances are not.
    for (const game of allGames(state)) if (game.winnerId && game.matchId) get(game.winnerId).matchWins++;
    if (state.champion) {
      const champ = get(state.champion);
      champ.titles++;
      champ.finals++;
      champ.bonus += CHAMPION_CHIPS;
    }
    if (state.runnerUp) {
      const second = get(state.runnerUp);
      second.finals++;
      // A final that never happened pays the runner-up nothing.
      if (state.final.matchId) second.bonus += FINALIST_CHIPS;
    }
  }
  return records;
}
