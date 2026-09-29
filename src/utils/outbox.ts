import { MatchRecord, Player } from '../types';
import { calculateMatchElo } from './elo';

/**
 * Matches logged while the league database cannot take them.
 *
 * Firestore's free plan stops answering once a day's quota is spent, and it
 * does not come back until midnight Pacific time. Rather than lose every game
 * played in between, each phone keeps what it logged here and hands it over,
 * in the order the games were played, the first time the database answers.
 * Only who won, who lost and when is kept: that is all a result ever is.
 */
export interface OfflineMatch {
  id: string;
  /** Null when the phone had no roster and the name was typed. */
  winnerId: string | null;
  loserId: string | null;
  winnerName: string;
  loserName: string;
  playedAt: number;
  loggedById: string | null;
}

/** The last roster this phone saw, without photos, so logging never needs the database. */
export interface CachedPlayer {
  id: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  ball?: number;
}

const OUTBOX_KEY = 'office_8ball_outbox_v1';
const ROSTER_KEY = 'office_8ball_roster_v1';

/** Two logs of the same result this close together are one game told twice. */
export const DUPLICATE_WINDOW_MS = 4 * 60_000;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage cannot be helped; the caller still has the value in memory.
  }
};

export const loadOutbox = (): OfflineMatch[] =>
  read<OfflineMatch[]>(OUTBOX_KEY, []).filter((entry) => entry && entry.id && entry.winnerName && entry.loserName);

export const saveOutbox = (entries: OfflineMatch[]) => write(OUTBOX_KEY, entries);

export const loadRoster = (): CachedPlayer[] => read<CachedPlayer[]>(ROSTER_KEY, []);

export const saveRoster = (players: Player[]) => {
  if (players.length === 0) return;
  write(
    ROSTER_KEY,
    players.map((player) => ({
      id: player.id,
      name: player.name,
      elo: player.elo,
      wins: player.wins,
      losses: player.losses,
      ...(player.ball ? { ball: player.ball } : {}),
    }))
  );
};

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function queueMatch(
  entries: OfflineMatch[],
  entry: Omit<OfflineMatch, 'id' | 'playedAt'> & { playedAt?: number }
): OfflineMatch[] {
  return [...entries, { ...entry, id: newId(), playedAt: entry.playedAt ?? Date.now() }];
}

/** The document id a queued match is written under, so a retried sync cannot write it twice. */
export const offlineMatchDocId = (entry: OfflineMatch) => `offline-${entry.id}`;

/** Lower case, accents and extra spaces gone: "Ármin  Kovács" and "armin kovacs" are one person. */
export const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Who a typed name means: the exact full name, else the one player whose first
 * name (or the start of whose name) it is. Anything ambiguous stays unresolved
 * rather than crediting the wrong person.
 */
export function resolveName(name: string, roster: Array<Pick<Player, 'id' | 'name'>>): string | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  const exact = roster.filter((player) => normalizeName(player.name) === wanted);
  if (exact.length === 1) return exact[0].id;
  const byFirst = roster.filter((player) => normalizeName(player.name).split(' ')[0] === wanted);
  if (byFirst.length === 1) return byFirst[0].id;
  const byPrefix = roster.filter((player) => normalizeName(player.name).startsWith(wanted));
  return byPrefix.length === 1 ? byPrefix[0].id : null;
}

export interface ResolvedOfflineMatch extends OfflineMatch {
  winnerId: string;
  loserId: string;
}

/**
 * Splits the outbox against the real roster and history: what can be written,
 * what names nobody can be sure of, and what is already in the league (the same
 * result logged by another phone, or by this one on a sync that did land).
 */
export function planSync(
  entries: OfflineMatch[],
  roster: Array<Pick<Player, 'id' | 'name'>>,
  existing: Array<Pick<MatchRecord, 'id' | 'winnerId' | 'loserId' | 'timestamp'>>
): { ready: ResolvedOfflineMatch[]; unresolved: OfflineMatch[]; duplicates: OfflineMatch[] } {
  const ids = new Set(roster.map((player) => player.id));
  const ready: ResolvedOfflineMatch[] = [];
  const unresolved: OfflineMatch[] = [];
  const duplicates: OfflineMatch[] = [];
  const taken = existing.map((match) => ({ ...match }));

  for (const entry of [...entries].sort((left, right) => left.playedAt - right.playedAt)) {
    const winnerId = entry.winnerId && ids.has(entry.winnerId) ? entry.winnerId : resolveName(entry.winnerName, roster);
    const loserId = entry.loserId && ids.has(entry.loserId) ? entry.loserId : resolveName(entry.loserName, roster);
    if (!winnerId || !loserId || winnerId === loserId) {
      unresolved.push(entry);
      continue;
    }
    const docId = offlineMatchDocId(entry);
    const seen = taken.some(
      (match) =>
        match.id === docId ||
        (match.winnerId === winnerId &&
          match.loserId === loserId &&
          Math.abs(match.timestamp - entry.playedAt) <= DUPLICATE_WINDOW_MS)
    );
    if (seen) {
      duplicates.push(entry);
      continue;
    }
    taken.push({ id: docId, winnerId, loserId, timestamp: entry.playedAt });
    ready.push({ ...entry, winnerId, loserId });
  }
  return { ready, unresolved, duplicates };
}

/**
 * The standings as this phone believes them: the last roster it saw with its own
 * queued results played on top. Provisional by nature, since other phones may
 * be holding games of their own; the real numbers come from the sync's replay.
 */
export function provisionalStandings(roster: CachedPlayer[], entries: OfflineMatch[]): CachedPlayer[] {
  const table = new Map(roster.map((player) => [player.id, { ...player }]));
  for (const entry of [...entries].sort((left, right) => left.playedAt - right.playedAt)) {
    const winnerId = entry.winnerId ?? resolveName(entry.winnerName, roster);
    const loserId = entry.loserId ?? resolveName(entry.loserName, roster);
    const winner = winnerId ? table.get(winnerId) : undefined;
    const loser = loserId ? table.get(loserId) : undefined;
    if (!winner || !loser || winner === loser) continue;
    const { deltaA } = calculateMatchElo(winner.elo, loser.elo, 'A');
    winner.elo += Math.abs(deltaA);
    loser.elo = Math.max(100, loser.elo - Math.abs(deltaA));
    winner.wins += 1;
    loser.losses += 1;
  }
  return [...table.values()].sort((left, right) => right.elo - left.elo || left.id.localeCompare(right.id));
}

/** True for the errors that mean "the database is out of quota or out of reach", not a bug. */
export function isDatabaseDown(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    code === 'resource-exhausted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    /quota|resource[-_ ]exhausted|timed out|offline|network|failed to fetch/i.test(message)
  );
}

/**
 * When Firestore's free daily quota comes back: midnight in Los Angeles, told
 * in this phone's own time. Worked out from the offset rather than hard-coded,
 * so daylight saving on either side cannot put it an hour off.
 */
export function quotaResetsAt(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const laWallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = laWallAsUtc - Math.floor(now / 1000) * 1000;
  const nextLaMidnightAsUtc = Date.UTC(get('year'), get('month') - 1, get('day') + 1);
  return nextLaMidnightAsUtc - offset;
}
