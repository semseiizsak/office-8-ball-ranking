// Pure engine for badges, titles, XP, levels and the weekly streak (G4, G5, R2.4, R1.5).
// No storage and no React: badges.ts and xp.ts wrap it. Everything is replayed from confirmed matches,
// so it always agrees with the history and works the same for bots and real players.
import { counts, type DB, type StoredMatch, type StoredMP } from '@/lib/engine';

const PROVISIONAL = 5; // same as stats.ts: matches before a player joins the ladder
const UPSET = 0.4; // same as stats.ts: winner's chance below this marks an upset
const DAY = 86400000;

/* ---------- catalogue ---------- */
export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'legend';
export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond', 'legend'];
export const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond', legend: 'Legend' };
export type Category = 'wins' | 'streaks' | 'social' | 'cup' | 'season' | 'doubles' | 'fun';
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'wins', label: 'Wins' }, { id: 'streaks', label: 'Streaks' }, { id: 'social', label: 'Social' }, { id: 'cup', label: 'Cup' },
  { id: 'season', label: 'Season' }, { id: 'doubles', label: 'Doubles' }, { id: 'fun', label: 'Fun' },
];

export type Metrics = {
  played: number; wins: number; upsets: number; kingWins: number; miracles: number; shutouts: number; closeWins: number;
  dayWins: number; perfectDay: number; dayPlayed: number; winRun: number; comebacks: number; weeks: number; peakGain: number;
  bigDay: number; opponents: number; paybacks: number; rivalry: number; duoWins: number; partners: number; nights: number;
  earlies: number; mondayWins: number; lossRun: number; closeLosses: number; ducks: number; cups: number; finals: number; podiums: number;
};
export type Metric = keyof Metrics;

export type BadgeDef = {
  id: string; name: string; icon: string; cat: Category; metric: Metric;
  goals: number[]; tiers: Tier[]; // one tier per step
  rule: (goal: number) => string; unit: (n: number) => string;
  secret?: boolean; fun?: boolean; module?: 'cup' | 'seasons';
};

const plural = (one: string, many: string) => (n: number) => `${n} ${n === 1 ? one : many}`;
const ladder = (goals: number[]) => ({ goals, tiers: TIERS });
const single = (tier: Tier, goal = 1) => ({ goals: [goal], tiers: [tier] });

export const CATALOGUE: BadgeDef[] = [
  { id: 'first_blood', name: 'First Blood', icon: 'swords', cat: 'wins', metric: 'wins', ...single('bronze'), rule: () => 'Win your first match', unit: plural('win', 'wins') },
  { id: 'trophy_hunter', name: 'Trophy Hunter', icon: 'trophy', cat: 'wins', metric: 'wins', ...ladder([5, 25, 50, 100, 250]), rule: (g) => `Win ${g} matches`, unit: plural('win', 'wins') },
  { id: 'century', name: 'Century', icon: 'hash', cat: 'wins', metric: 'played', ...ladder([10, 25, 50, 100, 250]), rule: (g) => `Play ${g} matches`, unit: plural('match', 'matches') },
  { id: 'giant_slayer', name: 'Giant Slayer', icon: 'zap', cat: 'wins', metric: 'upsets', ...ladder([1, 5, 15, 30, 60]), rule: (g) => (g === 1 ? 'Beat someone the odds favoured' : `Win ${g} matches as the underdog`), unit: plural('upset', 'upsets') },
  { id: 'regicide', name: 'Regicide', icon: 'crown', cat: 'wins', metric: 'kingWins', ...ladder([1, 3, 10, 25, 50]), rule: (g) => (g === 1 ? 'Beat the #1' : `Beat the #1 ${g} times`), unit: plural('win over the #1', 'wins over the #1') },
  { id: 'miracle', name: 'Miracle', icon: 'sparkles', cat: 'wins', metric: 'miracles', ...single('diamond'), secret: true, rule: () => 'Beat someone rated 200 or more above you', unit: plural('miracle', 'miracles') },
  { id: 'clean_sheet', name: 'Clean Sheet', icon: 'shield', cat: 'wins', metric: 'shutouts', ...ladder([1, 5, 15, 30, 60]), rule: (g) => (g === 1 ? 'Win without conceding a point' : `Win ${g} matches without conceding`), unit: plural('clean sheet', 'clean sheets') },
  { id: 'nail_biter', name: 'Nail Biter', icon: 'target', cat: 'wins', metric: 'closeWins', ...ladder([1, 5, 15, 30, 60]), rule: (g) => (g === 1 ? 'Win by a single point' : `Win ${g} matches by a single point`), unit: plural('close win', 'close wins') },
  { id: 'hat_trick', name: 'Hat Trick', icon: 'medal', cat: 'streaks', metric: 'dayWins', ...single('silver', 3), rule: () => 'Win 3 matches in one day', unit: plural('win today', 'wins in a day') },
  { id: 'perfect_day', name: 'Perfect Day', icon: 'sun', cat: 'streaks', metric: 'perfectDay', ...single('gold', 5), rule: () => 'Win 5 matches in a day without a loss', unit: plural('clean win in a day', 'clean wins in a day') },
  { id: 'marathon', name: 'Marathon', icon: 'timer', cat: 'streaks', metric: 'dayPlayed', ...single('gold', 10), rule: () => 'Play 10 matches in one day', unit: plural('match in a day', 'matches in a day') },
  { id: 'on_fire', name: 'On Fire', icon: 'flame', cat: 'streaks', metric: 'winRun', ...ladder([3, 5, 7, 10, 15]), rule: (g) => `Win ${g} in a row`, unit: plural('win in a row', 'wins in a row') },
  { id: 'comeback', name: 'Comeback', icon: 'rotate', cat: 'streaks', metric: 'comebacks', ...single('bronze'), rule: () => 'Win right after a rough patch of 3', unit: plural('comeback', 'comebacks') },
  { id: 'regular', name: 'Regular', icon: 'calendar', cat: 'streaks', metric: 'weeks', ...ladder([2, 4, 8, 16, 32]), rule: (g) => `Play in ${g} different weeks`, unit: plural('week', 'weeks') },
  { id: 'high_ground', name: 'High Ground', icon: 'mountain', cat: 'streaks', metric: 'peakGain', ...ladder([50, 100, 200, 300, 500]), rule: (g) => `Reach ${g} above your start rating`, unit: (n) => `+${n} rating` },
  { id: 'big_day', name: 'Big Day', icon: 'trending', cat: 'streaks', metric: 'bigDay', ...single('silver', 50), rule: () => 'Gain 50 rating in one day', unit: (n) => `+${n} in a day` },
  { id: 'socialite', name: 'Socialite', icon: 'users', cat: 'social', metric: 'opponents', ...ladder([3, 5, 8, 12, 20]), rule: (g) => `Play ${g} different opponents`, unit: plural('opponent', 'opponents') },
  { id: 'payback', name: 'Payback', icon: 'repeat', cat: 'social', metric: 'paybacks', ...ladder([1, 5, 15, 30, 60]), rule: (g) => (g === 1 ? 'Beat someone who beat you last time' : `Win ${g} rematches`), unit: plural('rematch won', 'rematches won') },
  { id: 'old_rivals', name: 'Old Rivals', icon: 'handshake', cat: 'social', metric: 'rivalry', ...ladder([5, 10, 20, 40, 80]), rule: (g) => `Play the same opponent ${g} times`, unit: plural('meeting', 'meetings') },
  { id: 'dream_team', name: 'Dream Team', icon: 'heart', cat: 'doubles', metric: 'duoWins', ...ladder([1, 10, 25, 50, 100]), rule: (g) => (g === 1 ? 'Win a doubles match' : `Win ${g} doubles matches`), unit: plural('doubles win', 'doubles wins') },
  { id: 'mixer', name: 'Mixer', icon: 'shuffle', cat: 'doubles', metric: 'partners', ...ladder([2, 4, 6, 10, 15]), rule: (g) => `Team up with ${g} different partners`, unit: plural('partner', 'partners') },
  { id: 'night_shift', name: 'Night Shift', icon: 'moon', cat: 'social', metric: 'nights', ...single('bronze'), rule: () => 'Play a match after 21:00', unit: plural('late match', 'late matches') },
  { id: 'early_bird', name: 'Early Bird', icon: 'sunrise', cat: 'social', metric: 'earlies', ...single('bronze'), rule: () => 'Play a match before 9:00', unit: plural('early match', 'early matches') },
  { id: 'monday_lift', name: 'Monday Lift', icon: 'coffee', cat: 'social', metric: 'mondayWins', ...single('bronze'), rule: () => 'Win a match on a Monday', unit: plural('Monday win', 'Monday wins') },
  { id: 'cup_champion', name: 'Cup Champion', icon: 'trophy', cat: 'cup', metric: 'cups', ...ladder([1, 3, 5, 10, 20]), module: 'cup', rule: (g) => (g === 1 ? 'Win a weekly cup' : `Win ${g} weekly cups`), unit: plural('cup', 'cups') },
  { id: 'finalist', name: 'Finalist', icon: 'flag', cat: 'cup', metric: 'finals', ...single('silver'), module: 'cup', rule: () => 'Reach a weekly cup final', unit: plural('final', 'finals') },
  { id: 'podium', name: 'Podium', icon: 'award', cat: 'season', metric: 'podiums', ...ladder([1, 2, 4, 8, 12]), module: 'seasons', rule: (g) => (g === 1 ? 'Finish a season in the top 3' : `Finish ${g} seasons in the top 3`), unit: plural('podium', 'podiums') },
  { id: 'clown_car', name: 'Clown Car', icon: 'smile', cat: 'fun', metric: 'lossRun', ...single('bronze', 5), fun: true, secret: true, rule: () => 'Keep playing through 5 losses in a row', unit: plural('loss in a row', 'losses in a row') },
  { id: 'cursed', name: 'Cursed', icon: 'ghost', cat: 'fun', metric: 'closeLosses', ...single('silver', 3), fun: true, rule: () => 'Lose 3 matches by a single point', unit: plural('near miss', 'near misses') },
];
export const BADGE = new Map(CATALOGUE.map((b) => [b.id, b]));
export const stepKey = (id: string, step: number) => `${id}:${step}`;

// Overall tier from the number of earned steps (G4 summary "Gold tier, 24 of 40").
export const OVERALL: { tier: Tier; at: number }[] = [
  { tier: 'bronze', at: 1 }, { tier: 'silver', at: 10 }, { tier: 'gold', at: 25 }, { tier: 'diamond', at: 45 }, { tier: 'legend', at: 70 },
];
export function overallOf(earned: number) {
  let i = -1;
  OVERALL.forEach((o, k) => { if (earned >= o.at) i = k; });
  const next = OVERALL[i + 1] ?? null;
  return { tier: i >= 0 ? OVERALL[i].tier : null, next: next?.tier ?? null, left: next ? next.at - earned : 0 };
}

/* ---------- time in the league's timezone ---------- */
const offsets = new Map<string, number>();
function offset(ms: number, tz?: string) {
  const key = `${tz ?? ''}:${Math.floor(ms / 3600000)}`;
  const hit = offsets.get(key);
  if (hit !== undefined) return hit;
  let v: number;
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    v = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(ms / 1000) * 1000;
  } catch { v = -new Date(ms).getTimezoneOffset() * 60000; }
  offsets.set(key, v);
  return v;
}
// Local day number, hour, weekday (Mon 0) and Monday based week number.
export function local(iso: string | number, tz?: string) {
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const l = ms + offset(ms, tz);
  const day = Math.floor(l / DAY);
  return { day, hour: Math.floor((l - day * DAY) / 3600000), weekday: (day + 3) % 7, week: Math.floor((day + 3) / 7) };
}
export const weekStart = (week: number) => new Date((week * 7 - 3) * DAY).toISOString(); // Monday 00:00 UTC of that week, for labels

/* ---------- replay ---------- */
export type Unlock = { id: string; step: number; at: string; match: string | null };
export type Played = { match: StoredMatch; won: boolean; delta: number; before: number; after: number; opps: string[]; partner: string | null; upset: boolean; local: ReturnType<typeof local> };
export type Track = { metrics: Metrics; unlocks: Unlock[]; log: Played[]; lossRunNow: number };
export type Extra = { podiums?: { member: string; at: string }[]; exclude?: string };

const zero = (): Metrics => ({
  played: 0, wins: 0, upsets: 0, kingWins: 0, miracles: 0, shutouts: 0, closeWins: 0, dayWins: 0, perfectDay: 0, dayPlayed: 0, winRun: 0,
  comebacks: 0, weeks: 0, peakGain: 0, bigDay: 0, opponents: 0, paybacks: 0, rivalry: 0, duoWins: 0, partners: 0, nights: 0, earlies: 0,
  mondayWins: 0, lossRun: 0, closeLosses: 0, ducks: 0, cups: 0, finals: 0, podiums: 0,
});

// One pass over a league's confirmed matches in played order. Returns every member's metrics and the moment each step was first reached.
export function replay(d: DB, leagueId: string, extra: Extra = {}): Map<string, Track> {
  const l = d.leagues.find((x) => x.id === leagueId);
  const tz = l?.timezone, base = l?.start_rating ?? 1000;
  const matches = d.matches.filter((m) => m.league_id === leagueId && counts(m) && m.id !== extra.exclude).sort((a, b) => a.played_at.localeCompare(b.played_at));
  const ids = new Set(matches.map((m) => m.id));
  const rows = new Map<string, StoredMP[]>();
  d.mps.forEach((p) => { if (ids.has(p.match_id)) rows.set(p.match_id, [...(rows.get(p.match_id) ?? []), p]); });

  const out = new Map<string, Track>();
  const st = new Map<string, { run: number; lrun: number; day: number; dWins: number; dLoss: number; dPlayed: number; dNet: number; weeks: Set<number>; opps: Map<string, number>; partners: Set<string> }>();
  const rating = new Map<string, { r: number; n: number }>();
  const last = new Map<string, string>(); // pair key, who won their last meeting
  const get = (id: string) => {
    if (!out.has(id)) {
      out.set(id, { metrics: zero(), unlocks: [], log: [], lossRunNow: 0 });
      st.set(id, { run: 0, lrun: 0, day: -1, dWins: 0, dLoss: 0, dPlayed: 0, dNet: 0, weeks: new Set(), opps: new Map(), partners: new Set() });
    }
    return { t: out.get(id)!, s: st.get(id)! };
  };
  const check = (id: string, at: string, match: string | null) => {
    const { t } = get(id);
    const have = new Set(t.unlocks.map((u) => stepKey(u.id, u.step)));
    for (const b of CATALOGUE) b.goals.forEach((g, i) => {
      if (t.metrics[b.metric] >= g && !have.has(stepKey(b.id, i))) t.unlocks.push({ id: b.id, step: i, at, match });
    });
  };
  const leader = () => {
    let best: string | null = null, br = -Infinity;
    for (const [id, x] of rating) if (x.n >= PROVISIONAL && x.r > br) { best = id; br = x.r; }
    return best;
  };

  for (const m of matches) {
    const ps = rows.get(m.id) ?? [];
    if (!ps.length) continue;
    const king = leader();
    const sideAvg = (side: 'a' | 'b') => { const xs = ps.filter((p) => p.side === side); return xs.reduce((s, p) => s + p.rating_before, 0) / xs.length; };
    const ra = sideAvg('a'), rb = sideAvg('b');
    const chanceA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const L = local(m.played_at, tz);
    const scored = m.score_a != null && m.score_b != null;
    const margin = scored ? Math.abs((m.score_a ?? 0) - (m.score_b ?? 0)) : null;
    const loserScore = scored ? (m.winner === 'a' ? m.score_b : m.score_a) : null;
    for (const p of ps) {
      const { t, s } = get(p.member_id);
      const M = t.metrics;
      const won = p.side === m.winner;
      const opps = ps.filter((x) => x.side !== p.side).map((x) => x.member_id);
      const partner = ps.find((x) => x.side === p.side && x.member_id !== p.member_id)?.member_id ?? null;
      const myChance = p.side === 'a' ? chanceA : 1 - chanceA;
      const oppAvg = p.side === 'a' ? rb : ra, myAvg = p.side === 'a' ? ra : rb;
      if (s.day !== L.day) { s.day = L.day; s.dWins = 0; s.dLoss = 0; s.dPlayed = 0; s.dNet = 0; }
      s.dPlayed++; s.dNet += p.delta;
      M.played++;
      s.weeks.add(L.week); M.weeks = s.weeks.size;
      if (L.hour >= 21) M.nights++;
      if (L.hour < 9) M.earlies++;
      const upset = won && myChance < UPSET;
      if (won) {
        M.wins++; s.dWins++;
        if (s.lrun >= 3) M.comebacks++;
        s.run++; s.lrun = 0;
        if (upset) M.upsets++;
        if (oppAvg - myAvg >= 200) M.miracles++;
        if (king && opps.includes(king)) M.kingWins++;
        if (loserScore === 0) M.shutouts++;
        if (margin === 1) M.closeWins++;
        if (L.weekday === 0) M.mondayWins++;
        if (opps.some((o) => last.get([p.member_id, o].sort().join('|')) === o)) M.paybacks++;
        if (partner) M.duoWins++;
      } else {
        s.dLoss++; s.lrun++; s.run = 0;
        if (margin === 1) M.closeLosses++;
        if (scored && (p.side === 'a' ? m.score_a : m.score_b) === 0) M.ducks++;
      }
      M.winRun = Math.max(M.winRun, s.run);
      M.lossRun = Math.max(M.lossRun, s.lrun);
      t.lossRunNow = s.lrun;
      M.dayWins = Math.max(M.dayWins, s.dWins);
      M.dayPlayed = Math.max(M.dayPlayed, s.dPlayed);
      if (!s.dLoss) M.perfectDay = Math.max(M.perfectDay, s.dWins);
      M.bigDay = Math.max(M.bigDay, s.dNet);
      M.peakGain = Math.max(M.peakGain, p.rating_after - base);
      opps.forEach((o) => s.opps.set(o, (s.opps.get(o) ?? 0) + 1));
      M.opponents = s.opps.size;
      M.rivalry = Math.max(0, ...s.opps.values());
      if (partner) { s.partners.add(partner); M.partners = s.partners.size; }
      t.log.push({ match: m, won, delta: p.delta, before: p.rating_before, after: p.rating_after, opps, partner, upset, local: L });
    }
    // after everyone's numbers moved: ratings, last meetings, step checks
    for (const p of ps) {
      const x = rating.get(p.member_id) ?? { r: base, n: 0 };
      rating.set(p.member_id, { r: p.rating_after, n: x.n + 1 });
      if (p.side === m.winner) ps.filter((o) => o.side !== p.side).forEach((o) => last.set([p.member_id, o.member_id].sort().join('|'), p.member_id));
      check(p.member_id, m.played_at, m.id);
    }
  }

  // Weekly cup results and season podiums happen outside a single match.
  const cups = (d.cups ?? []).filter((c) => c.league_id === leagueId && c.status === 'done' && c.champion_id)
    .map((c) => { const fin = c.games.find((g) => g.round === c.rounds - 1); return { c, at: fin?.ended_at ?? c.final_at, match: fin?.match_id ?? null }; })
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const { c, at, match } of cups) {
    if (match && match === extra.exclude) continue;
    get(c.champion_id!).t.metrics.cups++;
    for (const id of [c.champion_id, c.runner_up_id]) if (id) { get(id).t.metrics.finals++; check(id, at, match); }
  }
  for (const p of [...(extra.podiums ?? [])].sort((a, b) => a.at.localeCompare(b.at))) {
    get(p.member).t.metrics.podiums++;
    check(p.member, p.at, null);
  }
  return out;
}

// Next step for a badge: the goal, the current value and the tier it gives.
export function stepOf(b: BadgeDef, earnedSteps: number, value: number) {
  const i = Math.min(earnedSteps, b.goals.length - 1);
  return { step: i, goal: b.goals[i], value: Math.min(value, b.goals[i]), tier: b.tiers[i], done: earnedSteps >= b.goals.length };
}

/* ---------- titles (held now, all time) ---------- */
export type Title = { key: string; label: string; who: string; value: string; fun?: boolean };
export function titlesOf(tracks: Map<string, Track>, active: Set<string>, fun: boolean): Title[] {
  const list = [...tracks.entries()].filter(([id]) => active.has(id));
  const outT: Title[] = [];
  const top = (key: string, label: string, score: (m: Metrics) => number, value: (m: Metrics) => string, min = 1, isFun = false) => {
    if (isFun && !fun) return;
    const best = [...list].sort((a, b) => score(b[1].metrics) - score(a[1].metrics) || b[1].metrics.played - a[1].metrics.played)[0];
    if (best && score(best[1].metrics) >= min) outT.push({ key, label, who: best[0], value: value(best[1].metrics), fun: isFun || undefined });
  };
  top('iron', 'Iron Man', (m) => m.played, (m) => `${m.played} matches`);
  top('giant', 'Giant Killer', (m) => m.upsets, (m) => plural('upset', 'upsets')(m.upsets));
  top('king', 'Kingslayer', (m) => m.kingWins, (m) => plural('win over the #1', 'wins over the #1')(m.kingWins));
  top('wall', 'The Wall', (m) => m.shutouts, (m) => plural('clean sheet', 'clean sheets')(m.shutouts));
  top('streak', 'Hot Streak', (m) => m.winRun, (m) => `${m.winRun} wins in a row`, 3);
  top('sharp', 'Sharpshooter', (m) => (m.played >= 10 ? m.wins / m.played : 0), (m) => `${Math.round((m.wins / m.played) * 100)}% wins`, 0.01);
  top('cursed', 'Cursed', (m) => m.closeLosses, (m) => plural('near miss', 'near misses')(m.closeLosses), 2, true);
  top('duck', 'The Duck', (m) => m.ducks, (m) => plural('blank', 'blanks')(m.ducks), 2, true);
  return outT;
}

/* ---------- XP, levels, weekly streak (G5) ---------- */
export const XP = { played: 20, win: 10, upset: 15, cup: 10, dailyFull: 10, boostWeeks: 4, boost: 0.25 };
export const MAX_LEVEL = 50;
export const FREEZE_MAX = 3;
export const FREEZE_EVERY = 4; // a freeze for every 4 weeks in a row
export const needFor = (level: number) => 400 + 150 * (level - 1); // XP from level n to n + 1
export function levelOf(xp: number) {
  let level = 1, left = xp;
  while (level < MAX_LEVEL && left >= needFor(level)) { left -= needFor(level); level++; }
  return { level, into: left, need: level >= MAX_LEVEL ? 0 : needFor(level), xp };
}
export const levelName = (n: number) => (n >= 40 ? 'Legend' : n >= 30 ? 'Master' : n >= 20 ? 'Sharpshooter' : n >= 10 ? 'Contender' : n >= 5 ? 'Regular' : 'Rookie');

export type WeekMark = 'played' | 'freeze' | 'missed' | 'open';
export type Streak = { current: number; best: number; freezes: number; used: number; playedNow: boolean; marks: { week: number; mark: WeekMark }[]; broke: boolean };

// Weekly play streak. A missed week uses a freeze automatically; with none left the counter starts again.
// Losing a streak never takes anything away, and nothing here can be bought.
export function streakOf(weeks: Set<number>, nowWeek: number): Streak {
  const marks: Streak['marks'] = [];
  let current = 0, best = 0, freezes = 1, used = 0, broke = false;
  if (!weeks.size) return { current, best, freezes, used, playedNow: false, marks, broke };
  const first = Math.min(...weeks);
  for (let w = first; w <= nowWeek; w++) {
    if (weeks.has(w)) {
      current++; broke = false;
      if (current % FREEZE_EVERY === 0) freezes = Math.min(FREEZE_MAX, freezes + 1);
      marks.push({ week: w, mark: 'played' });
    } else if (w === nowWeek) marks.push({ week: w, mark: 'open' });
    else if (current > 0 && freezes > 0) { freezes--; used++; marks.push({ week: w, mark: 'freeze' }); }
    else { if (current > 0) broke = true; current = 0; marks.push({ week: w, mark: 'missed' }); }
    best = Math.max(best, current);
  }
  return { current, best, freezes, used, playedNow: weeks.has(nowWeek), marks, broke };
}

export type Progress = { xp: number; level: ReturnType<typeof levelOf>; streak: Streak; lastXp: number; weekXp: number };
// XP per match: played 20, win +10, upset +15, cup match +10. After 10 matches in a day the match XP halves.
// From 4 weeks in a row every match gets +25%.
export function progressOf(d: DB, leagueId: string, memberId: string, track: Track | undefined, now = Date.now()): Progress {
  const tz = d.leagues.find((x) => x.id === leagueId)?.timezone;
  const nowWeek = local(now, tz).week;
  const log = track?.log ?? [];
  const cupMatches = new Set((d.cups ?? []).filter((c) => c.league_id === leagueId).flatMap((c) => c.games.map((g) => g.match_id).filter(Boolean) as string[]));
  const weeks = new Set(log.map((e) => e.local.week));
  const runs = new Map<number, number>(); // streak value reached in each played week
  let run = 0, freezes = 1;
  if (weeks.size) for (let w = Math.min(...weeks); w <= nowWeek; w++) {
    if (weeks.has(w)) { run++; if (run % FREEZE_EVERY === 0) freezes = Math.min(FREEZE_MAX, freezes + 1); runs.set(w, run); }
    else if (w !== nowWeek) { if (run > 0 && freezes > 0) freezes--; else run = 0; }
  }
  let xp = 0, lastXp = 0, weekXp = 0, day = -1, today = 0;
  for (const e of log) {
    if (e.local.day !== day) { day = e.local.day; today = 0; }
    today++;
    let x = XP.played + (e.won ? XP.win : 0) + (e.upset ? XP.upset : 0) + (cupMatches.has(e.match.id) ? XP.cup : 0);
    if (today > XP.dailyFull) x = Math.round(x / 2);
    if ((runs.get(e.local.week) ?? 0) >= XP.boostWeeks) x = Math.round(x * (1 + XP.boost));
    xp += x; lastXp = x;
    if (e.local.week === nowWeek) weekXp += x;
  }
  return { xp, level: levelOf(xp), streak: streakOf(weeks, nowWeek), lastXp, weekXp };
}
