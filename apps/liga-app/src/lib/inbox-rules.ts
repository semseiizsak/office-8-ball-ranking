// K5 push catalogue and the notice generators (pure, no storage). src/lib/inbox.ts re-exports these.
import { notify, type DB, type Notice, type StoredMatch } from '@/lib/engine';
import type { Member } from '@/lib/types';
import { fmt, signed } from '@/theme';

export type Level = 'push' | 'inbox' | 'off';
export type Category = 'challenges' | 'matches' | 'ranks' | 'league';
export type LeagueLevel = 'default' | 'mine' | 'off';
export type Prefs = {
  types: Partial<Record<string, Level>>;
  quiet: { on: boolean; from: number; to: number; urgent: boolean };
  pauseUntil: string | null;
  leagues: Record<string, { level: LeagueLevel; muteUntil: string | null }>;
  product: boolean;
};

// Only the P1 types that exist in the app today. action: needs a response, can't be fully off.
export const CATALOGUE: { kind: string; category: Category; label: string; def: Level; action?: boolean; urgent?: boolean }[] = [
  { kind: 'challenge.received', category: 'challenges', label: 'Someone challenges you', def: 'push', action: true },
  { kind: 'challenge.accepted', category: 'challenges', label: 'Your challenge is accepted', def: 'push' },
  { kind: 'challenge.declined', category: 'challenges', label: 'Your challenge is declined', def: 'inbox' },
  { kind: 'challenge.expiring', category: 'challenges', label: 'A challenge is about to expire', def: 'push', action: true, urgent: true },
  { kind: 'challenge.expired', category: 'challenges', label: 'A challenge ran out of time', def: 'inbox' },
  { kind: 'match.logged', category: 'matches', label: 'Someone logs a match with you', def: 'push' },
  { kind: 'match.reaction', category: 'matches', label: 'Reactions on your match', def: 'inbox' },
  { kind: 'crown.won', category: 'ranks', label: 'You take the crown', def: 'push' },
  { kind: 'crown.lost', category: 'ranks', label: 'You lose the crown', def: 'push' },
  { kind: 'crown.taken', category: 'ranks', label: 'Someone takes the crown', def: 'push' },
  { kind: 'rank.passed', category: 'ranks', label: 'Someone passes you', def: 'inbox' },
];
export const CATEGORIES: { id: Category; label: string; sub: string }[] = [
  { id: 'challenges', label: 'Challenges', sub: 'Received, accepted, expiring' },
  { id: 'matches', label: 'Matches', sub: 'Logged with you, reactions' },
  { id: 'ranks', label: 'Ranks and crown', sub: 'Crown, passed you' },
];

export const DEFAULT_PREFS: Prefs = { types: {}, quiet: { on: true, from: 22, to: 8, urgent: true }, pauseUntil: null, leagues: {}, product: false };

export const categoryOf = (kind: string): Category =>
  kind.startsWith('challenge') || kind.startsWith('live') ? 'challenges' : kind.startsWith('match') ? 'matches' : kind.startsWith('crown') || kind.startsWith('rank') ? 'ranks' : 'league';
// Other features may write challenge_received style kinds; both spellings map to one catalogue entry.
const norm = (kind: string) => kind.replace(/_/g, '.');
const spec = (kind: string) => CATALOGUE.find((c) => c.kind === norm(kind));
export const isAction = (kind: string) => !!spec(kind)?.action || norm(kind).endsWith('.received');
export const levelOf = (p: Prefs, kind: string): Level => {
  const l = p.types[norm(kind)] ?? spec(kind)?.def ?? 'push';
  return l === 'off' && isAction(kind) ? 'inbox' : l;
};
const future = (iso: string | null, now: Date) => !!iso && new Date(iso).getTime() > now.getTime();
export const inQuiet = (p: Prefs, now: Date) => {
  if (!p.quiet.on) return false;
  const h = now.getHours();
  return p.quiet.from > p.quiet.to ? h >= p.quiet.from || h < p.quiet.to : h >= p.quiet.from && h < p.quiet.to;
};

// Inbox visibility: Off types are hidden, a league set to Off keeps only things that need you.
export function visible(n: Notice, p: Prefs) {
  if (levelOf(p, n.kind) === 'off') return false;
  return p.leagues[n.league_id]?.level !== 'off' || isAction(n.kind);
}

// Push only when the type is on, nothing is paused or muted, and quiet hours allow it.
export function shouldPush(n: Notice, p: Prefs, now = new Date()) {
  if (levelOf(p, n.kind) !== 'push' || !visible(n, p)) return false;
  if (future(p.pauseUntil, now)) return false;
  const lg = p.leagues[n.league_id];
  if (lg && (future(lg.muteUntil, now) || lg.level === 'off')) return false;
  if (lg?.level === 'mine' && (n.kind === 'crown.taken' || categoryOf(n.kind) === 'league')) return false;
  if (inQuiet(p, now) && !(p.quiet.urgent && spec(n.kind)?.urgent)) return false;
  return true;
}

/* ---------- generators, called inside the write before save() ---------- */
const names = (list: string[]) => (list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]);
const ladder = (ms: { id: string; rating: number; played: boolean }[]) => ms.filter((m) => m.played).sort((a, b) => b.rating - a.rating).map((m) => m.id);
const sameDay = (a: string, b: Date) => new Date(a).toDateString() === b.toDateString();
const minutesAgo = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / 60000;

function bump(n: Notice, p: Partial<Notice>) { Object.assign(n, p, { read: false, created_at: new Date().toISOString() }); }

// P08 match logged with you, P15 and P16 crown, P17 passed you.
export function noticesForMatch(d: DB, matchId: string) {
  const m = d.matches.find((x) => x.id === matchId);
  if (!m) return;
  const now = new Date();
  const league = d.leagues.find((l) => l.id === m.league_id);
  const ms = d.members.filter((x) => x.league_id === m.league_id);
  const byId = (id: string) => ms.find((x) => x.id === id);
  const ps = d.mps.filter((p) => p.match_id === m.id);
  const logger = ms.find((x) => x.user_id === m.created_by);
  const side = (s: 'a' | 'b') => ps.filter((p) => p.side === s).map((p) => byId(p.member_id)!).filter(Boolean);
  const winners = side(m.winner), losers = side(m.winner === 'a' ? 'b' : 'a');
  const score = m.score_a == null || m.score_b == null ? '' : m.winner === 'a' ? ` ${m.score_a} : ${m.score_b}` : ` ${m.score_b} : ${m.score_a}`;
  const href = `/match/${m.id}`;
  d.notices = d.notices ?? [];

  const who = logger?.display_name ?? 'Someone';
  for (const p of ps) {
    const rec = byId(p.member_id);
    if (!rec?.user_id || rec.user_id === m.created_by) continue;
    const won = p.side === m.winner;
    const body = won ? `You won${score}. ${signed(p.delta)} Elo, now ${fmt(p.rating_after)}.` : `${names(winners.map((x) => x.display_name))} won${score}. You ${signed(p.delta)} Elo, now ${fmt(p.rating_after)}.`;
    const prev = d.notices.find((n) => n.kind === 'match.logged' && n.member_id === rec.id && !n.read && n.title.startsWith(who + ' logged') && minutesAgo(n.created_at, now) < 10);
    if (prev) {
      const count = Number(/logged (\d+) matches/.exec(prev.title)?.[1] ?? 1) + 1;
      bump(prev, { title: `${who} logged ${count} matches with you`, body, href });
    } else notify(d, { league_id: m.league_id, member_id: rec.id, kind: 'match.logged', title: `${who} logged a match with you`, body, href });
  }

  // Ladder before and after this match (only players with at least one match are ranked).
  const inMatch = new Map(ps.map((p) => [p.member_id, p]));
  const before = ladder(ms.map((x) => {
    const p = inMatch.get(x.id);
    return { id: x.id, rating: p ? p.rating_before : x.rating, played: x.wins + x.losses - (p ? 1 : 0) > 0 };
  }));
  const after = ladder(ms.map((x) => ({ id: x.id, rating: x.rating, played: x.wins + x.losses > 0 })));
  const oldKing = byId(before[0]), king = byId(after[0]);
  if (oldKing && king && oldKing.id !== king.id) {
    const beat = (viewer: string) => (winners.some((w) => w.id === king.id) ? `beat ${names(losers.map((x) => (x.id === viewer ? 'you' : x.display_name)))} and ` : '');
    for (const r of ms) {
      if (!r.user_id) continue;
      if (r.id === king.id) notify(d, { league_id: m.league_id, member_id: r.id, kind: 'crown.won', title: '👑 You took the crown', body: `You're #1 in ${league?.name ?? 'the league'} now.`, href: '/' });
      else if (r.id === oldKing.id) notify(d, { league_id: m.league_id, member_id: r.id, kind: 'crown.lost', title: 'You lost the crown', body: `${king.display_name} ${beat(r.id)}took #1. Rematch?`, href: '/' });
      else notify(d, { league_id: m.league_id, member_id: r.id, kind: 'crown.taken', title: `👑 ${king.display_name} took the crown`, body: `${king.display_name} ${beat(r.id)}is #1 now.`, href: '/' });
    }
  }

  // P17: someone in this match passed you in the top 10. One per person per day, the newest wins.
  const rank = (list: string[], id: string) => { const i = list.indexOf(id); return i < 0 ? Infinity : i + 1; };
  for (const r of ms) {
    if (!r.user_id || inMatch.has(r.id) || r.id === oldKing?.id) continue;
    const ra = rank(after, r.id);
    if (ra > 10 || ra === Infinity) continue;
    const passer = ps.map((p) => byId(p.member_id)!).find((x) => x && rank(before, x.id) > rank(before, r.id) && rank(after, x.id) < ra);
    if (!passer || (passer.id === king?.id && oldKing?.id !== king?.id)) continue;
    const title = `${passer.display_name} passed you`, body = `You're #${ra} now. One win takes it back.`;
    const prev = d.notices.find((n) => n.kind === 'rank.passed' && n.member_id === r.id && sameDay(n.created_at, now));
    if (prev) bump(prev, { title, body });
    else notify(d, { league_id: m.league_id, member_id: r.id, kind: 'rank.passed', title, body, href: '/' });
  }
}

// P14 reactions on your match, one grouped row per match and person for 6 hours.
export function noticesForReaction(d: DB, matchId: string, actorId: string) {
  const m: StoredMatch | undefined = d.matches.find((x) => x.id === matchId);
  if (!m) return;
  const now = new Date();
  const ms = d.members.filter((x) => x.league_id === m.league_id);
  const byId = (id: string) => ms.find((x) => x.id === id) as Member | undefined;
  const ps = d.mps.filter((p) => p.match_id === m.id);
  const rs = (d.reactions ?? []).filter((r) => r.match_id === matchId);
  const added = rs.some((r) => r.member_id === actorId);
  const href = `/match/${m.id}`;
  d.notices = d.notices ?? [];
  for (const p of ps) {
    const rec = byId(p.member_id);
    if (!rec?.user_id || rec.id === actorId) continue;
    const mine = rs.filter((r) => r.member_id !== rec.id);
    const prev: Notice | undefined = d.notices.find((n) => n.kind === 'match.reaction' && n.member_id === rec.id && n.href === href && minutesAgo(n.created_at, now) < 360);
    if (!mine.length) { if (prev && !added) d.notices = d.notices.filter((n) => n !== prev); continue; }
    const people = [...new Set(mine.map((r) => r.member_id).reverse())].map((id) => byId(id)?.display_name ?? 'Someone');
    const counts = new Map<string, number>();
    mine.forEach((r) => counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1));
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e).join('');
    const title = people.length === 1 ? `${people[0]} reacted ${top}` : people.length === 2 ? `${people[0]} and ${people[1]} reacted ${top}` : `${people[0]} and ${people.length - 1} others reacted ${top}`;
    const opp = ps.filter((x) => x.side !== p.side).map((x) => byId(x.member_id)?.display_name ?? '');
    const body = `To your ${p.side === m.winner ? 'win' : 'match'} against ${names(opp)}.`;
    if (prev) { if (added) bump(prev, { title, body }); else Object.assign(prev, { title, body }); }
    else if (added) notify(d, { league_id: m.league_id, member_id: rec.id, kind: 'match.reaction', title, body, href });
  }
}
