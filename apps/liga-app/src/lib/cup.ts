// Weekly cup (G1, G2): sign up, draw, knockout with byes, ready, walkover, champion, trophy cabinet.
// Everything time based resolves lazily on read, in the league time zone. Bot members (user_id null)
// sign up, get ready and play their cup matches by themselves over the week.
// No entry fee, ever: prizes come from the league, a coin stake would turn the cup into betting (04, ethics).
import { ApiError, applyMatch, notify, replayLeague, uid, type DB, type StoredLeague } from '@/lib/engine';
import { db, save, wait, type User } from '@/lib/api';
import { eloPreview } from '@/lib/elo';
import { isOn } from '@/lib/modules';
import type { Member } from '@/lib/types';

/* ---------- time in the league time zone ---------- */

export const H = 3600000;
export const DAY = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);
export const tzOf = (l?: { timezone?: string } | null) => l?.timezone || 'Europe/Budapest';

type Parts = { y: number; mo: number; d: number; h: number; mi: number };
export function parts(at: number, tz: string): Parts {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
  } catch {
    const x = new Date(at);
    return { y: x.getFullYear(), mo: x.getMonth() + 1, d: x.getDate(), h: x.getHours(), mi: x.getMinutes() };
  }
}
const offset = (at: number, tz: string) => { const p = parts(at, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(at / 60000) * 60000; };
// Wall clock time in the league time zone to a timestamp (day may overflow, Date.UTC handles it).
export function zoned(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
  const g = Date.UTC(y, mo - 1, d, h, mi);
  const first = g - offset(g, tz);
  return g - offset(first, tz);
}
// Monday of the week (league time) and its ISO week number.
export function weekOf(at: number, tz: string) {
  const p = parts(at, tz);
  const dow = (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(p.y, p.mo - 1, p.d - dow));
  const th = new Date(mon.getTime() + 3 * DAY);
  const no = Math.floor((th.getTime() - Date.UTC(th.getUTCFullYear(), 0, 1)) / DAY / 7) + 1;
  return { y: mon.getUTCFullYear(), mo: mon.getUTCMonth() + 1, d: mon.getUTCDate(), no, key: `${th.getUTCFullYear()}-W${no}` };
}
type Week = ReturnType<typeof weekOf>;
// day: 1 Monday to 7 Sunday.
const atWeek = (w: Week, day: number, hour: number, tz: string) => zoned(w.y, w.mo, w.d + day - 1, hour, 0, tz);
export const dayKey = (at: number, tz: string) => { const p = parts(at, tz); return `${p.y}-${p.mo}-${p.d}`; };
export const weekday = (at: number, tz: string) => { const p = parts(at, tz); return (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7 + 1; };

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (at: number | string, tz: string) => { const p = parts(typeof at === 'string' ? ms(at) : at, tz); return `${p.h}:${pad(p.mi)}`; };
export const dayHm = (at: number | string, tz: string) => { const x = typeof at === 'string' ? ms(at) : at; return `${DAYS[weekday(x, tz) - 1]} ${hm(x, tz)}`; };
export function countdown(until: number, now = Date.now(), seconds = false) {
  const s = Math.max(0, Math.floor((until - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (seconds && s < 86400) return `${h}:${pad(m)}:${pad(s % 60)}`;
  if (d > 0) return `${d} d ${h} h ${m} min`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

// Deterministic 0..1 from a string, so bots behave the same on every read.
export function h01(s: string) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return ((x >>> 0) % 100000) / 100000;
}

/* ---------- settings (G2, B4.5) ---------- */

export type CupSettings = {
  openDay: number; openHour: number; closeHour: number; finalDay: number; finalHour: number;
  min: number; max: number; seeding: 'rating' | 'random'; walkover: 'seed' | 'admin'; minMatches: boolean; reminders: boolean;
  winnerCoins: number; runnerUpCoins: number; pausedUntil: string | null; skipWeek: string | null;
};
export const CUP_DEFAULTS: CupSettings = {
  openDay: 1, openHour: 8, closeHour: 12, finalDay: 5, finalHour: 17, min: 3, max: 16, seeding: 'rating', walkover: 'seed',
  minMatches: true, reminders: true, winnerCoins: 300, runnerUpCoins: 100, pausedUntil: null, skipWeek: null,
};
export const settingsOf = (d: DB, leagueId: string): CupSettings => ({ ...CUP_DEFAULTS, ...(d.cupSettings?.[leagueId] ?? {}) });

/* ---------- data ---------- */

export type GameStatus = 'waiting' | 'open' | 'played' | 'wo' | 'bye';
export type CupGame = {
  id: string; round: number; slot: number; a: string | null; b: string | null; seed_a: number | null; seed_b: number | null;
  deadline: string; opened_at: string | null; ready: Record<string, string>; nudged: Record<string, string>;
  status: GameStatus; winner: string | null; match_id: string | null; score: [number, number] | null;
  note: string | null; planned_at: string | null; ended_at: string | null; pending_match?: string | null;
};
export type CupStatus = 'upcoming' | 'signup' | 'running' | 'done' | 'cancelled';
export type Cup = {
  id: string; league_id: string; week_key: string; week_no: number; opens_at: string; draw_at: string; final_at: string;
  status: CupStatus; entrants: { member_id: string; at: string }[]; waitlist: { member_id: string; at: string }[];
  seeds: string[]; rounds: number; games: CupGame[]; champion_id: string | null; runner_up_id: string | null;
  final_score: [number, number] | null; reason: string | null; max: number; prizes: { winner: number; runner: number };
  events: { at: string; by: string | null; text: string }[]; seen: Record<string, string[]>; ghost?: boolean;
};

const cups = (d: DB) => (d.cups = d.cups ?? []);
const member = (d: DB, id: string | null) => (id ? d.members.find((m) => m.id === id) : undefined);
const nameOf = (d: DB, id: string | null) => member(d, id)?.display_name ?? 'Someone';
const isBot = (d: DB, id: string | null) => !!id && member(d, id)?.user_id === null;
const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
const leagueOf = (d: DB, id: string) => d.leagues.find((l) => l.id === id);

export const roundName = (r: number, rounds: number) => {
  const left = rounds - r;
  return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : `Round ${r + 1}`;
};
export const roundShort = (r: number, rounds: number) => {
  const left = rounds - r;
  return left === 1 ? 'Final' : left === 2 ? 'Semis' : left === 3 ? 'Quarters' : `Round ${r + 1}`;
};
export const gameOf = (c: Cup, round: number, slot: number) => c.games.find((g) => g.round === round && g.slot === slot);
export const seedOf = (c: Cup, id: string | null) => (id ? c.seeds.indexOf(id) + 1 || null : null);
export const winnerIsA = (g: CupGame) => !!g.winner && g.winner === g.a;

// Standard bracket order so seed 1 and 2 can only meet in the final: 1, 8, 4, 5, 2, 7, 3, 6.
export function seedOrder(size: number): number[] {
  let o = [1];
  while (o.length < size) { const n = o.length * 2; o = o.flatMap((s) => [s, n + 1 - s]); }
  return o;
}

/* ---------- cycle ---------- */

function createCup(d: DB, l: StoredLeague, w: Week): Cup {
  const tz = tzOf(l), cfg = settingsOf(d, l.id);
  const opens = atWeek(w, cfg.openDay, cfg.openHour, tz);
  const c: Cup = {
    id: uid(), league_id: l.id, week_key: w.key, week_no: w.no,
    opens_at: iso(opens), draw_at: iso(atWeek(w, cfg.openDay, cfg.closeHour, tz)), final_at: iso(atWeek(w, cfg.finalDay, cfg.finalHour, tz)),
    status: 'upcoming', entrants: [], waitlist: [], seeds: [], rounds: 0, games: [], champion_id: null, runner_up_id: null,
    final_score: null, reason: null, max: cfg.max, prizes: { winner: cfg.winnerCoins, runner: cfg.runnerUpCoins }, events: [], seen: {},
  };
  if (cfg.skipWeek === w.key) { c.status = 'cancelled'; c.reason = 'No cup this week, the league takes a break.'; }
  else if (cfg.pausedUntil && ms(cfg.pausedUntil) > opens) { c.status = 'cancelled'; c.reason = `Cup paused until ${new Date(cfg.pausedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`; }
  cups(d).push(c);
  return c;
}

function roundDeadlines(c: Cup, rounds: number, l: StoredLeague) {
  const tz = tzOf(l), draw = ms(c.draw_at), fin = ms(c.final_at);
  const w = weekOf(ms(c.opens_at), tz);
  const finalDay = weekday(fin, tz);
  const out: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const before = rounds - 1 - r;
    if (!before) { out.push(fin); continue; }
    const cand = atWeek(w, finalDay - before, 18, tz);
    out.push(cand > draw + 4 * H && cand < fin ? cand : draw + ((fin - draw) * (r + 1)) / rounds);
  }
  return out;
}

const eligible = (d: DB, m: Member, cfg: CupSettings) => !m.status && (!cfg.minMatches || m.wins + m.losses > 0);

function draw(d: DB, c: Cup, l: StoredLeague) {
  const cfg = settingsOf(d, l.id);
  const list = c.entrants.map((e) => member(d, e.member_id)).filter((m): m is Member => !!m && !m.status);
  const seeds = cfg.seeding === 'rating'
    ? [...list].sort((a, b) => b.rating - a.rating)
    : [...list].sort((a, b) => h01(c.id + a.id) - h01(c.id + b.id));
  const n = seeds.length;
  let size = 2;
  while (size < n) size *= 2;
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const dl = roundDeadlines(c, rounds, l);
  c.seeds = seeds.map((m) => m.id);
  c.rounds = rounds;
  c.games = [];
  for (let r = 0; r < rounds; r++) {
    for (let s = 0; s < size / 2 ** (r + 1); s++) {
      c.games.push({ id: uid(), round: r, slot: s, a: null, b: null, seed_a: null, seed_b: null, deadline: iso(dl[r]), opened_at: null,
        ready: {}, nudged: {}, status: 'waiting', winner: null, match_id: null, score: null, note: null, planned_at: null, ended_at: null });
    }
  }
  for (const g of c.games.filter((x) => x.round === 0)) {
    const sa = order[g.slot * 2], sb = order[g.slot * 2 + 1];
    g.a = sa <= n ? c.seeds[sa - 1] : null; g.seed_a = sa <= n ? sa : null;
    g.b = sb <= n ? c.seeds[sb - 1] : null; g.seed_b = sb <= n ? sb : null;
    if (g.a && g.b) { g.status = 'open'; g.opened_at = c.draw_at; }
    else { g.status = 'bye'; g.winner = g.a ?? g.b; g.ended_at = c.draw_at; advance(d, c, g); }
  }
  c.status = 'running';
}

// Moves a decided game's winner into the next round, or crowns the champion after the final.
function advance(d: DB, c: Cup, g: CupGame) {
  if (g.round === c.rounds - 1) { finish(d, c, g); return; }
  const next = gameOf(c, g.round + 1, Math.floor(g.slot / 2));
  if (!next) return;
  const side = g.slot % 2 === 0 ? 'a' : 'b';
  next[side] = g.winner;
  next[side === 'a' ? 'seed_a' : 'seed_b'] = seedOf(c, g.winner);
  if (next.a && next.b && next.status === 'waiting') { next.status = 'open'; next.opened_at = iso(Math.max(ms(c.draw_at), ms(g.ended_at))); }
}

function finish(d: DB, c: Cup, g: CupGame) {
  c.status = 'done';
  c.champion_id = g.winner;
  c.runner_up_id = g.winner === g.a ? g.b : g.a;
  c.final_score = g.score ? (g.winner === g.a ? g.score : [g.score[1], g.score[0]]) : null;
  if (c.ghost) return;
  for (const m of d.members.filter((x) => x.league_id === c.league_id && x.user_id && !x.status && x.id !== c.champion_id)) {
    notify(d, { league_id: c.league_id, member_id: m.id, kind: 'cup.champion', title: `${nameOf(d, c.champion_id)} is the cup champion 🏆`,
      body: `Week ${c.week_no}. ${m.id === c.runner_up_id ? 'You made the final, well played.' : 'See the bracket.'}`, href: `/cup/bracket?id=${c.id}` });
  }
}

function decide(d: DB, c: Cup, g: CupGame, winner: string, at: number, status: 'played' | 'wo', note: string | null, matchId: string | null = null, score: [number, number] | null = null) {
  g.winner = winner; g.status = status; g.ended_at = iso(at); g.note = note; g.match_id = matchId; g.score = score;
  advance(d, c, g);
}

const tell = (d: DB, c: Cup, id: string | null, title: string, body: string, href: string, kind: string) => {
  if (!id || isBot(d, id) || c.ghost) return;
  notify(d, { league_id: c.league_id, member_id: id, kind, title, body, href });
};

function walkover(d: DB, c: Cup, g: CupGame) {
  const ra = !!g.ready[g.a!], rb = !!g.ready[g.b!];
  const higher = (g.seed_a ?? 99) <= (g.seed_b ?? 99) ? g.a! : g.b!;
  const w = ra && !rb ? g.a! : rb && !ra ? g.b! : higher;
  const loser = w === g.a ? g.b! : g.a!;
  const note = ra !== rb ? `${nameOf(d, w)} was ready, ${nameOf(d, loser)} wasn't. ${nameOf(d, w)} goes through on a walkover.` : `Not played in time. ${nameOf(d, w)} goes through as the higher seed.`;
  decide(d, c, g, w, ms(g.deadline), 'wo', note);
  for (const id of [g.a, g.b]) tell(d, c, id, `${roundName(g.round, c.rounds)} closed`, note, `/cup/game/${g.id}`, 'cup.walkover');
}

// Bot timing for one game: when each bot side is ready and when two bots play it.
const botReadyAt = (c: Cup, g: CupGame, id: string) => ms(g.opened_at) + (10 + h01(g.id + id + 'r') * 110) * 60000;
const botPlayAt = (g: CupGame) => { const o = ms(g.opened_at); return o + (0.15 + 0.6 * h01(g.id + 'p')) * Math.max(H, ms(g.deadline) - o); };

function botPlay(d: DB, c: Cup, g: CupGame, at: number) {
  const l = leagueOf(d, c.league_id)!;
  const A = member(d, g.a)!, B = member(d, g.b)!;
  const chanceA = eloPreview(A.rating, B.rating, l.k_factor).chanceA;
  const aWins = h01(g.id + 'w') < chanceA;
  if (c.ghost) { decide(d, c, g, aWins ? A.id : B.id, at, 'played', null); return; }
  const later = d.matches.some((m) => m.league_id === l.id && ms(m.played_at) > at);
  const res = applyMatch(d, l.id, [A.id], [B.id], aWins ? 'a' : 'b', 'bot', null, new Date(at));
  if (later) replayLeague(d, l.id);
  decide(d, c, g, aWins ? A.id : B.id, at, 'played', null, res.matchId);
}

function step(d: DB, l: StoredLeague, c: Cup, now: number) {
  const cfg = settingsOf(d, l.id);
  const tz = tzOf(l);
  if (c.status === 'upcoming' && now >= ms(c.opens_at)) {
    c.status = 'signup';
    if (!c.ghost) for (const m of d.members.filter((x) => x.league_id === l.id && x.user_id && !x.status)) {
      notify(d, { league_id: l.id, member_id: m.id, kind: 'cup.open', title: 'Weekly cup is open 🏆', body: `Sign up by ${hm(c.draw_at, tz)}.`, href: '/cup' });
    }
  }
  if (c.status === 'signup') {
    const cut = Math.min(now, ms(c.draw_at));
    for (const m of d.members.filter((x) => x.league_id === l.id && x.user_id === null && eligible(d, x, cfg))) {
      if (h01(c.id + m.id + 's') > 0.9 || c.entrants.some((e) => e.member_id === m.id) || c.waitlist.some((e) => e.member_id === m.id)) continue;
      const at = ms(c.opens_at) + h01(c.id + m.id + 't') * (ms(c.draw_at) - ms(c.opens_at)) * 0.9;
      if (at > cut) continue;
      (c.entrants.length < c.max ? c.entrants : c.waitlist).push({ member_id: m.id, at: iso(at) });
    }
    c.entrants.sort((a, b) => a.at.localeCompare(b.at));
    if (now >= ms(c.draw_at)) {
      if (c.entrants.length < cfg.min) {
        c.status = 'cancelled';
        c.reason = `No cup this week. Only ${c.entrants.length} signed up.`;
        for (const e of c.entrants) tell(d, c, e.member_id, 'No cup this week', `Only ${c.entrants.length} signed up. See you next week.`, '/cup', 'cup.cancelled');
      } else {
        draw(d, c, l);
        for (const id of c.seeds) {
          const g = c.games.find((x) => x.round === 0 && (x.a === id || x.b === id));
          if (!g) continue;
          const opp = g.a === id ? g.b : g.a;
          const rn = roundName(0, c.rounds).toLowerCase();
          tell(d, c, id, opp ? `The draw is out. You play ${nameOf(d, opp)}.` : 'You got a bye',
            opp ? `Your ${rn} is due ${dayHm(g.deadline, tz)}.` : `Straight to the next round.`, '/cup/draw', 'cup.draw');
        }
      }
    }
  }
  if (c.status !== 'running') return;
  for (let r = 0; r < c.rounds && c.status === 'running'; r++) {
    for (const g of c.games.filter((x) => x.round === r && x.status === 'open')) {
      for (const id of [g.a!, g.b!]) {
        if (!isBot(d, id) && !c.ghost) continue;
        const t = botReadyAt(c, g, id);
        if (!g.ready[id] && t <= now && t < ms(g.deadline)) {
          g.ready[id] = iso(t);
          const other = id === g.a ? g.b : g.a;
          tell(d, c, other, `${nameOf(d, id)} is ready for your ${roundName(g.round, c.rounds).toLowerCase()}`, `Play by ${dayHm(g.deadline, tz)}.`, `/cup/game/${g.id}`, 'cup.ready');
        }
      }
      const bots = c.ghost || (isBot(d, g.a) && isBot(d, g.b));
      const playAt = botPlayAt(g);
      if (bots && playAt <= now && playAt < ms(g.deadline)) { botPlay(d, c, g, playAt); continue; }
      if (ms(g.deadline) <= now && cfg.walkover === 'seed') walkover(d, c, g);
    }
  }
}

// Reverts a cup game whose match was undone or deleted, as long as the next round has not used it.
function revertUndone(d: DB, c: Cup) {
  let changed = false;
  for (const g of c.games) {
    if (g.status !== 'played' || !g.match_id || d.matches.some((m) => m.id === g.match_id)) continue;
    const next = gameOf(c, g.round + 1, Math.floor(g.slot / 2));
    if (next && (next.status === 'played' || next.status === 'wo')) continue;
    if (next) {
      const side = g.slot % 2 === 0 ? 'a' : 'b';
      next[side] = null; next[side === 'a' ? 'seed_a' : 'seed_b'] = null; next.status = 'waiting'; next.opened_at = null; next.ready = {};
    } else { c.status = 'running'; c.champion_id = null; c.runner_up_id = null; c.final_score = null; }
    g.status = 'open'; g.winner = null; g.match_id = null; g.score = null; g.ended_at = null;
    changed = true;
  }
  return changed;
}

// Demo league only: three finished cups from the weeks before, so history, champions and cabinets are not empty.
function backfillDemo(d: DB, l: StoredLeague, now: number) {
  if (l.id !== 'lg_demo' || cups(d).some((c) => c.league_id === l.id)) return;
  const tz = tzOf(l);
  for (let k = 3; k >= 1; k--) {
    const w = weekOf(now - k * 7 * DAY, tz);
    const c = createCup(d, l, w);
    c.ghost = true;
    step(d, l, c, ms(c.final_at) + H);
  }
}

// Brings every cup of a league up to `now`. Returns the current week's cup.
export function resolveCups(d: DB, leagueId: string, now = Date.now()) {
  const l = leagueOf(d, leagueId);
  if (!l || !isOn(l, 'cup')) return null;
  backfillDemo(d, l, now);
  const w = weekOf(now, tzOf(l));
  let cur = cups(d).find((c) => c.league_id === l.id && c.week_key === w.key);
  if (!cur && !l.archived_at) cur = createCup(d, l, w);
  for (const c of cups(d).filter((x) => x.league_id === l.id && !x.ghost && x.status !== 'cancelled')) {
    if (revertUndone(d, c) || c.status !== 'done') step(d, l, c, now);
  }
  return cur ?? null;
}

/* ---------- logging a cup match through the normal log flow ---------- */

let armed: string | null = null;
// log.tsx calls this right before recordMatch; the match hook below then advances the bracket.
export function armCupGame(gameId: string | null) { armed = gameId; }

// Match hook: the armed game (logged just now), or a game waiting for this match to be confirmed.
export function cupMatchHook(d: DB, matchId: string) {
  const id = armed;
  armed = null;
  const c = cups(d).find((x) => x.games.some((g) => g.status === 'open' && (g.id === id || g.pending_match === matchId)));
  const g = c?.games.find((x) => x.status === 'open' && (x.id === id || x.pending_match === matchId));
  const m = d.matches.find((x) => x.id === matchId);
  if (!c || !g || !m) return;
  const rows = d.mps.filter((p) => p.match_id === matchId);
  const A = rows.length ? rows.filter((p) => p.side === 'a').map((p) => p.member_id) : m.sides?.a ?? [];
  const B = rows.length ? rows.filter((p) => p.side === 'b').map((p) => p.member_id) : m.sides?.b ?? [];
  if (A.length !== 1 || B.length !== 1 || A[0] === B[0] || ![g.a, g.b].includes(A[0]) || ![g.a, g.b].includes(B[0])) return;
  const w = m.winner === 'a' ? A[0] : B[0];
  const score: [number, number] | null = m.score_a != null && m.score_b != null ? (A[0] === g.a ? [m.score_a, m.score_b] : [m.score_b, m.score_a]) : null;
  g.pending_match = null;
  decide(d, c, g, w, ms(m.played_at), 'played', null, matchId, score);
  if (g.round < c.rounds - 1) {
    const next = gameOf(c, g.round + 1, Math.floor(g.slot / 2));
    const other = next ? (next.a === w ? next.b : next.a) : null;
    tell(d, c, w === g.a ? g.b : g.a, "You're out of the cup", `${nameOf(d, w)} goes through. Thanks for playing.`, `/cup/bracket?id=${c.id}`, 'cup.result');
    if (other) tell(d, c, other, `${nameOf(d, w)} is your next opponent`, `${roundName(g.round + 1, c.rounds)}, play by ${dayHm(next!.deadline, tzOf(leagueOf(d, c.league_id)))}.`, `/cup/game/${next!.id}`, 'cup.next');
  }
}

// After recordMatch: if the match waits for confirmation, the game remembers it and the hook advances it later.
export async function linkCupMatch(gameId: string, matchId: string) {
  armed = null;
  const d = await db();
  const g = cups(d).flatMap((c) => c.games).find((x) => x.id === gameId);
  if (!g || g.status !== 'open' || g.match_id === matchId) return;
  g.pending_match = matchId;
  await save();
}

/* ---------- reads for screens ---------- */

async function fresh(leagueId: string) {
  const d = await db();
  const before = JSON.stringify(d.cups ?? []) + (d.notices?.length ?? 0) + d.matches.length;
  const cur = resolveCups(d, leagueId);
  if (JSON.stringify(d.cups ?? []) + (d.notices?.length ?? 0) + d.matches.length !== before) await save();
  return { d, cur };
}

export type CupView = { cup: Cup | null; cfg: CupSettings; past: Cup[]; tz: string; eligible: boolean };
export async function cupHome(user: User, leagueId: string): Promise<CupView> {
  const { d, cur } = await fresh(leagueId);
  const l = leagueOf(d, leagueId);
  const me = meIn(d, leagueId, user);
  const cfg = settingsOf(d, leagueId);
  const past = cups(d).filter((c) => c.league_id === leagueId && c.status === 'done' && c.id !== cur?.id).sort((a, b) => b.opens_at.localeCompare(a.opens_at));
  return { cup: cur ? structuredCopy(cur) : null, cfg, past: past.map(structuredCopy), tz: tzOf(l), eligible: !!me && eligible(d, me, cfg) };
}
const structuredCopy = <X,>(x: X): X => JSON.parse(JSON.stringify(x));

export async function getCup(leagueId: string, cupId?: string) {
  const { d, cur } = await fresh(leagueId);
  const c = cupId ? cups(d).find((x) => x.id === cupId) : cur;
  return c ? { cup: structuredCopy(c), tz: tzOf(leagueOf(d, c.league_id)), cfg: settingsOf(d, c.league_id) } : null;
}

export async function getGame(gameId: string) {
  const d = await db();
  const c0 = cups(d).find((x) => x.games.some((g) => g.id === gameId));
  if (!c0) return null;
  await fresh(c0.league_id);
  const c = cups(d).find((x) => x.id === c0.id)!;
  const g = c.games.find((x) => x.id === gameId)!;
  const h2h = { a: 0, b: 0, last: [] as { id: string; winner: string; at: string }[] };
  if (g.a && g.b) {
    const ids = new Set(d.mps.filter((p) => p.member_id === g.a).map((p) => p.match_id));
    const shared = d.matches.filter((m) => ids.has(m.id) && m.format === '1v1' && d.mps.some((p) => p.match_id === m.id && p.member_id === g.b))
      .sort((x, y) => y.played_at.localeCompare(x.played_at));
    for (const m of shared) {
      const side = d.mps.find((p) => p.match_id === m.id && p.member_id === g.a)!.side;
      const w: string = side === m.winner ? g.a! : g.b!;
      if (w === g.a) h2h.a++; else h2h.b++;
      if (h2h.last.length < 2) h2h.last.push({ id: m.id, winner: w, at: m.played_at });
    }
  }
  return { cup: structuredCopy(c), game: structuredCopy(g), h2h, tz: tzOf(leagueOf(d, c.league_id)), cfg: settingsOf(d, c.league_id) };
}

export async function pastCups(leagueId: string) {
  const { d } = await fresh(leagueId);
  const now = weekOf(Date.now(), tzOf(leagueOf(d, leagueId))).key;
  return cups(d).filter((c) => c.league_id === leagueId && (c.status === 'done' || (c.status === 'cancelled' && c.week_key !== now)))
    .sort((a, b) => b.opens_at.localeCompare(a.opens_at)).map(structuredCopy);
}

// G1.8 trophy cabinet, from the finished cups (the server keeps this as players.cup_stats).
export async function cabinet(leagueId: string, memberId: string) {
  const { d } = await fresh(leagueId);
  const list = cups(d).filter((c) => c.league_id === leagueId && c.status === 'done').sort((a, b) => a.opens_at.localeCompare(b.opens_at));
  const shelf: { cup_id: string; week_no: number; kind: 'won' | 'final' | 'entered'; round: string }[] = [];
  let run = 0, best = 0;
  for (const c of list) {
    if (!c.seeds.includes(memberId)) continue;
    const won = c.champion_id === memberId;
    run = won ? run + 1 : 0; best = Math.max(best, run);
    const lost = c.games.find((g) => g.status !== 'bye' && (g.a === memberId || g.b === memberId) && g.winner && g.winner !== memberId);
    shelf.push({ cup_id: c.id, week_no: c.week_no, kind: won ? 'won' : c.runner_up_id === memberId ? 'final' : 'entered', round: won ? 'Champion' : lost ? `Out in the ${roundName(lost.round, c.rounds).toLowerCase()}` : 'Entered' });
  }
  return { wins: shelf.filter((s) => s.kind === 'won').length, finals: shelf.filter((s) => s.kind !== 'entered').length, entries: shelf.length, best, shelf: shelf.reverse() };
}

/* ---------- writes ---------- */

async function writable(user: User, leagueId: string) {
  await wait(150);
  const { d, cur } = await fresh(leagueId);
  const me = meIn(d, leagueId, user);
  if (!me) throw new ApiError('not a member');
  return { d, cur, me };
}

export async function signUp(user: User, leagueId: string) {
  const { d, cur, me } = await writable(user, leagueId);
  const cfg = settingsOf(d, leagueId);
  if (!cur || cur.status !== 'signup') throw new ApiError('sign up closed');
  if (!eligible(d, me, cfg)) throw new ApiError('play a match first');
  if (cur.entrants.some((e) => e.member_id === me.id) || cur.waitlist.some((e) => e.member_id === me.id)) return;
  (cur.entrants.length < cur.max ? cur.entrants : cur.waitlist).push({ member_id: me.id, at: new Date().toISOString() });
  await save();
}

export async function withdraw(user: User, leagueId: string, memberId?: string) {
  const { d, cur, me } = await writable(user, leagueId);
  if (!cur || cur.status !== 'signup') throw new ApiError('sign up closed');
  const id = memberId ?? me.id;
  if (memberId && memberId !== me.id && !admin(me)) throw new ApiError('not allowed');
  cur.waitlist = cur.waitlist.filter((e) => e.member_id !== id);
  if (cur.entrants.some((e) => e.member_id === id)) {
    cur.entrants = cur.entrants.filter((e) => e.member_id !== id);
    const next = cur.waitlist.shift();
    if (next) { cur.entrants.push({ member_id: next.member_id, at: new Date().toISOString() }); tell(d, cur, next.member_id, "You're in the cup", 'A spot opened up from the waitlist.', '/cup', 'cup.waitlist'); }
  }
  await save();
}

export async function setReady(user: User, gameId: string, on: boolean) {
  const d = await db();
  const c = cups(d).find((x) => x.games.some((g) => g.id === gameId));
  if (!c) throw new ApiError('unknown game');
  const { me } = await writable(user, c.league_id);
  const g = c.games.find((x) => x.id === gameId)!;
  if (g.status !== 'open' || (g.a !== me.id && g.b !== me.id)) throw new ApiError('not your game');
  if (on) {
    g.ready[me.id] = new Date().toISOString();
    tell(d, c, g.a === me.id ? g.b : g.a, `${me.display_name} is ready for your ${roundName(g.round, c.rounds).toLowerCase()}`, `Play by ${dayHm(g.deadline, tzOf(leagueOf(d, c.league_id)))}.`, `/cup/game/${g.id}`, 'cup.ready');
  } else delete g.ready[me.id];
  await save();
}

export async function nudge(user: User, gameId: string) {
  const d = await db();
  const c = cups(d).find((x) => x.games.some((g) => g.id === gameId));
  if (!c) throw new ApiError('unknown game');
  const { me } = await writable(user, c.league_id);
  const g = c.games.find((x) => x.id === gameId)!;
  const other = g.a === me.id ? g.b : g.b === me.id ? g.a : null;
  if (!other) throw new ApiError('not your game');
  if (Date.now() - ms(g.nudged[me.id]) < DAY) throw new ApiError('nudged today');
  g.nudged[me.id] = new Date().toISOString();
  tell(d, c, other, `${me.display_name} nudged you`, `Your ${roundName(g.round, c.rounds).toLowerCase()} is due ${dayHm(g.deadline, tzOf(leagueOf(d, c.league_id)))}.`, `/cup/game/${g.id}`, 'cup.nudge');
  await save();
}

export async function suggestTime(user: User, gameId: string, at: string) {
  const d = await db();
  const c = cups(d).find((x) => x.games.some((g) => g.id === gameId));
  if (!c) throw new ApiError('unknown game');
  const { me } = await writable(user, c.league_id);
  const g = c.games.find((x) => x.id === gameId)!;
  if (g.a !== me.id && g.b !== me.id && !admin(me)) throw new ApiError('not your game');
  g.planned_at = at;
  const tz = tzOf(leagueOf(d, c.league_id));
  tell(d, c, g.a === me.id ? g.b : g.a, `${me.display_name} suggests ${dayHm(at, tz)}`, `For your ${roundName(g.round, c.rounds).toLowerCase()}.`, `/cup/game/${g.id}`, 'cup.time');
  await save();
}

export async function markSeen(user: User, cupId: string, what: 'draw' | 'champion') {
  const d = await db();
  const c = cups(d).find((x) => x.id === cupId);
  const me = c && meIn(d, c.league_id, user);
  if (!c || !me) return;
  const s = (c.seen[me.id] = c.seen[me.id] ?? []);
  if (!s.includes(what)) { s.push(what); await save(); }
}

/* ---------- admin (G2, G2.1) ---------- */

const admin = (m: Member) => m.role === 'owner' || m.role === 'admin';
async function asAdmin(user: User, leagueId: string) {
  const x = await writable(user, leagueId);
  if (!admin(x.me)) throw new ApiError('not allowed');
  return x;
}
const audit = (c: Cup, by: Member, text: string) => c.events.push({ at: new Date().toISOString(), by: by.id, text });

export async function saveCupSettings(user: User, leagueId: string, p: Partial<CupSettings>, opts: { thisWeek: boolean; on?: boolean }) {
  const { d, cur, me } = await asAdmin(user, leagueId);
  const prev = settingsOf(d, leagueId);
  d.cupSettings = d.cupSettings ?? {};
  d.cupSettings[leagueId] = { ...(d.cupSettings[leagueId] ?? {}), ...p };
  const l = leagueOf(d, leagueId)!;
  if (opts.on !== undefined) l.modules = { ...(l.modules ?? {}), cup: opts.on };
  const cfg = settingsOf(d, leagueId);
  if (opts.thisWeek && cur && (cur.status === 'upcoming' || cur.status === 'signup')) {
    const tz = tzOf(l), w = weekOf(ms(cur.opens_at), tz);
    cur.opens_at = iso(atWeek(w, cfg.openDay, cfg.openHour, tz));
    cur.draw_at = iso(atWeek(w, cfg.openDay, cfg.closeHour, tz));
    cur.final_at = iso(atWeek(w, cfg.finalDay, cfg.finalHour, tz));
    cur.max = cfg.max; cur.prizes = { winner: cfg.winnerCoins, runner: cfg.runnerUpCoins };
    if (cur.status === 'signup' && Date.now() < ms(cur.opens_at)) cur.status = 'upcoming';
    audit(cur, me, 'Settings changed for this week');
  }
  if (prev.openDay !== cfg.openDay || prev.openHour !== cfg.openHour) {
    for (const m of d.members.filter((x) => x.league_id === leagueId && x.user_id && !x.status)) {
      notify(d, { league_id: leagueId, member_id: m.id, kind: 'cup.settings', title: `Cup now opens ${DAYS[cfg.openDay - 1]} ${cfg.openHour}:00`, body: `Sign up until ${cfg.closeHour}:00, final ${DAYS[cfg.finalDay - 1]} ${cfg.finalHour}:00.`, href: '/cup' });
    }
  }
  await save();
}

export async function adminEntrant(user: User, leagueId: string, memberId: string, add: boolean, reason: string) {
  const { d, cur, me } = await asAdmin(user, leagueId);
  if (!cur || (cur.status !== 'signup' && cur.status !== 'upcoming' && !(cur.status === 'running' && canRedraw(cur)))) throw new ApiError('too late');
  if (add) { if (!cur.entrants.some((e) => e.member_id === memberId)) cur.entrants.push({ member_id: memberId, at: new Date().toISOString() }); }
  else cur.entrants = cur.entrants.filter((e) => e.member_id !== memberId);
  cur.waitlist = cur.waitlist.filter((e) => e.member_id !== memberId);
  audit(cur, me, `${add ? 'Added' : 'Removed'} ${nameOf(d, memberId)}${reason ? `: ${reason}` : ''}`);
  tell(d, cur, memberId, add ? `${me.display_name} added you to the cup` : `${me.display_name} took you out of the cup`, reason || 'Changed by an admin.', '/cup', 'cup.admin');
  if (cur.status === 'running') redrawIn(d, cur);
  await save();
}

export const canRedraw = (c: Cup) => c.status === 'running' && !c.games.some((g) => g.status === 'played' || g.status === 'wo');
function redrawIn(d: DB, c: Cup) {
  const l = leagueOf(d, c.league_id)!;
  if (c.entrants.length < settingsOf(d, l.id).min) { c.status = 'cancelled'; c.reason = `No cup this week. Only ${c.entrants.length} signed up.`; return; }
  draw(d, c, l);
}

export async function redraw(user: User, leagueId: string, reason: string) {
  const { d, cur, me } = await asAdmin(user, leagueId);
  if (!cur || !canRedraw(cur)) throw new ApiError('first round has started');
  redrawIn(d, cur);
  audit(cur, me, `Redraw${reason ? `: ${reason}` : ''}`);
  for (const id of cur.seeds) tell(d, cur, id, 'The cup was drawn again', reason || `${me.display_name} made a new draw.`, '/cup/draw', 'cup.draw');
  cur.seen = {};
  await save();
}

export async function giveWalkover(user: User, gameId: string, winner: string, reason: string) {
  const d = await db();
  const c = cups(d).find((x) => x.games.some((g) => g.id === gameId));
  if (!c) throw new ApiError('unknown game');
  const { me } = await asAdmin(user, c.league_id);
  const g = c.games.find((x) => x.id === gameId)!;
  if (g.status !== 'open' || ![g.a, g.b].includes(winner)) throw new ApiError('not open');
  decide(d, c, g, winner, Date.now(), 'wo', reason || `Walkover given by ${me.display_name}.`);
  audit(c, me, `Walkover to ${nameOf(d, winner)}${reason ? `: ${reason}` : ''}`);
  for (const id of [g.a, g.b]) tell(d, c, id, `${nameOf(d, winner)} goes through on a walkover`, reason || `Decided by ${me.display_name}.`, `/cup/game/${g.id}`, 'cup.walkover');
  await save();
}

export async function extendDeadline(user: User, gameId: string, reason: string) {
  const d = await db();
  const c = cups(d).find((x) => x.games.some((g) => g.id === gameId));
  if (!c) throw new ApiError('unknown game');
  const { me } = await asAdmin(user, c.league_id);
  const g = c.games.find((x) => x.id === gameId)!;
  if (g.status !== 'open' && g.status !== 'waiting') throw new ApiError('already decided');
  g.deadline = iso(Math.max(ms(g.deadline), Date.now()) + DAY);
  audit(c, me, `${roundName(g.round, c.rounds)} deadline extended${reason ? `: ${reason}` : ''}`);
  const tz = tzOf(leagueOf(d, c.league_id));
  for (const id of [g.a, g.b]) tell(d, c, id, 'More time for your cup match', `New deadline ${dayHm(g.deadline, tz)}. ${reason}`.trim(), `/cup/game/${g.id}`, 'cup.admin');
  await save();
}

export async function cancelCup(user: User, leagueId: string, reason: string) {
  const { d, cur, me } = await asAdmin(user, leagueId);
  if (!cur || cur.status === 'done' || cur.status === 'cancelled') throw new ApiError('nothing to cancel');
  cur.status = 'cancelled';
  cur.reason = reason ? `Cup cancelled: ${reason}` : `Cup cancelled by ${me.display_name}.`;
  audit(cur, me, `Cancelled${reason ? `: ${reason}` : ''}`);
  for (const e of cur.entrants) tell(d, cur, e.member_id, "This week's cup is off", reason || `Cancelled by ${me.display_name}.`, '/cup', 'cup.cancelled');
  await save();
}

/* ---------- copy helpers ---------- */

export function rulesText(cfg: CupSettings) {
  const day = DAYS[cfg.openDay - 1], fin = DAYS[cfg.finalDay - 1];
  return [
    `Sign up ${day} ${cfg.openHour}:00 to ${cfg.closeHour}:00.${cfg.minMatches ? ' Everyone with at least 1 match can join.' : ''}`,
    `Draw at ${cfg.closeHour}:00, seeded ${cfg.seeding === 'rating' ? 'by rating' : 'at random'}.`,
    `${cfg.min} to ${cfg.max} players. When the bracket is not full, the top seeds get a bye.`,
    `Each round has a deadline, the final is ${fin} ${cfg.finalHour}:00.`,
    cfg.walkover === 'seed' ? 'Both ready? Play. Only one ready? They go through. Nobody? The higher seed goes through.' : 'Not played by the deadline? An admin decides.',
    'Cup matches count for rating. No entry fee, ever.',
  ];
}

// The member's open or next game in a cup, and whether they are still in.
export function myPath(c: Cup, memberId: string | undefined) {
  if (!memberId || !c.seeds.includes(memberId)) return { entered: false, alive: false, next: null as CupGame | null, games: [] as CupGame[] };
  const games = c.games.filter((g) => g.a === memberId || g.b === memberId).sort((a, b) => a.round - b.round);
  const lost = games.find((g) => g.winner && g.winner !== memberId);
  const next = games.find((g) => g.status === 'open') ?? null;
  return { entered: true, alive: !lost && c.status !== 'cancelled', next, games, lost: lost ?? null };
}

// Each player's chance to win the whole cup from here, by Elo over the remaining bracket (G1.4).
export function winChances(c: Cup, members: Member[], k = 32) {
  const rating = (id: string) => members.find((m) => m.id === id)?.rating ?? 1000;
  const memo = new Map<string, Map<string, number>>();
  const side = (g: CupGame, s: 'a' | 'b'): Map<string, number> => {
    const id = g[s];
    if (id) return new Map([[id, 1]]);
    const feeder = gameOf(c, g.round - 1, g.slot * 2 + (s === 'a' ? 0 : 1));
    return feeder ? dist(feeder) : new Map();
  };
  const dist = (g: CupGame): Map<string, number> => {
    if (memo.has(g.id)) return memo.get(g.id)!;
    let out = new Map<string, number>();
    if (g.winner) out.set(g.winner, 1);
    else {
      const A = side(g, 'a'), B = side(g, 'b');
      for (const [x, px] of A) for (const [y, py] of B) {
        const pa = eloPreview(rating(x), rating(y), k).chanceA;
        out.set(x, (out.get(x) ?? 0) + px * py * pa);
        out.set(y, (out.get(y) ?? 0) + px * py * (1 - pa));
      }
      if (!A.size) out = B;
      if (!B.size) out = A;
    }
    memo.set(g.id, out);
    return out;
  };
  const final = gameOf(c, c.rounds - 1, 0);
  return final ? dist(final) : new Map<string, number>();
}
