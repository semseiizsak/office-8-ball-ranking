// Live match module (M11 to M14, G1.6). Points, pause, abandon and finish live on a live_matches row; finishing
// turns it into a normal match through recordMatch. Demo bots run their own live matches, simulated lazily on read.
import { afterCounted, db, recordMatch, save, wait, type User } from '@/lib/api';
import { completeChallenge } from '@/lib/challenges';
import { filterText, settingsOf as chatSettings } from '@/lib/chat-store';
import { armCupGame, linkCupMatch } from '@/lib/cup';
import { ApiError, applyMatch, notify, uid, type DB } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import { assertCanPost } from '@/lib/moderation';
import type { Member } from '@/lib/types';

export type LiveFormat = { kind: 'first'; to: number } | { kind: 'timed'; minutes: number } | { kind: 'open' };
export type LiveState = 'ready' | 'live' | 'paused' | 'done' | 'abandoned';
export type Side = 'a' | 'b';
export type LivePoint = { side: Side; at: string; by: string | null };
export type LiveLine = { id: string; member_id: string; body: string; at: string };
export type LiveReact = { emoji: string; at: string; member_id: string };
export type LiveMatch = {
  id: string; league_id: string; a: string[]; b: string[]; format: LiveFormat;
  scorers: 'both' | 'me'; visibility: 'league' | 'private';
  state: LiveState; created_by: string; creator: string; // user id, member id
  created_at: string; starts_at: string | null; started_at: string | null; paused_at: string | null; paused_ms: number; ended_at: string | null;
  ready: Record<string, string>; // member id, ready at (may be in the future for bots)
  points: LivePoint[]; chat: LiveLine[]; reacts: LiveReact[]; react_total: number; react_counts: Record<string, number>;
  spectators: Record<string, string>; peak: number;
  challenge_id: string | null; cup_game_id: string | null;
  match_id: string | null; retired: Side | null; pending: boolean; reason: string | null;
  bot?: { points: LivePoint[]; chat: LiveLine[]; reacts: LiveReact[]; watchers: string[] }; // script, released as time passes
};

export const REACTS = ['🔥', '😂', '👏', '😱'] as const;
export const SPORT_EMOJI: Record<string, string> = { foosball: '⚽', pingpong: '🏓', pool: '🎱', darts: '🎯', chess: '♟️', esports: '🎮' };
export const REACT_GAP = 5000;
export const CHAT_GAP = 3000;
const CHAT_MAX = 200;
const VIEW_TTL = 30000;
const PUSH_GAP = 30 * 60000;
const BOT_GAP = 4 * 60000;
const BOT_LEAD = 60000;

const list = (d: DB) => (d.live = d.live ?? []) as LiveMatch[];
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const iso = (t: number) => new Date(t).toISOString();
const copy = <X,>(x: X): X => JSON.parse(JSON.stringify(x));
const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
const nameOf = (d: DB, id: string) => d.members.find((m) => m.id === id)?.display_name ?? 'Someone';
const sideName = (d: DB, ids: string[]) => ids.map((id) => nameOf(d, id)).join(' and ');

/* ---------- pure helpers ---------- */

export const players = (x: Pick<LiveMatch, 'a' | 'b'>) => [...x.a, ...x.b];
export const scoreOf = (x: Pick<LiveMatch, 'points'>): [number, number] => [x.points.filter((p) => p.side === 'a').length, x.points.filter((p) => p.side === 'b').length];
export const isActive = (x: Pick<LiveMatch, 'state'>) => x.state === 'ready' || x.state === 'live' || x.state === 'paused';
export function elapsed(x: LiveMatch, now = Date.now()) {
  if (!x.started_at) return 0;
  const end = x.ended_at ? ms(x.ended_at) : x.paused_at ? ms(x.paused_at) : now;
  return Math.max(0, end - ms(x.started_at) - x.paused_ms);
}
export const clockLabel = (t: number) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export function formatLabel(f: LiveFormat) {
  return f.kind === 'first' ? `First to ${f.to}` : f.kind === 'timed' ? `Timed ${f.minutes} min` : 'No target, just the winner';
}
// Who wins if the match ended now, by the format. null: not decided (tie or target not reached).
export function decided(x: LiveMatch, now = Date.now()): Side | null {
  const [a, b] = scoreOf(x);
  if (x.format.kind === 'first') return a >= x.format.to ? 'a' : b >= x.format.to ? 'b' : null;
  if (x.format.kind === 'timed' && elapsed(x, now) >= x.format.minutes * 60000) return a > b ? 'a' : b > a ? 'b' : null;
  return null;
}
export const leader = (x: LiveMatch): Side | null => { const [a, b] = scoreOf(x); return a > b ? 'a' : b > a ? 'b' : null; };
export function viewers(x: LiveMatch, now = Date.now()) {
  const real = Object.entries(x.spectators).filter(([, at]) => now - ms(at) < VIEW_TTL).length;
  return real + (x.bot && isActive(x) ? x.bot.watchers.length : 0);
}
export const canScore = (x: LiveMatch, memberId: string | undefined) => !!memberId && players(x).includes(memberId) && (x.scorers === 'both' || x.creator === memberId);
export const isReady = (x: LiveMatch, memberId: string, now = Date.now()) => !!x.ready[memberId] && ms(x.ready[memberId]) <= now;
// Longest run of points for one side, for the full time summary.
export function bestRun(x: Pick<LiveMatch, 'points' | 'started_at'>) {
  let best = { side: null as Side | null, n: 0, at: '' }, run = 0;
  x.points.forEach((p, i) => {
    run = i > 0 && x.points[i - 1].side === p.side ? run + 1 : 1;
    if (run > best.n) best = { side: p.side, n: run, at: x.points[i - run + 1].at };
  });
  return best;
}
export function topChatters(x: Pick<LiveMatch, 'chat'>, n = 3) {
  const c = new Map<string, number>();
  x.chat.forEach((l) => c.set(l.member_id, (c.get(l.member_id) ?? 0) + 1));
  return [...c].sort((p, q) => q[1] - p[1]).slice(0, n).map(([member_id, count]) => ({ member_id, count }));
}
export const topReaction = (x: Pick<LiveMatch, 'react_counts'>) => Object.entries(x.react_counts).sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;

/* ---------- lazy step: bots, readiness, timed matches ---------- */

// Releases scripted bot events up to now, starts matches whose players are all ready, ends finished bot matches.
export function stepLive(d: DB, leagueId: string, now = Date.now()) {
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l || !isOn(l, 'live')) return false;
  const before = JSON.stringify(d.live ?? []) + d.matches.length;
  scheduleBots(d, leagueId, now);
  for (const x of list(d).filter((y) => y.league_id === leagueId && isActive(y))) {
    if (x.state === 'ready') {
      const go = x.bot ? ms(x.starts_at) <= now : players(x).every((id) => isReady(x, id, now));
      if (go) {
        x.state = 'live';
        x.started_at = x.bot ? x.starts_at : iso(Math.max(...players(x).map((id) => ms(x.ready[id])), ms(x.created_at)));
        announce(d, x);
      }
    }
    if (x.bot && x.state === 'live') releaseBot(d, x, now);
  }
  // Keep the store small: finished rows stay 7 days, bot rows only the last few.
  const old = now - 7 * 86400000;
  const bots = list(d).filter((x) => x.league_id === leagueId && x.bot && !isActive(x)).sort((p, q) => ms(q.ended_at) - ms(p.ended_at)).slice(4).map((x) => x.id);
  d.live = list(d).filter((x) => isActive(x) || (ms(x.ended_at) > old && !bots.includes(x.id)));
  return JSON.stringify(d.live) + d.matches.length !== before;
}

const BOT_LINES = [
  'come on {a} 👀', '{b} is cooking today', 'that was filthy', 'defence!!', 'three in a row, come on', 'coffee on the loser ☕',
  'called it for {a}', 'unreal save', '{b} warming up', 'this is the final we deserved', 'no way 😱', 'easy easy',
];

function scheduleBots(d: DB, leagueId: string, now: number) {
  const bots = d.members.filter((m) => m.league_id === leagueId && m.user_id === null && !m.status && !m.guest);
  if (bots.length < 2) return;
  const mine = list(d).filter((x) => x.league_id === leagueId && x.bot);
  if (mine.some(isActive)) return;
  const last = Math.max(0, ...mine.map((x) => ms(x.ended_at)));
  if (last && now - last < BOT_GAP) return;
  const busy = new Set(list(d).filter((x) => x.league_id === leagueId && isActive(x)).flatMap(players));
  const free = bots.filter((m) => !busy.has(m.id)).sort(() => Math.random() - 0.5);
  if (free.length < 2) return;
  const [pa, pb] = free;
  // First one in the demo is already running so there is something to watch right away.
  const start = last ? now + BOT_LEAD : now - 50000;
  const x = blank(leagueId, [pa.id], [pb.id], { kind: 'first', to: 10 }, 'bot', pa.id, iso(now));
  x.state = 'ready'; x.starts_at = iso(start);
  const chance = 1 / (1 + 10 ** ((pb.rating - pa.rating) / 400));
  let t = start, sa = 0, sb = 0;
  const pts: LivePoint[] = [];
  while (sa < 10 && sb < 10) {
    t += 4000 + Math.random() * 7000;
    const side: Side = Math.random() < chance ? 'a' : 'b';
    if (side === 'a') sa++; else sb++;
    pts.push({ side, at: iso(t), by: pa.id });
  }
  const watchers = free.slice(2).map((m) => m.id);
  const chat: LiveLine[] = [], reacts: LiveReact[] = [];
  const lines = [...BOT_LINES].sort(() => Math.random() - 0.5); // each line at most once per match
  for (let c = start + 6000; c < t && watchers.length && lines.length; c += 9000 + Math.random() * 14000) {
    const body = lines.pop()!.replace('{a}', pa.display_name).replace('{b}', pb.display_name);
    chat.push({ id: uid(), member_id: watchers[Math.floor(Math.random() * watchers.length)], body, at: iso(c) });
  }
  for (let c = start + 3000; c < t && watchers.length; c += 2500 + Math.random() * 5000) {
    const emoji = Math.random() < 0.2 ? '⚽' : REACTS[Math.floor(Math.random() * REACTS.length)];
    reacts.push({ emoji, member_id: watchers[Math.floor(Math.random() * watchers.length)], at: iso(c) });
  }
  x.bot = { points: pts, chat, reacts, watchers };
  x.ready = { [pa.id]: x.starts_at, [pb.id]: x.starts_at };
  list(d).push(x);
}

function releaseBot(d: DB, x: LiveMatch, now: number) {
  const due = <E extends { at: string }>(all: E[]) => { const out: E[] = []; while (all.length && ms(all[0].at) <= now) out.push(all.shift()!); return out; };
  x.points.push(...due(x.bot!.points));
  x.chat.push(...due(x.bot!.chat));
  for (const r of due(x.bot!.reacts)) pushReact(x, r);
  x.peak = Math.max(x.peak, viewers(x, now));
  const w = decided(x, now);
  if (!w) return;
  x.state = 'done'; x.ended_at = x.points[x.points.length - 1].at;
  x.bot!.chat = []; x.bot!.reacts = [];
  const [a, b] = scoreOf(x);
  const res = applyMatch(d, x.league_id, x.a, x.b, w, 'bot', [a, b], new Date(x.ended_at));
  x.match_id = res.matchId;
  afterCounted(d, res.matchId);
}

function blank(leagueId: string, a: string[], b: string[], format: LiveFormat, createdBy: string, creator: string, at: string): LiveMatch {
  return {
    id: uid(), league_id: leagueId, a, b, format, scorers: 'both', visibility: 'league', state: 'ready', created_by: createdBy, creator,
    created_at: at, starts_at: null, started_at: null, paused_at: null, paused_ms: 0, ended_at: null, ready: {},
    points: [], chat: [], reacts: [], react_total: 0, react_counts: {}, spectators: {}, peak: 0,
    challenge_id: null, cup_game_id: null, match_id: null, retired: null, pending: false, reason: null,
  };
}

function pushReact(x: LiveMatch, r: LiveReact) {
  x.reacts.push(r);
  if (x.reacts.length > 60) x.reacts.splice(0, x.reacts.length - 60);
  x.react_total++;
  x.react_counts[r.emoji] = (x.react_counts[r.emoji] ?? 0) + 1;
}

// Start notice for the league, at most one every 30 minutes per league. A cup final goes to everyone.
function announce(d: DB, x: LiveMatch) {
  if (x.visibility !== 'league') return;
  const cup = cupInfo(d, x);
  const final = cup?.final;
  const key = `liveNoticeAt_${x.league_id}`;
  if (!final && Date.now() - ms((d[key] as string | undefined) ?? null) < PUSH_GAP) return;
  d[key] = iso(Date.now());
  const title = final ? 'The final is live' : `${sideName(d, x.a)} vs ${sideName(d, x.b)} is live`;
  const body = final ? `${sideName(d, x.a)} vs ${sideName(d, x.b)} 🏆` : 'Tap to watch and react.';
  for (const m of d.members.filter((y) => y.league_id === x.league_id && y.user_id && !y.status && !players(x).includes(y.id))) {
    notify(d, { league_id: x.league_id, member_id: m.id, kind: 'live.start', title, body, href: `/live/watch/${x.id}` });
  }
}

export function cupInfo(d: DB, x: Pick<LiveMatch, 'cup_game_id'>) {
  if (!x.cup_game_id) return null;
  const c = (d.cups ?? []).find((y) => y.games.some((g) => g.id === x.cup_game_id));
  const g = c?.games.find((y) => y.id === x.cup_game_id);
  if (!c || !g) return null;
  return { cupId: c.id, round: g.round, rounds: c.rounds, final: g.round === c.rounds - 1, prize: c.prizes.winner };
}

/* ---------- reads ---------- */

export type LiveView = LiveMatch & { cup: ReturnType<typeof cupInfo> };
const view = (d: DB, x: LiveMatch): LiveView => ({ ...copy(x), bot: x.bot ? { points: [], chat: [], reacts: [], watchers: [...x.bot.watchers] } : undefined, cup: cupInfo(d, x) });
const visibleTo = (x: LiveMatch, me: Member | undefined) => x.visibility === 'league' || (!!me && players(x).includes(me.id));

async function fresh(leagueId: string) {
  const d = await db();
  if (stepLive(d, leagueId)) await save();
  return d;
}

// Active matches first (live, then starting), plus matches that ended in the last 15 minutes.
export async function liveNow(user: User, leagueId: string) {
  const d = await fresh(leagueId);
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!isOn(l, 'live')) return [];
  const me = meIn(d, leagueId, user);
  const rank = (x: LiveMatch) => (x.state === 'live' || x.state === 'paused' ? 0 : x.state === 'ready' ? 1 : 2);
  return list(d)
    .filter((x) => x.league_id === leagueId && visibleTo(x, me) && (isActive(x) || (x.state === 'done' && Date.now() - ms(x.ended_at) < 15 * 60000)))
    .sort((p, q) => rank(p) - rank(q) || ms(q.created_at) - ms(p.created_at))
    .map((x) => view(d, x));
}

export async function getLive(user: User, id: string) {
  const d0 = await db();
  const x0 = list(d0).find((x) => x.id === id);
  if (!x0) return null;
  const d = await fresh(x0.league_id);
  const x = list(d).find((y) => y.id === id);
  if (!x || !visibleTo(x, meIn(d, x.league_id, user))) return null;
  return view(d, x);
}

// What comes next in the league, for the spectator full time card.
export async function upNext(user: User, leagueId: string, notId: string) {
  return (await liveNow(user, leagueId)).find((x) => x.id !== notId && isActive(x)) ?? null;
}

/* ---------- writes ---------- */

async function mine(user: User, id: string, scorer = true) {
  const d = await db();
  const x = list(d).find((y) => y.id === id);
  if (!x) throw new ApiError('not found');
  stepLive(d, x.league_id);
  const me = meIn(d, x.league_id, user);
  if (!me) throw new ApiError('not a member');
  if (scorer && !canScore(x, me.id)) throw new ApiError('not a scorer');
  return { d, x, me };
}

export async function busyPlayer(leagueId: string, ids: string[]) {
  const d = await fresh(leagueId);
  const x = list(d).find((y) => y.league_id === leagueId && isActive(y) && players(y).some((p) => ids.includes(p)));
  return x ? { name: nameOf(d, players(x).find((p) => ids.includes(p))!), id: x.id } : null;
}

export async function createLive(user: User, p: { league: string; a: string[]; b: string[]; format: LiveFormat; scorers: 'both' | 'me'; visibility: 'league' | 'private'; challenge?: string | null; cup?: string | null }) {
  await wait(200);
  const d = await fresh(p.league);
  const l = d.leagues.find((x) => x.id === p.league);
  if (!l || !isOn(l, 'live')) throw new ApiError('live is off');
  const me = meIn(d, p.league, user);
  if (!me) throw new ApiError('not a member');
  if (p.a.length !== p.b.length || ![1, 2].includes(p.a.length) || p.a.some((x) => p.b.includes(x))) throw new ApiError('bad sides');
  const busy = list(d).find((y) => y.league_id === p.league && isActive(y) && players(y).some((id) => [...p.a, ...p.b].includes(id)));
  if (busy) throw new ApiError('already live');
  const now = Date.now();
  const x = blank(p.league, p.a, p.b, p.format, user.id, me.id, iso(now));
  Object.assign(x, { scorers: p.scorers, visibility: p.visibility, challenge_id: p.challenge ?? null, cup_game_id: p.cup ?? null });
  x.ready[me.id] = iso(now);
  // Bots say they are here after a few seconds; real players tap Ready on their phone.
  for (const id of [...p.a, ...p.b]) {
    const m = d.members.find((y) => y.id === id);
    if (m && m.user_id === null && id !== me.id) x.ready[id] = iso(m.guest ? now : now + 3000 + Math.random() * 5000); // a guest has no phone, they are at the table
    else if (m?.user_id && id !== me.id) notify(d, { league_id: p.league, member_id: id, kind: 'live.ready', title: `${me.display_name} is ready to go live`, body: 'Tap Ready when you are at the table.', href: `/live/${x.id}` });
  }
  list(d).push(x);
  stepLive(d, p.league, now);
  await save();
  return x.id;
}

export async function setReady(user: User, id: string) {
  const { d, x, me } = await mine(user, id, false);
  if (!players(x).includes(me.id) || x.state !== 'ready') return;
  x.ready[me.id] = iso(Date.now());
  stepLive(d, x.league_id);
  await save();
}

// The creator may start without everyone after 60 seconds.
export async function startAnyway(user: User, id: string) {
  const { d, x } = await mine(user, id);
  if (x.state !== 'ready') return;
  x.state = 'live'; x.started_at = iso(Date.now());
  announce(d, x);
  await save();
}

export async function cancelLive(user: User, id: string) {
  const { x, me } = await mine(user, id, false);
  if (x.state !== 'ready' || !players(x).includes(me.id)) return;
  x.state = 'abandoned'; x.ended_at = iso(Date.now()); x.reason = 'cancelled';
  await save();
}

export async function addPoint(user: User, id: string, side: Side) {
  const { x, me } = await mine(user, id);
  if (x.state !== 'live') throw new ApiError('not live');
  x.points.push({ side, at: iso(Date.now()), by: me.id });
  await save();
  return copy(x.points);
}

// side: remove that side's last point (−1); no side: undo the last point of the match.
export async function undoPoint(user: User, id: string, side?: Side) {
  const { x } = await mine(user, id);
  if (x.state !== 'live' && x.state !== 'paused') return;
  const i = side ? x.points.map((p) => p.side).lastIndexOf(side) : x.points.length - 1;
  if (i >= 0) x.points.splice(i, 1);
  await save();
}

export async function setPaused(user: User, id: string, on: boolean) {
  const { x } = await mine(user, id);
  const now = Date.now();
  if (on && x.state === 'live') { x.state = 'paused'; x.paused_at = iso(now); }
  if (!on && x.state === 'paused') { x.paused_ms += now - ms(x.paused_at); x.paused_at = null; x.state = 'live'; }
  await save();
}

// Full time: a normal match through recordMatch, linked to the cup game or challenge.
export async function finishLive(user: User, id: string, opts: { winner?: Side; retired?: Side | null } = {}) {
  const { x } = await mine(user, id);
  if (x.state !== 'live' && x.state !== 'paused') throw new ApiError('not live');
  const [sa, sb] = scoreOf(x);
  const winner: Side | null = opts.retired ? (opts.retired === 'a' ? 'b' : 'a') : opts.winner ?? decided(x) ?? leader(x);
  if (!winner) throw new ApiError('tie');
  const score: [number, number] | null = sa + sb > 0 ? [sa, sb] : null;
  if (x.cup_game_id) armCupGame(x.cup_game_id);
  const res = await recordMatch(user, { league: x.league_id, a: x.a, b: x.b, winner, score });
  if (x.challenge_id) await completeChallenge(user, x.challenge_id, res.matchId).catch(() => {});
  if (x.cup_game_id) await linkCupMatch(x.cup_game_id, res.matchId).catch(() => {});
  const now = Date.now();
  if (x.paused_at) { x.paused_ms += now - ms(x.paused_at); x.paused_at = null; }
  x.state = 'done'; x.ended_at = iso(now); x.match_id = res.matchId; x.retired = opts.retired ?? null; x.pending = !!res.pending;
  await save();
  return { matchId: res.matchId, pending: res.pending };
}

// Stop, no result: nothing is rated.
export async function abandonLive(user: User, id: string, reason: string | null) {
  const { x } = await mine(user, id);
  if (!isActive(x)) return;
  const now = Date.now();
  if (x.paused_at) { x.paused_ms += now - ms(x.paused_at); x.paused_at = null; }
  x.state = 'abandoned'; x.ended_at = iso(now); x.reason = reason;
  await save();
}

/* ---------- spectators ---------- */

export async function watchLive(user: User, id: string) {
  const d = await db();
  const x = list(d).find((y) => y.id === id);
  const me = x && meIn(d, x.league_id, user);
  if (!x || !me || players(x).includes(me.id) || !isActive(x)) return;
  x.spectators[me.id] = iso(Date.now());
  x.peak = Math.max(x.peak, viewers(x));
  await save();
}

export async function reactLive(user: User, id: string, emoji: string) {
  const { x, me } = await mine(user, id, false);
  if (!isActive(x) || x.visibility !== 'league') return false;
  const last = [...x.reacts].reverse().find((r) => r.member_id === me.id);
  if (last && Date.now() - ms(last.at) < REACT_GAP) return false;
  pushReact(x, { emoji, member_id: me.id, at: iso(Date.now()) });
  await save();
  return true;
}

export async function sayLive(user: User, id: string, body: string) {
  const { d, x, me } = await mine(user, id, false);
  const text = body.trim().slice(0, 200);
  if (!text || x.visibility !== 'league' || !isOn(d.leagues.find((l) => l.id === x.league_id), 'chat')) return;
  const last = [...x.chat].reverse().find((l) => l.member_id === me.id);
  if (last && Date.now() - ms(last.at) < CHAT_GAP) throw new ApiError('slow down');
  assertCanPost(d, x.league_id, me.id); // K11.3
  const clean = filterText(text, chatSettings(d, x.league_id).filter);
  if (clean == null) throw new ApiError('not allowed');
  x.chat.push({ id: uid(), member_id: me.id, body: clean, at: iso(Date.now()) });
  if (x.chat.length > CHAT_MAX) x.chat.splice(0, x.chat.length - CHAT_MAX);
  await save();
}
