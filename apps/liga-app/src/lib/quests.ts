// Weekly quests (G5.4 Weekly): 3 quests per member each week from a pool, seeded by league, week and member.
// Progress is derived from the week's confirmed matches (and comments, cup games), never stored.
// Claiming writes one ledger row. A quest is never locked behind a paid plan, and nothing is lost when a week ends.
import { db, save, wait, type User } from '@/lib/api';
import { credit, paid, REWARD, syncCoins, weekStart } from '@/lib/coins';
import { DAY, h01, tzOf, weekOf } from '@/lib/cup';
import { ApiError, counts, notify, type DB } from '@/lib/engine';
import { isOn } from '@/lib/modules';

export type QuestId = 'play15' | 'win5' | 'people5' | 'duo' | 'upset' | 'cup' | 'comment5';
type Def = { id: QuestId; title: string; target: number; icon: string; needs?: 'cup' | 'chat' };
export const POOL: Def[] = [
  { id: 'play15', title: 'Play 15 matches', target: 15, icon: 'play' },
  { id: 'win5', title: 'Win 5 matches', target: 5, icon: 'win' },
  { id: 'people5', title: 'Play 5 different people', target: 5, icon: 'people' },
  { id: 'duo', title: 'Win a 2v2 match', target: 1, icon: 'duo' },
  { id: 'upset', title: 'Beat someone rated higher', target: 1, icon: 'upset' },
  { id: 'cup', title: 'Win a cup match', target: 1, icon: 'cup', needs: 'cup' },
  { id: 'comment5', title: 'Comment on 5 matches', target: 5, icon: 'comment', needs: 'chat' },
];
export type QuestState = 'progress' | 'ready' | 'claimed';
export type Quest = Def & { progress: number; reward: number; state: QuestState };
export type QuestStore = { notified: Record<string, string> }; // league -> week key of the last "New weekly quests" notice

const qs = (d: DB): QuestStore => { const s = (d.quests as QuestStore | undefined) ?? { notified: {} }; d.quests = s; return s; };
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);
export const questsOn = (l: Parameters<typeof isOn>[0]) => isOn(l, 'coins') && isOn(l, 'quests');

export function weekKey(d: DB, leagueId: string, now = Date.now()) { return weekOf(now, tzOf(leagueOf(d, leagueId))).key; }

// The member's 3 quests this week, picked from the pool the league can use.
export function pick(d: DB, leagueId: string, memberId: string, key: string) {
  const l = leagueOf(d, leagueId);
  const pool = POOL.filter((q) => !q.needs || isOn(l, q.needs));
  return [...pool].sort((a, b) => h01(`${leagueId}|${key}|${memberId}|${a.id}`) - h01(`${leagueId}|${key}|${memberId}|${b.id}`)).slice(0, 3);
}

function progressOf(d: DB, leagueId: string, memberId: string, q: Def, from: number, to: number) {
  const inWeek = (iso: string) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
  const mine = d.matches.filter((m) => m.league_id === leagueId && counts(m) && inWeek(m.played_at));
  const rows = (id: string) => d.mps.filter((p) => p.match_id === id);
  const sideOf = (id: string) => rows(id).find((p) => p.member_id === memberId)?.side;
  const played = mine.filter((m) => sideOf(m.id));
  const won = played.filter((m) => sideOf(m.id) === m.winner);
  switch (q.id) {
    case 'play15': return played.length;
    case 'win5': return won.length;
    case 'people5': return new Set(played.flatMap((m) => rows(m.id).filter((p) => p.side !== sideOf(m.id)).map((p) => p.member_id))).size;
    case 'duo': return won.filter((m) => m.format === '2v2').length;
    case 'upset': return won.filter((m) => {
      const r = rows(m.id), avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
      return avg(r.filter((p) => p.side !== m.winner).map((p) => p.rating_before)) > avg(r.filter((p) => p.side === m.winner).map((p) => p.rating_before));
    }).length;
    case 'cup': {
      const ids = new Set(won.map((m) => m.id));
      return (d.cups ?? []).filter((c) => c.league_id === leagueId).flatMap((c) => c.games).filter((g) => g.winner === memberId && g.match_id && ids.has(g.match_id)).length;
    }
    case 'comment5': return new Set((d.chat?.comments ?? []).filter((c) => c.league_id === leagueId && c.author === memberId && inWeek(c.created_at)).map((c) => c.match_id)).size;
  }
}

const refOf = (leagueId: string, key: string, q: QuestId) => `quest:${leagueId}:${key}:${q}`;

export function questsFor(d: DB, leagueId: string, memberId: string, now = Date.now()): Quest[] {
  const key = weekKey(d, leagueId, now);
  const from = weekStart(d, leagueId, now), to = from + 7 * DAY + 2 * 3600000; // a little slack for clock changes
  return pick(d, leagueId, memberId, key).map((q) => {
    const progress = Math.min(q.target, progressOf(d, leagueId, memberId, q, from, to));
    const claimed = paid(d, refOf(leagueId, key, q.id), memberId);
    return { ...q, progress, reward: REWARD.quest, state: claimed ? 'claimed' : progress >= q.target ? 'ready' : 'progress' };
  });
}

function claimIn(d: DB, leagueId: string, memberId: string, q: Quest, key: string) {
  credit(d, { league_id: leagueId, member_id: memberId, amount: q.reward, reason: 'quest', label: `Weekly quest: ${q.title}`, ref: refOf(leagueId, key, q.id), href: '/quests' });
}

// Lazy step: bots claim finished quests, and real members get one "New weekly quests" notice on Monday.
export function syncQuests(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !questsOn(l)) return false;
  let changed = syncCoins(d, leagueId, now);
  const key = weekKey(d, leagueId, now);
  const people = d.members.filter((m) => m.league_id === leagueId && !m.status && !m.guest);
  for (const m of people.filter((x) => !x.user_id)) {
    for (const q of questsFor(d, leagueId, m.id, now)) if (q.state === 'ready') { claimIn(d, leagueId, m.id, q, key); changed = true; }
  }
  const s = qs(d);
  if (s.notified[leagueId] !== key) {
    if (s.notified[leagueId]) for (const m of people.filter((x) => x.user_id)) {
      notify(d, { league_id: leagueId, member_id: m.id, kind: 'quests.new', title: 'New weekly quests', body: `${pick(d, leagueId, m.id, key).map((q) => q.title).join(', ')}.`, href: '/quests' });
    }
    s.notified[leagueId] = key; changed = true;
  }
  return changed;
}

const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);

export type Board = { on: boolean; guest: boolean; quests: Quest[]; endsAt: number; ready: number; done: number };
export async function questBoard(user: User, leagueId: string): Promise<Board> {
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  const endsAt = weekStart(d, leagueId) + 7 * DAY;
  if (!l || !me || !questsOn(l)) return { on: false, guest: false, quests: [], endsAt, ready: 0, done: 0 };
  if (syncQuests(d, leagueId)) await save();
  const quests = questsFor(d, leagueId, me.id);
  return { on: true, guest: !!me.guest, quests, endsAt: weekStart(d, leagueId) + 7 * DAY, ready: quests.filter((q) => q.state === 'ready').length, done: quests.filter((q) => q.state !== 'progress').length };
}

export async function claimQuest(user: User, leagueId: string, id: QuestId | 'all') {
  await wait(200);
  const d = await db();
  const l = leagueOf(d, leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || !questsOn(l)) throw new ApiError('quests off');
  if (me.guest) throw new ApiError('guests do not collect');
  const key = weekKey(d, leagueId);
  const list = questsFor(d, leagueId, me.id).filter((q) => q.state === 'ready' && (id === 'all' || q.id === id));
  if (!list.length) throw new ApiError('nothing to claim');
  list.forEach((q) => claimIn(d, leagueId, me.id, q, key));
  await save();
  return list.reduce((s, q) => s + q.reward, 0);
}
