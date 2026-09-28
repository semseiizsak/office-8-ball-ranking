// Office 8-Ball: kattintható prototípus minta adatokkal. Minden a memóriában él,
// újratöltésre visszaáll az alapállapotra. Szabályok az eredeti app (office-8-ball-ranking) szerint.

const K = 32;
const DAY = 86_400_000;
const BOUNTY_PER_DAY = 3;
const BOUNTY_CAP = 60;
const DORMANT_DAYS = 14;
const VOTE_MS = 4 * 60_000;
const EXPIRY_MS = 24 * 3_600_000;
const ELO_FLOOR = 100;
const NERVE_FLOOR = 100;

const BALLS = {
  1: { c: '#F2B705', t: '#F2B705' },
  2: { c: '#1F3FA3', t: '#7D97F0' },
  3: { c: '#C8102E', t: '#FF6B7D' },
  4: { c: '#4B2A7B', t: '#B394E6' },
  5: { c: '#E8601C', t: '#F59A63' },
  6: { c: '#146B3A', t: '#5FCB8C' },
  7: { c: '#7A1F2B', t: '#E0808C' },
  8: { c: '#0A0A0A', t: '#FFFFFF' },
};
const ballOf = (n) => BALLS[n > 8 ? n - 8 : n];
const CHEERS = ['🔥', '🎱', '😱', '👏', '💀', '😭'];
const REACTIONS = ['🔥', '💀', '😭', '👏', '💰'];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();
const uid = () => Math.random().toString(36).slice(2, 9);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const midnightsSince = (ts) => Math.max(0, Math.round((startOfDay(now()) - startOfDay(ts)) / DAY));

const ago = (ts) => {
  const m = Math.floor((now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const plural = (n, word) => `${n} ${n === 1 ? word : /(ch|sh|s|x)$/.test(word) ? word + 'es' : word + 's'}`;
const joinNames = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
// szezon határidő: a legdurvább egység, ami még határidőként olvasható
const describeTimeLeft = (endsAt) => {
  const ms = endsAt - now();
  if (ms <= 0) return 'now';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};
const isFinalDay = (endsAt) => endsAt > now() && startOfDay(endsAt) === startOfDay(now());
const FINALE_WINDOW_MS = 48 * 3_600_000;
const toLocalInput = (ts) => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
const hoursLeft =(ch) => Math.max(1, Math.ceil((ch.expiresAt - now()) / 3_600_000));

// ---------- Motion ----------
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(.65,0,.35,1)';
const T = { fast: 180, base: 280, slow: 340, ov: 440 };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// időkorláttal: háttérben lévő fülön az animáció szünetel, a kattintás akkor se ragadjon be
const anim = (el, kf, ms = T.base, o = {}) =>
  !el || RM.matches ? Promise.resolve()
    : Promise.race([
      el.animate(kf, { duration: ms, easing: EASE, fill: 'backwards', ...o }).finished.catch(() => {}),
      new Promise((r) => setTimeout(r, ms + (o.delay || 0) + 60)),
    ]);

// ---------- Minta adatok ----------

const mkPlayer = (id, name, dept, ball, elo, wins, losses, streak, form, daysAgo) => ({
  id, name, dept, ball, elo, peak: elo + Math.round(Math.random() * 30), wins, losses, streak,
  bestStreak: Math.max(streak, 3), form: [...form], lastPlayedAt: daysAgo == null ? null : now() - daysAgo * DAY,
});

const S = {
  me: null,
  seeded: false,
  tab: 'ranks',
  stack: [],        // teljes képernyős nézetek: {type, id}
  sheet: null,      // {type, ...}
  overlay: null,    // {type, ...}
  toast: null,      // {msg, undo}
  inputs: {},       // begépelt, még el nem küldött szövegek (render túléli)
  season: 1,
  // minta: a szezon 30 óra múlva zárul, így a finálé banner és a visszaszámláló is látszik
  seasonEndsAt: now() + 30 * 3_600_000,
  inbox: [],        // {id, to, type, title, body, ts, read}
  crownSince: now() - 3 * DAY - 3600_000,
  players: [
    mkPlayer('p1', 'Dóri', 'Marketing', 5, 1164, 24, 11, 3, 'WWLWW', 0.2),
    mkPlayer('p2', 'Tamás', 'Finance', 8, 1131, 21, 13, 1, 'WLWWL', 0.5),
    mkPlayer('p3', 'Bence', 'Operations', 2, 1098, 18, 14, -1, 'LWWLW', 0.1),
    mkPlayer('p4', 'Réka', 'HR', 14, 1072, 15, 13, 2, 'WLLWL', 1),
    mkPlayer('p5', 'Márk', 'IT', 12, 1041, 13, 14, -2, 'LLWLW', 0.1),
    mkPlayer('p6', 'Anna', 'Design', 1, 1012, 11, 13, 1, 'LWLLW', 2),
    mkPlayer('p7', 'Zsófi', 'Sales', 10, 987, 9, 12, -1, 'LLWLL', 3),
    mkPlayer('p8', 'Péter', 'Kitchen', 3, 962, 7, 13, -3, 'LLLWL', 1),
    mkPlayer('p9', 'Lili', 'Sales', 6, 948, 6, 12, 1, 'LWLLW', 5),
    mkPlayer('p10', 'Gergő', 'Logistics', 11, 1003, 8, 8, 0, 'WLWLL', 22),
  ],
  matches: [],
  challenges: [],
  nerve: {},        // a szimuláció tölti: {nerve, calls, hits, locks, lockHits, against}
  seasonStart: {},  // játékosonként a szezon eleji Elo (Elo-görbe alapvonala)
  profileTab: 'overview',
  historyLimit: 20,
  // címekhez gyűjtött számlálók (minta alapértékkel, a meccsek frissítik)
  tally: {
    upsets: { p3: 4, p7: 2 }, week: { p4: 9, p1: 7 }, wall: { p1: 7 }, kings: { p2: 21 },
    cursed: { p5: 3 }, ducks: { p6: 4 },
  },
  lockDay: null,
  lockArm: null,    // kihívás id, amire a következő tipp lockként megy
  seasons: [
    { number: 0, name: 'Preseason', podium: [['Tamás', 1188], ['Dóri', 1150], ['Bence', 1102]], titles: ['👑 Tamás', '🦆 Márk', '🔮 Zsófi'] },
  ],
  undo: null,
};

const P = (id) => S.players.find((p) => p.id === id);
const isDormant = (p) => p.lastPlayedAt == null || now() - p.lastPlayedAt >= DORMANT_DAYS * DAY;
const ranked = () => S.players.filter((p) => !isDormant(p)).sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id));
const rankOf = (p) => ranked().findIndex((x) => x.id === p.id) + 1;
const crownHolder = () => ranked()[0] ?? null;
const bounty = () => Math.min(BOUNTY_CAP, midnightsSince(S.crownSince) * BOUNTY_PER_DAY);
const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
const winDelta = (a, b) => Math.max(1, Math.round(K * (1 - expected(a.elo, b.elo))));
// a: aki a tétet nézi, b: az ellenfél
const stakeFor = (a, b) => {
  const holder = crownHolder()?.id;
  const bonus = holder === b.id ? bounty() : 0;
  const risk = holder === a.id ? bounty() : 0;
  return { win: winDelta(a, b) + bonus, lose: winDelta(b, a) + risk, bonus, risk };
};
const ACTIVE = ['pending', 'accepted', 'live'];
const busyWith = (pid, exceptId) => S.challenges.find((c) => c.id !== exceptId && ACTIVE.includes(c.status) && (c.from === pid || c.to === pid));
const liveOf = (pid) => S.challenges.find((c) => c.status === 'live' && (c.from === pid || c.to === pid));
// hányadik lenne a ranglistán, ha a legyőzné b-t
const rankIfWin = (a, b) => {
  const s = stakeFor(a, b);
  const aElo = a.elo + s.win, bElo = Math.max(ELO_FLOOR, b.elo - s.win);
  return ranked().filter((p) => p.id !== a.id).map((p) => (p.id === b.id ? bElo : p.elo)).filter((e) => e > aElo).length + 1;
};

// Értesítések: csak arról, ami az olvasóval történt
function notify(to, type, title, body) {
  if (!to || !P(to)) return;
  S.inbox.unshift({ id: uid(), to, type, title, body, ts: now(), read: false });
  if (to === S.me) toast(title);
}
const unread = () => S.inbox.filter((n) => n.to === S.me && !n.read).length;

// ---------- Badge-ek ----------
// Minden badge a meccsekből és néhány számlálóból jön, semmi sincs külön tárolva.
// A titkosak a gyűjteményben "???"-ként látszanak, amíg valaki meg nem szerzi.

const runOf = (arr, pred) => { let r = 0, b = 0; arr.forEach((x) => { r = pred(x) ? r + 1 : 0; b = Math.max(b, r); }); return b; };
const other = (g) => (g === 'solids' ? 'stripes' : 'solids');

function badgeCtx(p) {
  const my = S.matches.filter((m) => m.w === p.id || m.l === p.id).sort((a, b) => a.ts - b.ts).map((m) => {
    const won = m.w === p.id, gain = m.delta + m.bounty;
    const eloAfter = won ? m.wElo : m.lElo, oppAfter = won ? m.lElo : m.wElo;
    return {
      m, won, gain, opp: won ? m.l : m.w, d: new Date(m.ts),
      group: m.group ? (won ? m.group : other(m.group)) : null,
      eloAfter, eloBefore: won ? eloAfter - gain : eloAfter + gain, oppBefore: won ? oppAfter + gain : oppAfter - gain,
    };
  });
  const comments = S.matches.reduce((n, m) => n + m.comments.filter((x) => x.author === p.id).length, 0);
  return { p, my, nr: S.nerve[p.id] ?? {}, cnt: S.counters[p.id] ?? {}, ducks: S.tally.ducks[p.id] ?? 0, comments };
}
const perDay = (my, key = (x) => x.d.toDateString()) => my.reduce((acc, x) => ((acc[key(x)] = (acc[key(x)] || 0) + 1), acc), {});

function byDay(my) {
  const out = {};
  my.forEach((x) => {
    const d = (out[x.d.toDateString()] ??= { w: 0, l: 0, net: 0, up: 0, opps: new Set() });
    d[x.won ? 'w' : 'l']++; d.net += x.won ? x.gain : -x.gain; d.opps.add(x.opp); if (x.won && x.m.upset) d.up++;
  });
  return out;
}
const byOpp = (my) => my.reduce((acc, x) => ((acc[x.opp] ??= []).push(x), acc), {});

const BADGES = [
  { id: 'first', e: '🐣', name: 'First Blood', desc: 'Win your first match.', test: (c) => c.my.some((x) => x.won) },
  { id: 'solid', e: '🟡', name: 'Solid Citizen', desc: 'Win 5 on solids.', test: (c) => c.my.filter((x) => x.won && x.group === 'solids').length >= 5 },
  { id: 'zebra', e: '🦓', name: 'Zebra Crossing', desc: 'Win 5 on stripes.', test: (c) => c.my.filter((x) => x.won && x.group === 'stripes').length >= 5 },
  { id: 'switch', e: '🔀', name: 'Switch Hitter', desc: 'Three wins in a row, switching balls every time.', test: (c) => c.my.some((x, i) => i >= 2 && [x, c.my[i - 1], c.my[i - 2]].every((y) => y.won && y.group) && x.group !== c.my[i - 1].group && c.my[i - 1].group !== c.my[i - 2].group) },
  { id: 'candy', e: '🍭', name: 'Candy Cane', desc: 'Three stripe wins in a row.', test: (c) => runOf(c.my, (x) => x.won && x.group === 'stripes') >= 3 },
  { id: 'brick', e: '🧱', name: 'Brick by Brick', desc: 'Three solid wins in a row.', test: (c) => runOf(c.my, (x) => x.won && x.group === 'solids') >= 3 },
  { id: 'fire', e: '🔥', name: 'On Fire', desc: 'Win 5 in a row.', test: (c) => runOf(c.my, (x) => x.won) >= 5 },
  { id: 'ice', e: '🧊', name: 'Ice Cold', desc: 'Lose 5 in a row. It happens to the best.', test: (c) => runOf(c.my, (x) => !x.won) >= 5 },
  { id: 'david', e: '🪨', name: 'David', desc: 'Beat someone 150 Elo above you.', test: (c) => c.my.some((x) => x.won && x.oppBefore - x.eloBefore >= 150) },
  { id: 'snail', e: '🐌', name: 'Participation Trophy', desc: 'Win and gain 5 points or fewer.', test: (c) => c.my.some((x) => x.won && x.gain <= 5) },
  { id: 'jackpot', e: '💸', name: 'Jackpot', desc: 'Collect a bounty of 30 or more.', test: (c) => c.my.some((x) => x.won && x.m.bounty >= 30) },
  { id: 'crown3', e: '👑', name: 'Heavy Is the Head', desc: 'Defend the crown 3 times.', test: (c) => c.my.filter((x) => x.won && x.m.defended).length >= 3 },
  { id: 'night', e: '🌙', name: 'Night Shift', desc: 'Play a match after 6:30 pm. Go home.', test: (c) => c.my.some((x) => x.d.getHours() * 60 + x.d.getMinutes() >= 18 * 60 + 30) },
  { id: 'monday', e: '🥲', name: 'Monday Blues', desc: 'Lose 3 matches on Mondays. It is always a Monday.', test: (c) => c.my.filter((x) => !x.won && x.d.getDay() === 1).length >= 3 },
  { id: 'friday', e: '🍻', name: 'Friday Hero', desc: 'Win on a Friday after 3 pm.', test: (c) => c.my.some((x) => x.won && x.d.getDay() === 5 && x.d.getHours() >= 15) },
  { id: 'marathon', e: '🏃', name: 'Marathon', desc: 'Play 5 matches in one day.', test: (c) => Object.values(perDay(c.my)).some((n) => n >= 5) },
  { id: 'revenge', e: '🪃', name: 'Revenge Served', desc: 'Beat someone the same day they beat you.', test: (c) => { const last = {}; return c.my.some((x) => { const l = last[x.opp]; const hit = x.won && l && !l.won && l.d.toDateString() === x.d.toDateString(); last[x.opp] = x; return hit; }); } },
  { id: 'zombie', e: '🧟', name: 'Back From the Dead', desc: 'Win right after losing 4 in a row.', test: (c) => c.my.some((x, i) => x.won && i >= 4 && c.my.slice(i - 4, i).every((y) => !y.won)) },
  { id: 'frenemies', e: '🤝', name: 'Frenemies', desc: 'Play the same person 10 times.', test: (c) => Object.values(perDay(c.my, (x) => x.opp)).some((n) => n >= 10) },
  { id: 'coin', e: '🪙', name: 'Coin Flip', desc: 'Beat and lose to the same person on the same day.', test: (c) => { const k = {}; c.my.forEach((x) => { const key = x.opp + x.d.toDateString(); k[key] = (k[key] || '') + (x.won ? 'W' : 'L'); }); return Object.values(k).some((v) => v.includes('W') && v.includes('L')); } },
  { id: 'regular', e: '📅', name: 'Regular', desc: 'Play 25 matches.', test: (c) => c.my.length >= 25 },
  { id: 'duck', e: '🦆', name: 'Professional Duck', desc: 'Duck 3 callouts. Quack.', test: (c) => c.ducks >= 3 },
  { id: 'chatter', e: '🗣️', name: 'Chatterbox', desc: 'Send 10 messages in live chats.', test: (c) => (c.cnt.chat ?? 0) >= 10 },
  { id: 'hype', e: '📣', name: 'Hype Man', desc: 'Send 15 cheers from the crowd.', test: (c) => (c.cnt.cheers ?? 0) >= 15 },
  { id: 'called', e: '🔮', name: 'Called It', desc: 'Get 3 calls right.', test: (c) => (c.nr.hits ?? 0) >= 3 },
  // titkosak
  { id: 'lucky8', e: '🎱', name: 'Lucky Eight', desc: 'Win for exactly +8.', secret: true, test: (c) => c.my.some((x) => x.won && x.gain === 8) },
  { id: 'textbook', e: '📐', name: 'Textbook', desc: 'Win for exactly +16 three times. The most average win there is.', secret: true, test: (c) => c.my.filter((x) => x.won && x.gain === 16).length >= 3 },
  { id: 'dejavu', e: '🔁', name: 'Déjà Vu', desc: 'Play the same person 3 times in one day.', secret: true, test: (c) => Object.values(perDay(c.my, (x) => x.opp + x.d.toDateString())).some((n) => n >= 3) },
  { id: 'coffee', e: '☕', name: 'Coffee Break', desc: 'Play between 10:00 and 10:30.', secret: true, test: (c) => c.my.some((x) => x.d.getHours() === 10 && x.d.getMinutes() < 30) },
  { id: 'ghost', e: '👻', name: 'Ghost', desc: 'Come back after 14 days away and win.', secret: true, test: (c) => c.my.some((x, i) => i && x.won && x.m.ts - c.my[i - 1].m.ts >= DORMANT_DAYS * DAY) },
  { id: 'bottom', e: '🕳️', name: 'Rock Bottom', desc: 'Drop below 900 Elo.', secret: true, test: (c) => c.my.some((x) => x.eloAfter < 900) },
  { id: 'round', e: '🧮', name: 'Perfectionist', desc: 'Land on a round hundred, like exactly 1100.', secret: true, test: (c) => c.my.some((x) => x.eloAfter % 100 === 0) },
  { id: 'sabotage', e: '🙈', name: 'Self Sabotage', desc: 'Hit a new peak, then lose the next four straight.', secret: true, test: (c) => { let peak = S.seasonStart[c.p.id] ?? 1000; return c.my.some((x, i) => { const top = x.eloAfter > peak; peak = Math.max(peak, x.eloAfter); return top && c.my.length > i + 4 && c.my.slice(i + 1, i + 5).every((y) => !y.won); }); } },
  { id: 'clown', e: '🤡', name: 'Clown Call', desc: 'Lose a lock. Bold. Wrong.', secret: true, test: (c) => (c.nr.locks ?? 0) - (c.nr.lockHits ?? 0) > 0 },
  // bővítés: még több véletlen és vicces
  { id: 'early', e: '🐦', name: 'Early Bird', desc: 'Play before 9:10 in the morning. Coffee first?', test: (c) => c.my.some((x) => x.d.getHours() * 60 + x.d.getMinutes() < 9 * 60 + 10) },
  { id: 'taco', e: '🌮', name: 'Taco Tuesday', desc: 'Win 3 matches on Tuesdays.', test: (c) => c.my.filter((x) => x.won && x.d.getDay() === 2).length >= 3 },
  { id: 'perfectday', e: '☀️', name: 'Perfect Day', desc: 'Win 4 in a day without a single loss.', test: (c) => Object.values(byDay(c.my)).some((d) => d.w >= 4 && d.l === 0) },
  { id: 'rainy', e: '🌧️', name: 'Rainy Day', desc: 'Lose 4 in a day without a single win.', test: (c) => Object.values(byDay(c.my)).some((d) => d.l >= 4 && d.w === 0) },
  { id: 'rocket', e: '🚀', name: 'Rocket', desc: 'Gain 50 Elo in one day.', test: (c) => Object.values(byDay(c.my)).some((d) => d.net >= 50) },
  { id: 'freefall', e: '🪂', name: 'Freefall', desc: 'Lose 50 Elo in one day. Pull the cord.', test: (c) => Object.values(byDay(c.my)).some((d) => d.net <= -50) },
  { id: 'variety', e: '🌈', name: 'Variety Pack', desc: 'Play 5 different people in one day.', test: (c) => Object.values(byDay(c.my)).some((d) => d.opps.size >= 5) },
  { id: 'hattrick', e: '🎩', name: 'Hat Trick', desc: 'Beat the same person 3 times in a row.', test: (c) => Object.values(byOpp(c.my)).some((seq) => runOf(seq, (x) => x.won) >= 3) },
  { id: 'kryptonite', e: '🧪', name: 'Kryptonite', desc: 'Lose to the same person 4 times in a row.', test: (c) => Object.values(byOpp(c.my)).some((seq) => runOf(seq, (x) => !x.won) >= 4) },
  { id: 'grudge', e: '🧨', name: 'Grudge Match', desc: 'Play someone 10 times and still be within one win of each other.', test: (c) => Object.values(byOpp(c.my)).some((seq) => seq.length >= 10 && Math.abs(seq.filter((x) => x.won).length * 2 - seq.length) <= 1) },
  { id: 'loyal', e: '💍', name: 'Loyal', desc: 'Play the same person 5 matches in a row.', test: (c) => c.my.some((x, i) => i >= 4 && c.my.slice(i - 4, i).every((y) => y.opp === x.opp)) },
  { id: 'photo', e: '📸', name: 'Photo Finish', desc: 'Beat someone within 5 Elo of you.', test: (c) => c.my.some((x) => x.won && Math.abs(x.oppBefore - x.eloBefore) <= 5) },
  { id: 'mirror', e: '🪞', name: 'Mirror Match', desc: 'Play someone with the same ball number.', test: (c) => c.my.some((x) => P(x.opp)?.ball === c.p.ball) },
  { id: 'eight', e: '🖤', name: 'Eight Is Great', desc: 'Play as the 8 ball and win 8 matches.', test: (c) => c.p.ball === 8 && c.my.filter((x) => x.won).length >= 8 },
  { id: 'regicide', e: '🗡️', name: 'Regicide', desc: 'Take the crown off whoever had it.', test: (c) => c.my.some((x) => x.won && x.m.took) },
  { id: 'biggame', e: '💎', name: 'Big Game', desc: 'Collect a maxed out 60 point bounty.', test: (c) => c.my.some((x) => x.won && x.m.bounty >= BOUNTY_CAP) },
  { id: 'herd', e: '🐑', name: 'Follow the Herd', desc: 'Make 10 calls with the majority.', test: (c) => (c.nr.calls ?? 0) - (c.nr.against ?? 0) >= 10 },
  { id: 'lonewolf', e: '🐺', name: 'Lone Wolf', desc: 'Make 5 calls against the room.', test: (c) => (c.nr.against ?? 0) >= 5 },
  { id: 'lockstar', e: '🔒', name: 'Lock Star', desc: 'Hit 3 locks.', test: (c) => (c.nr.lockHits ?? 0) >= 3 },
  { id: 'fresh', e: '🔄', name: 'Fresh Start', desc: 'Play in two different seasons.', test: (c) => new Set(c.my.map((x) => x.m.season)).size >= 2 },
  { id: 'buzzer', e: '⏰', name: 'Buzzer Beater', desc: 'Win in the last hour before a season closes.', test: (c) => c.my.some((x) => x.won && S.seasons.some((z) => z.endedAt && x.m.ts <= z.endedAt && x.m.ts > z.endedAt - 3_600_000)) },
  { id: 'critic', e: '💬', name: 'Critic', desc: 'Leave 5 comments on results.', test: (c) => c.comments >= 5 },
  { id: 'lunch', e: '🥪', name: 'Lunch Break', desc: 'Play between 12:00 and 12:15.', secret: true, test: (c) => c.my.some((x) => x.d.getHours() === 12 && x.d.getMinutes() < 15) },
  { id: 'overtime', e: '🛋️', name: 'Do You Even Go Home', desc: 'Play on a weekend.', secret: true, test: (c) => c.my.some((x) => x.d.getDay() === 0 || x.d.getDay() === 6) },
  { id: 'balanced', e: '⚖️', name: 'Perfectly Balanced', desc: 'Exactly as many wins as losses, after 10 or more matches.', secret: true, test: (c) => c.my.length >= 10 && c.my.filter((x) => x.won).length * 2 === c.my.length },
  { id: 'alltalk', e: '🦜', name: 'All Talk', desc: 'Send 20 chat messages with a win rate under 40%.', secret: true, test: (c) => (c.cnt.chat ?? 0) >= 20 && c.my.length > 0 && c.my.filter((x) => x.won).length / c.my.length < 0.4 },
  { id: 'underdogday', e: '🐕', name: 'Underdog Day', desc: 'Win 3 upsets in one day.', secret: true, test: (c) => Object.values(byDay(c.my)).some((d) => d.up >= 3) },
];
const BADGE = Object.fromEntries(BADGES.map((b) => [b.id, b]));
const earnedBadges = (p) => { const c = badgeCtx(p); return new Set(BADGES.filter((b) => b.test(c)).map((b) => b.id)); };

// ---------- Tieres achievementek ----------
// Öt szint: bronz, ezüst, arany, gyémánt, és a végső 8-ball, ami tényleg nehéz.
const TIERS = [
  { k: 'bronze', label: 'Bronze', c: '#A8622C', f: '#FFFFFF' },
  { k: 'silver', label: 'Silver', c: '#C9CCD1', f: '#0A0A0A' },
  { k: 'gold', label: 'Gold', c: '#F2B705', f: '#0A0A0A' },
  { k: 'diamond', label: 'Diamond', c: '#FFFFFF', f: '#0A0A0A' },
  { k: 'eight', label: '8-Ball', c: '#0A0A0A', f: '#FFFFFF' },
];
const ACH = [
  { id: 'matches', e: '🎱', name: 'Table Time', unit: 'matches', at: [10, 50, 150, 400, 1000], names: ['Table Tourist', 'Chalk Regular', 'Felt Resident', 'Cue Monk', 'Part of the Table'], v: (c) => c.my.length },
  { id: 'wins', e: '🏆', name: 'Winner Winner', unit: 'wins', at: [5, 25, 75, 200, 500], names: ['Lucky Rookie', 'Closer', 'Shark', 'Apex Predator', 'The Final Boss'], v: (c) => c.my.filter((x) => x.won).length },
  { id: 'stripes', e: '🦓', name: 'Stripe Life', unit: 'wins on stripes', at: [5, 20, 50, 120, 300], names: ['Stripe Curious', 'Zebra Cadet', 'Pinstripe', 'Barcode', 'Walking Crosswalk'], v: (c) => c.my.filter((x) => x.won && x.group === 'stripes').length },
  { id: 'solids', e: '🟡', name: 'Solid Ground', unit: 'wins on solids', at: [5, 20, 50, 120, 300], names: ['Solid Snack', 'Rock Solid', 'Bedrock', 'Tectonic', 'The Monolith'], v: (c) => c.my.filter((x) => x.won && x.group === 'solids').length },
  { id: 'streak', e: '🔥', name: 'Heat Check', unit: 'wins in a row', at: [3, 5, 8, 12, 20], names: ['Warm Hands', 'On a Roll', 'Heater', 'Unplugged', 'Nuclear'], v: (c) => runOf(c.my, (x) => x.won) },
  { id: 'upsets', e: '🗡️', name: 'Giant Slayer', unit: 'upset wins', at: [1, 5, 15, 40, 100], names: ['Pebble Thrower', 'Slingshot', 'Beanstalk Climber', 'Titan Tipper', 'Olympus Wrecker'], v: (c) => c.my.filter((x) => x.won && x.m.upset).length },
  { id: 'bounty', e: '💰', name: 'Bounty Hunter', unit: 'bounty points', at: [10, 60, 200, 500, 1500], names: ['Loose Change', 'Collector', 'Tax Man', 'Crown Jeweler', 'The Treasury'], v: (c) => c.my.reduce((n, x) => n + (x.won ? x.m.bounty : 0), 0) },
  { id: 'defend', e: '👑', name: 'Crown Keeper', unit: 'crown defences', at: [1, 5, 15, 40, 100], names: ['Seat Warmer', 'Gatekeeper', 'Castle Wall', 'Iron Throne', 'Dynasty'], v: (c) => c.my.filter((x) => x.won && x.m.defended).length },
  { id: 'peak', e: '📈', name: 'Summit', unit: 'Elo peak', at: [1050, 1100, 1150, 1200, 1300], names: ['Base Camp', 'Foothills', 'Ridge', 'Summit', 'Thin Air'], v: (c) => Math.max(1000, ...c.my.map((x) => x.eloAfter)) },
  { id: 'losses', e: '🩹', name: 'Character Building', unit: 'losses', at: [5, 25, 75, 200, 500], names: ['Bruised', 'Humbled', 'Seasoned', 'Battle Scarred', 'Unbreakable Spirit'], v: (c) => c.my.filter((x) => !x.won).length },
  { id: 'days', e: '📅', name: 'Showing Up', unit: 'days played', at: [3, 10, 25, 60, 150], names: ['Drop In', 'Familiar Face', 'Fixture', 'Furniture', 'Load Bearing Wall'], v: (c) => new Set(c.my.map((x) => x.d.toDateString())).size },
  { id: 'opps', e: '🧭', name: 'Social Butterfly', unit: 'different opponents', at: [3, 6, 9, 15, 25], names: ['Small Circle', 'Networker', 'Mingler', 'Office Celebrity', "Everyone's Nemesis"], v: (c) => new Set(c.my.map((x) => x.opp)).size },
  { id: 'calls', e: '🔮', name: 'Crystal Ball', unit: 'correct calls', at: [3, 15, 50, 120, 300], names: ['Lucky Guess', 'Hunch Haver', 'Tea Leaf Reader', 'Seer', 'Nostradamus'], v: (c) => c.nr.hits ?? 0 },
  { id: 'chat', e: '🗣️', name: 'Trash Talker', unit: 'chat messages', at: [10, 50, 150, 400, 1000], names: ['Mumbler', 'Commentator', 'Hype Engine', 'Loudspeaker', 'The Broadcast'], v: (c) => c.cnt.chat ?? 0 },
  { id: 'cheers', e: '📣', name: 'Crowd Noise', unit: 'cheers', at: [15, 60, 200, 500, 1500], names: ['Clapper', 'Chanter', 'Ultra', 'Stadium', 'Earthquake'], v: (c) => c.cnt.cheers ?? 0 },
  { id: 'comments', e: '💬', name: 'Hot Takes', unit: 'comments', at: [3, 15, 40, 100, 250], names: ['Two Cents', 'Opinionated', 'Columnist', 'Pundit', 'The Editorial Board'], v: (c) => c.comments },
];
const ACHM = Object.fromEntries(ACH.map((a) => [a.id, a]));
const tierOf = (a, v) => a.at.filter((t) => v >= t).length;
function achProgress(p) {
  const c = badgeCtx(p);
  return ACH.map((a) => { const v = a.v(c); return { a, v, t: tierOf(a, v) }; });
}

// Új badge-ek felismerése: az első futás csak megjegyzi, ami már megvan
function syncBadges(pids) {
  const out = {};
  S.badgeSeen ??= {};
  S.badgeQueue ??= [];
  for (const pid of new Set(pids)) {
    const p = P(pid);
    if (!p) continue;
    const got = earnedBadges(p);
    const tiers = Object.fromEntries(achProgress(p).map((x) => [x.a.id, x.t]));
    S.tierSeen ??= {};
    if (!S.badgeSeen[pid]) { S.badgeSeen[pid] = got; S.tierSeen[pid] = tiers; out[pid] = []; continue; }
    out[pid] = [...got].filter((id) => !S.badgeSeen[pid].has(id));
    out[pid].forEach((id) => {
      S.badgeSeen[pid].add(id);
      S.inbox.unshift({ id: uid(), to: pid, type: 'badge', title: `Badge unlocked: ${BADGE[id].name}`, body: BADGE[id].desc, ts: now(), read: false, e: BADGE[id].e });
      if (pid === S.me) S.badgeQueue.push(id);
    });
    // tier-lépések: kulcs "t:<achievement>:<tier>"
    for (const [aid, t] of Object.entries(tiers)) {
      for (let k = (S.tierSeen[pid][aid] ?? 0) + 1; k <= t; k++) {
        const a = ACHM[aid], key = `t:${aid}:${k}`;
        out[pid].push(key);
        S.inbox.unshift({ id: uid(), to: pid, type: 'badge', title: `${TIERS[k - 1].label}: ${a.names[k - 1]}`, body: `${a.name}. ${a.at[k - 1]} ${a.unit}.`, ts: now(), read: false, e: a.e });
        if (pid === S.me) S.badgeQueue.push(key);
      }
      S.tierSeen[pid][aid] = t;
    }
  }
  return out;
}
// saját számláló (chat, cheer) növelése, és ha badge jött, látszódjon
function bump(k) {
  const c = (S.counters[S.me] ??= {});
  c[k] = (c[k] || 0) + 1;
  if (syncBadges([S.me])[S.me]?.length) render();
}

// Fix seedű véletlen, hogy a minta minden betöltésnél ugyanaz legyen
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A minta szezon: ~150 meccs 40 napon át, ugyanazokkal a szabályokkal (Elo, bounty, korona),
// így a ranglista, a History, a címek és a statisztikák mind ugyanabból jönnek.
function simulateSeason() {
  const rnd = mulberry32(81);
  // külön seed, hogy a golyó-csoport ne változtassa a szezon eredményeit; van, aki a csíkosra esküszik
  const rg = mulberry32(33);
  const STRIPES = { p4: 0.78, p7: 0.7, p2: 0.35, p6: 0.3 };
  const skill = { p1: 1240, p2: 1215, p3: 1190, p4: 1165, p5: 1140, p6: 1110, p7: 1085, p8: 1055, p9: 1035, p10: 1120 };
  const N = 150, span = 40 * DAY, t0 = now() - span;
  S.players.forEach((p) => Object.assign(p, { elo: 1000, peak: 1000, wins: 0, losses: 0, streak: 0, bestStreak: 0, form: [], lastPlayedAt: null }));
  S.seasonStart = Object.fromEntries(S.players.map((p) => [p.id, 1000]));
  const tally = { upsets: {}, week: {}, wall: {}, kings: {}, cursed: {}, ducks: { p6: 4, p5: 1 } };
  const inc = (k, id, n = 1) => (tally[k][id] = (tally[k][id] || 0) + n);
  const top = () => S.players.filter((p) => p.lastPlayedAt != null).sort((x, y) => y.elo - x.elo || x.id.localeCompare(y.id))[0]?.id ?? null;
  let crownSince = t0;
  const matches = [];
  const workDays = [];
  for (let d = startOfDay(t0); d <= startOfDay(now()); d += DAY) { const wd = new Date(d).getDay(); if (wd !== 0 && wd !== 6) workDays.push(d); }
  for (let i = 0; i < N; i++) {
    // irodaidő: csak munkanapokon, 9:00 és 18:24 között; a legutóbbi meccs pedig pár perce volt
    const pos = (i / (N - 1)) * workDays.length;
    const wd = workDays[Math.min(workDays.length - 1, Math.floor(pos))];
    const ts = i === N - 1 ? now() - 14 * 60_000 : Math.min(Math.round(wd + 9 * 3_600_000 + (pos % 1) * 9.4 * 3_600_000), now() - (N - i) * 20 * 60_000);
    // Gergő 22 napja nem játszott, ezért dormant
    // a koronás az utolsó 3 napban nem állt ki, ezért nő rajta a bounty
    const holderNow = ts > now() - 3.2 * DAY ? top() : null;
    const pool = S.players.filter((p) => (p.id !== 'p10' || ts < t0 + 17 * DAY) && p.id !== holderNow);
    const a = pool[Math.floor(rnd() * pool.length)];
    let b = a;
    while (b === a) b = pool[Math.floor(rnd() * pool.length)];
    const [w, l] = rnd() < expected(skill[a.id], skill[b.id]) ? [a, b] : [b, a];
    const holder = top();
    const exp = expected(w.elo, l.elo);
    const d = Math.max(1, Math.round(K * (1 - exp)));
    const days = Math.max(0, Math.round((startOfDay(ts) - startOfDay(crownSince)) / DAY));
    const bb = holder === l.id ? Math.min(BOUNTY_CAP, days * BOUNTY_PER_DAY) : 0;
    w.elo += d + bb; l.elo = Math.max(ELO_FLOOR, l.elo - d - bb);
    w.peak = Math.max(w.peak, w.elo);
    w.wins++; l.losses++;
    w.streak = w.streak > 0 ? w.streak + 1 : 1; l.streak = l.streak < 0 ? l.streak - 1 : -1;
    w.bestStreak = Math.max(w.bestStreak, w.streak);
    w.form.push('W'); l.form.push('L');
    w.lastPlayedAt = l.lastPlayedAt = ts;
    const upset = exp < 0.4, defended = holder === w.id;
    if (upset) { inc('upsets', w.id); inc('cursed', l.id); }
    if (bb) inc('kings', w.id, bb);
    if (defended) inc('wall', w.id);
    if (ts > now() - 7 * DAY) { inc('week', w.id); inc('week', l.id); }
    matches.unshift({ id: 'm' + i, ts, w: w.id, l: l.id, delta: d, bounty: bb, defended, season: 1, wElo: w.elo, lElo: l.elo, upset, group: rg() < (STRIPES[w.id] ?? 0.5) ? 'stripes' : 'solids', reactions: {}, comments: [] });
    matches[0].took = top() === w.id && holder !== w.id;
    if (top() !== holder || bb > 0) crownSince = ts;
  }
  // a legfrissebb meccseken már van közösségi élet
  const lines = [['l', 'rematch friday'], ['w', 'any time 🎱'], ['x', 'that bank shot though'], ['l', 'I scratched on the 8. never again'], ['x', 'called it'], ['w', 'too easy']];
  matches.slice(0, 6).forEach((m, i) => {
    const others = S.players.filter((p) => p.id !== m.w && p.id !== m.l);
    others.slice(i % 3, (i % 3) + 4 - (i % 3)).forEach((p, j) => { m.reactions[p.id] = REACTIONS[(i + j) % REACTIONS.length]; });
    const [who, text] = lines[i];
    if (i % 2 === 0) m.comments.push({ id: uid(), author: who === 'w' ? m.w : who === 'l' ? m.l : others[i].id, text, ts: m.ts + 3 * 60_000 });
  });
  S.matches = matches; S.tally = tally; S.crownSince = crownSince;
  S.counters = { p7: { chat: 14, cheers: 22 }, p9: { chat: 6, cheers: 16 }, p2: { chat: 9, cheers: 4 }, p6: { chat: 11, cheers: 9 } };

  // tippelők: konzisztens minta számok
  const r2 = mulberry32(5);
  S.nerve = {};
  ['p7', 'p9', 'p6', 'p4', 'p8', 'p10', 'p2', 'p5'].forEach((id) => {
    const calls = 6 + Math.floor(r2() * 12);
    const hits = Math.round(calls * (0.38 + r2() * 0.34));
    const locks = 1 + Math.floor(r2() * 3);
    const lockHits = Math.min(locks, Math.round(locks * r2()));
    const against = Math.floor(calls * r2() * 0.45);
    S.nerve[id] = { nerve: Math.round(1000 + (hits - calls / 2) * 14 + lockHits * 8 - (locks - lockHits) * 8), calls, hits, locks, lockHits, against };
  });
}
simulateSeason();
S.players.forEach((p) => syncBadges([p.id]));

function seedChallenges() {
  const L = ranked().filter((p) => p.id !== S.me);
  const mk = (from, to, status, extra = {}) => ({
    id: uid(), from: from.id, to: to.id, status, createdAt: now() - 3600_000,
    fromElo: from.elo, toElo: to.elo, preds: {}, chat: [], startedAt: null, ...extra,
  });
  const out = [];
  // élő meccs, amit nézőként lehet követni
  if (L.length >= 5) {
    // sim: a meccs magától lezárul pár perccel a tippek zárása után, értesítésekkel
    const live = mk(L[2], L[4], 'live', { startedAt: now() - 25_000, sim: true });
    const fans = L.filter((p) => p !== L[2] && p !== L[4]);
    fans.slice(0, 4).forEach((p, i) => { live.preds[p.id] = { pick: i === 2 ? L[4].id : L[2].id, lock: i === 2 }; });
    live.chat = [
      [fans[0], `${L[2].name} ma nem hibázik`], [fans[1], `lock on ${L[4].name} 🔒`],
      [fans[2], 'that break was illegal'], [fans[3] ?? fans[0], '🎱🎱🎱'],
    ].map(([a, text]) => ({ id: uid(), author: a.id, text, ts: now() }));
    out.push(live);
  }
  if (L.length >= 7) {
    const agreed = mk(L[3], L[1], 'accepted');
    agreed.preds = { [L[5].id]: { pick: L[1].id } };
    out.push(agreed, mk(L[5], L[6], 'pending'));
  }
  if (L[0] && !busyWith(L[0].id)) out.push(mk(L[0], P(S.me), 'pending', { createdAt: now() - 40 * 60_000 }));
  out.forEach((c) => (c.expiresAt = c.createdAt + EXPIRY_MS));
  S.challenges = out;
}

function seedInbox(id) {
  if (S.inbox.some((n) => n.to === id)) return;
  const ago = (m) => now() - m * 60_000;
  const items = [{ type: 'welcome', title: `Season ${S.season} is on`, body: 'Your results, your calls and the crown land here. Nothing else.', ts: ago(600), read: true }];
  const last = S.matches[0];
  if (last && last.l === id) items.unshift({ type: 'match_result', title: `${P(last.w).name} beat you`, body: `−${last.delta + last.bounty}, now #${rankOf(P(id)) || '?'}.`, ts: last.ts, read: false });
  else if (last && last.w !== id) items.unshift({ type: 'prediction_result', title: 'You called it', body: `${P(last.w).name} beat ${P(last.l).name}.`, ts: last.ts, read: false });
  S.inbox.push(...items.map((x) => ({ id: uid(), to: id, ...x })));
}

// ---------- Címek ----------

function titles() {
  const top = (map, min = 1) => {
    const e = Object.entries(map).filter(([id, v]) => P(id) && v >= min).sort((a, b) => b[1] - a[1])[0];
    return e ? { id: e[0], v: e[1] } : null;
  };
  const oracleE = Object.entries(S.nerve).filter(([id, v]) => P(id) && v.calls >= 5 && v.nerve > 1000).sort((a, b) => b[1].nerve - a[1].nerve)[0];
  const t = S.tally;
  const list = [
    { e: '🗡️', name: 'Giant Killer', h: top(t.upsets), unit: (v) => `${v} upset wins` },
    { e: '⚙️', name: 'Iron Man', h: top(t.week), unit: (v) => `${v} matches this week` },
    { e: '🧱', name: 'The Wall', h: top(t.wall), unit: (v) => `${v} defences held` },
    { e: '👑', name: 'Kingslayer', h: top(t.kings), unit: (v) => `${v} bounty claimed` },
    { e: '💀', name: 'Cursed', h: top(t.cursed), unit: (v) => `${v} bad losses` },
    { e: '🦆', name: 'The Duck', h: top(t.ducks), unit: (v) => `${v} ducked` },
    { e: '🔮', name: 'The Oracle', h: oracleE ? { id: oracleE[0], v: oracleE[1].nerve } : null, unit: (v) => `${v} nerve` },
    { e: '🃏', name: 'The Contrarian', h: top(Object.fromEntries(Object.entries(S.nerve).map(([id, v]) => [id, v.against ?? 0])), 2), unit: (v) => `${v} calls against the room` },
    { e: '🎯', name: 'Sharpshooter', h: P('p7') ? { id: 'p7', v: 6 } : null, unit: (v) => `${v} calls in a row` },
  ];
  return list.filter((x) => x.h).map((x) => ({ e: x.e, name: x.name, holderId: x.h.id, holder: P(x.h.id).name, value: x.unit(x.h.v) }));
}

// ---------- HTML építőkockák ----------

const ballHTML = (n, size, extra = '') => {
  const cls = ['ball', n > 8 ? 'striped' : '', n === 8 ? 'eight' : ''].join(' ');
  return `<div class="${cls}" style="--c:${ballOf(n).c};${size ? `--size:${size}px;` : ''}${extra}"><span class="n">${n}</span></div>`;
};
const avatar = (p, size = '') => {
  const cls = ['avatar', size, p.ball > 8 ? 'striped' : '', p.ball === 8 ? 'eight' : ''].join(' ');
  return `<div class="${cls}" style="--c:${ballOf(p.ball).c}" aria-hidden="true"><div class="ring"></div><div class="face">${esc(p.name[0])}</div>${ballHTML(p.ball)}</div>`;
};
const dot = (p) => `<span class="dot${p.ball === 8 ? ' eight' : ''}" style="background:${ballOf(p.ball).c}"></span>`;
const formHTML = (p) => {
  const f = p.form.slice(-5);
  return `<span class="form" role="img" aria-label="${f.length ? 'Form ' + f.join(' ') : 'No matches yet'}">${f.map((x) => `<i class="${x === 'W' ? 'w' : ''}"></i>`).join('')}</span>`;
};
const icon = (name) => `<i data-lucide="${name}"></i>`;
const you = (p) => (p.id === S.me ? '<span class="you">You</span>' : '');
const pressed = (on) => `aria-pressed="${on ? 'true' : 'false'}"`;
const eloChip = () => {
  const me = P(S.me);
  return `<button class="chip chip-elo" data-a="open" data-v="profile" aria-label="Your profile, ${me.elo} Elo">${ballHTML(me.ball, 24)}<span data-ck="elo:${me.id}">${me.elo}</span></button>`;
};
const bell = () => {
  const n = unread() + (S.challenges.some((c) => c.status === 'pending' && c.to === S.me) ? 1 : 0);
  return `<button class="btn btn-secondary btn-icon bell" data-a="sheet" data-v="inbox" aria-label="Activity${n ? `, ${n} new` : ''}">${icon('bell')}${n ? `<span class="bell-badge">${n}</span>` : ''}</button>`;
};
const pageTop = (title) => `<div class="top"><h1 class="page-title">${title}</h1><span class="row" style="gap:6px;flex-wrap:nowrap">${bell()}${eloChip()}</span></div>`;

// ---------- Nézetek ----------

function viewIdentity() {
  return `<div class="scroll no-tabs"><div class="identity">
    <div class="mark" aria-hidden="true">${[1, 9, 8, 3, 11].map((n, k) => ballHTML(n, 40, `--k:${k}`)).join('')}</div>
    <h1 style="--i:1">Who's playing?</h1>
    <p style="--i:2">Pick yourself once on this phone. No password, the office trusts you.</p>
    <div class="lb" style="--i:3">${ranked().concat(S.players.filter(isDormant)).map((p) => `
      <button class="tap lb-row" data-a="setMe" data-v="${p.id}">
        <span class="pos"></span>${avatar(p, 'sm')}
        <span class="who"><span class="name">${esc(p.name)}</span><span class="muted">${esc(p.dept)}</span></span>
        <span class="elo">${p.elo}</span>
      </button>`).join('')}
    </div>
    <button class="btn btn-secondary btn-block" style="--i:4" data-a="sheet" data-v="enrol:self">${icon('user-plus')}I'm new here</button>
  </div></div>`;
}

function crownCard() {
  const holder = crownHolder();
  if (!holder) {
    return `<div class="feature crown">${ballHTML(1, 150).replace('class="ball', 'class="big-ball ball')}
      <div class="feature-text"><h2>The crown is empty</h2><p>Nobody has played in ${DORMANT_DAYS} days. First winner takes the top.</p></div>
      <button class="btn btn-dark btn-sm" data-a="sheet" data-v="log">${icon('plus')}Log a match</button>
    </div>`;
  }
  const days = midnightsSince(S.crownSince);
  const mine = holder.id === S.me;
  const text = days === 0
    ? (mine ? 'Taken today. Hold it past midnight and the bounty starts growing.' : 'Taken today. Nothing to win yet.')
    : mine
      ? `${days} ${days === 1 ? 'day' : 'days'} undefended. Every day adds ${BOUNTY_PER_DAY} to the price on your head.`
      : `${days} ${days === 1 ? 'day' : 'days'} undefended. Beat ${esc(holder.name)} and it's yours.`;
  return `<div class="feature crown${fresh.has('crown') ? ' crown-new' : ''}">
    ${ballHTML(1, 150).replace('class="ball', 'class="big-ball ball')}
    <div class="feature-text">
      <h2>${mine ? 'You hold the crown' : `${esc(holder.name)} holds the crown`}</h2>
      <p>${text}</p>
    </div>
    <div class="row" style="justify-content:space-between">
      <span class="bounty" aria-label="Bounty ${bounty()}">+<span data-ck="bounty">${bounty()}</span></span>
      ${mine ? '<span class="chip chip-dark">👑 Yours</span>'
        : `<button class="btn btn-dark btn-sm" data-a="callout" data-v="${holder.id}">${icon('swords')}Take it</button>`}
    </div>
  </div>`;
}

// A szezon utolsó 48 órája: mi történhet még egyetlen meccsen
function finaleHTML() {
  const end = S.seasonEndsAt;
  if (!end || end <= now() || end - now() > FINALE_WINDOW_MS) return '';
  const r = ranked();
  if (r.length < 2) return '';
  const holder = r[0];
  const lines = [];
  const contenders = r.filter((p) => p.id !== holder.id && rankIfWin(p, holder) === 1);
  const b = bounty();
  lines.push(contenders.length
    ? `${joinNames(contenders.slice(0, 3).map((p) => esc(p.name)))}${contenders.length > 3 ? ` and ${contenders.length - 3} more` : ''} can still take ${esc(holder.name)}'s crown with one win${b ? ` and the ${b} point bounty` : ''}.`
    : `Nobody can take ${esc(holder.name)}'s crown in a single match. It ends on the table or not at all.`);
  const me = r.find((p) => p.id === S.me);
  if (me) {
    const myRank = rankOf(me);
    if (me.id === holder.id) {
      lines.push(rankIfWin(r[1], me) === 1 ? `You hold it. Lose to ${esc(r[1].name)} and the season is theirs.` : 'You hold it, and one loss cannot cost you the crown. Stay sharp anyway.');
    } else {
      const above = r[myRank - 2], below = r[myRank];
      const up = rankIfWin(me, above);
      const climb = up < myRank ? `One win over ${esc(above.name)} puts you at #${up}.` : `Beating ${esc(above.name)} still leaves you #${myRank}. It would take two.`;
      const guard = below && rankIfWin(below, me) < myRank + 1 ? ` Lose to ${esc(below.name)} and they finish above you.` : '';
      lines.push(climb + guard);
    }
  }
  let race = null;
  r.slice(0, 5).forEach((upper, i) => {
    const lower = r[i + 1];
    if (!lower || upper.id === holder.id || [upper.id, lower.id].includes(S.me)) return;
    const gap = upper.elo - lower.elo;
    if (rankIfWin(lower, upper) <= i + 1 && (!race || gap < race.gap)) race = { upper, lower, gap, i };
  });
  if (race) lines.push(`#${race.i + 1} is ${plural(race.gap, 'point')}: ${esc(race.upper.name)} over ${esc(race.lower.name)}. One match settles it.`);
  const final = isFinalDay(end);
  const canTake = contenders.some((p) => p.id === S.me);
  return `<div class="card finale">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h3>${final ? 'Final day' : 'Final 48 hours'}</h3><span class="chip chip-crown">${describeTimeLeft(end)} left</span></div>
    ${lines.map((t) => `<p>${t}</p>`).join('')}
    ${canTake && !liveOf(S.me) ? `<button class="btn btn-primary btn-block" data-a="sheet" data-v="table:${holder.id}">${icon('crown')}Go for the crown</button>` : ''}
  </div>`;
}

function seasonTag() {
  const end = S.seasonEndsAt;
  const tail = !end ? '' : isFinalDay(end) ? '<span class="chip chip-crown">Final day</span>' : `<span class="muted">Ends in ${describeTimeLeft(end)}</span>`;
  return `<span class="row" style="gap:8px"><span class="muted">Season ${S.season}</span>${tail}</span>`;
}

function viewRanks() {
  const r = ranked();
  const dormant = S.players.filter(isDormant);
  const tl = titles();
  return `<div class="scroll">
    ${pageTop('Ranks')}
    ${crownCard()}
    ${finaleHTML()}

    <div class="sec">
      <div class="sec-head"><h3>Ladder</h3>${seasonTag()}</div>
      ${r.length ? `<div class="lb" data-list="ladder">${r.map((p, i) => `
        <button class="tap lb-row${i === 0 ? ' first' : ''}${i > 0 && i < 3 ? ' medal-' + (i + 1) : ''}${p.id === S.me ? ' me' : ''}" data-id="${p.id}" data-a="open" data-v="${p.id === S.me ? 'profile' : 'player:' + p.id}">
          ${i < 3 ? `<span class="medal m${i + 1}" aria-label="Rank ${i + 1}">${i + 1}</span>` : `<span class="pos">${i + 1}</span>`}${avatar(p, 'sm')}
          <span class="who"><span class="name">${i === 0 ? '👑 ' : ''}${esc(p.name)}${you(p)}</span>${formHTML(p)}</span>
          <span class="elo" data-ck="elo:${p.id}">${p.elo}</span>
        </button>`).join('')}
      </div>` : `<div class="empty">${ballHTML(9, 64)}<h3>Empty ladder</h3><p>Play a match to get on it.</p></div>`}
    </div>

    ${tl.length ? `<div class="sec">
      <div class="sec-head"><h3>Titles</h3></div>
      <div class="titles">${tl.map((t) => `
        <div class="title"><span class="emoji" aria-hidden="true">${t.e}</span>
          <div class="title-text"><span class="title-name">${t.name}</span><span class="title-holder">${esc(t.holder)}</span><span class="title-value">${t.value}</span></div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    ${dormant.length ? `<div class="sec">
      <div class="sec-head"><h3>Dormant</h3><span class="muted">${DORMANT_DAYS}+ days away</span></div>
      <div class="lb">${dormant.map((p) => `
        <button class="tap lb-row dormant" data-a="open" data-v="${p.id === S.me ? 'profile' : 'player:' + p.id}">
          <span class="pos" aria-label="Dormant">${icon('moon')}</span>${avatar(p, 'sm')}
          <span class="who"><span class="name">${esc(p.name)}${you(p)}</span><span class="muted">${p.lastPlayedAt ? `Last played ${ago(p.lastPlayedAt)} ago` : 'No matches yet'}</span></span>
          <span class="elo">${p.elo}</span>
        </button>`).join('')}</div>
    </div>` : ''}

    <button class="btn btn-secondary btn-block" data-a="sheet" data-v="enrol">${icon('user-plus')}Enrol a player</button>
  </div>`;
}

function challengeCard(ch) {
  const a = P(ch.from), b = P(ch.to);
  const meIn = ch.from === S.me || ch.to === S.me;
  const cls = `card${fresh.has(ch.id) ? ' is-new' : ''}`;
  const line = `<div class="match-line">
      <div class="side">${avatar(a, 'sm')}<span class="pn">${esc(a.name)}</span></div>
      <span class="vs">VS</span>
      <div class="side right">${avatar(b, 'sm')}<span class="pn">${esc(b.name)}</span></div>
    </div>`;

  if (ch.status === 'pending' && ch.to === S.me) {
    const s = stakeFor(b, a);
    return `<div class="${cls}">
      <h3>${esc(a.name)} called you out</h3>
      <div class="stakes">
        <div class="stake"><span class="label">If you win</span><span class="v">+${s.win}</span>${s.bonus ? `<span class="muted">incl. 👑 ${s.bonus} bounty</span>` : ''}</div>
        <div class="stake"><span class="label">If you lose</span><span class="v">−${s.lose}</span>${s.risk ? `<span class="muted">incl. your 👑 ${s.risk} bounty</span>` : ''}</div>
      </div>
      <div class="row" style="justify-content:space-between"><span class="muted">${hoursLeft(ch)}h left to answer</span><span class="muted">Sent ${ago(ch.createdAt)} ago</span></div>
      <div class="row"><button class="btn btn-primary grow" data-a="accept" data-v="${ch.id}">Accept</button><button class="btn btn-secondary" data-a="sheet" data-v="decline:${ch.id}">Decline</button></div>
    </div>`;
  }
  if (ch.status === 'pending' && ch.from === S.me) {
    return `<div class="${cls}">${line}
      <div class="row" style="justify-content:space-between"><span class="muted">Waiting for ${esc(b.name)}. ${hoursLeft(ch)}h left</span><button class="btn btn-secondary btn-sm" data-a="cancelCh" data-v="${ch.id}">Cancel</button></div>
    </div>`;
  }
  if (ch.status === 'accepted' && meIn) {
    const opp = ch.from === S.me ? b : a;
    const s = stakeFor(P(S.me), opp);
    return `<div class="${cls}">${line}${splitBar(ch)}
      <span class="muted">Worth +${s.win} or −${s.lose} to you</span>
      <div class="row"><button class="btn btn-primary grow" data-a="start" data-v="${ch.id}">${icon('play')}Start match</button><button class="btn btn-secondary btn-icon" data-a="sheet" data-v="result:${ch.id}" aria-label="Log result">${icon('flag')}</button></div>
    </div>`;
  }
  // nézőként: tippelés
  return `<div class="${cls}">${line}${splitBar(ch)}${ch.status === 'pending' ? `<span class="muted">Waiting on ${esc(b.name)}. ${hoursLeft(ch)}h left</span>` : ''}${callButtons(ch)}</div>`;
}

// Közös osztott sáv a nevek alatt: hányan kire tippeltek
function splitBar(ch, cls = '') {
  const a = P(ch.from), b = P(ch.to);
  const preds = Object.values(ch.preds);
  const ca = preds.filter((x) => x.pick === a.id).length, cb = preds.filter((x) => x.pick === b.id).length;
  const t = ca + cb;
  const pa = t ? Math.round((ca / t) * 100) : 0, pb = t ? 100 - pa : 0;
  const mine = ch.preds[S.me]?.pick;
  const seg = (p, n, side) => `<span data-gk="split:${ch.id}:${side}" class="${p.ball === 8 ? 'eight' : ''}" style="flex-grow:${n || 0.001};background:${ballOf(p.ball).c}"></span>`;
  const leg = (p, n, pc) => `<span style="color:${cls ? '#fff' : ballOf(p.ball).t}"><b>${pc}%</b> ${plural(n, 'call')}${mine === p.id ? ' <span class="yours">You</span>' : ''}</span>`;
  return `<div class="split${cls ? ' ' + cls : ''}" role="img" aria-label="${ca} calls for ${esc(a.name)}, ${cb} for ${esc(b.name)}">
    <div class="call-split${t ? '' : ' none'}">${t ? seg(a, ca, 'a') + seg(b, cb, 'b') : ''}</div>
    ${t ? `<div class="call-legend">${leg(a, ca, pa)}${leg(b, cb, pb)}</div>` : '<div class="call-legend none"><span>No calls yet</span></div>'}
  </div>`;
}

function callButtons(ch, prefix = '') {
  if (ch.from === S.me || ch.to === S.me) return '';
  const a = P(ch.from), b = P(ch.to);
  const mine = ch.preds[S.me];
  const count = (id) => Object.values(ch.preds).filter((x) => x.pick === id).length;
  if (ch.status === 'live' && ch.startedAt + VOTE_MS <= now() && !mine) return '<span class="muted">Calls are closed</span>';
  if (mine) {
    return `<p class="called">You called <b style="color:${ballOf(P(mine.pick).ball).t}">${esc(P(mine.pick).name)}</b>${mine.lock ? ' as your lock 🔒' : ''}.</p>`;
  }
  const lockUsed = S.lockDay === new Date().toDateString();
  const armed = S.lockArm === ch.id;
  return `<div class="call-btns">
      ${[a, b].map((p) => `<button class="call-btn" data-a="call" data-v="${ch.id}:${p.id}">${dot(p)}${prefix}${esc(p.name)}</button>`).join('')}
    </div>
    <button class="chip chip-neutral lock${armed ? ' on' : ''}" data-a="lock" data-v="${ch.id}" ${pressed(armed)} ${lockUsed ? 'disabled' : ''}>${lockUsed ? '🔒 Lock used today' : armed ? '🔒 Lock armed, counts double' : '🔒 Make this call my lock'}</button>`;
}

function viewArena() {
  const live = S.challenges.filter((c) => c.status === 'live');
  const forMe = S.challenges.filter((c) => c.status === 'pending' && c.to === S.me);
  const agreed = S.challenges.filter((c) => c.status === 'accepted');
  const waiting = S.challenges.filter((c) => c.status === 'pending' && c.to !== S.me);
  const nerveRows = Object.entries({ ...S.nerve, ...(S.nerve[S.me] ? {} : { [S.me]: { nerve: 1000, calls: 0 } }) })
    .map(([id, v]) => ({ p: P(id), ...v })).filter((x) => x.p).sort((a, b) => b.nerve - a.nerve || a.p.id.localeCompare(b.p.id));

  return `<div class="scroll">
    ${pageTop('Arena')}
    ${liveOf(S.me) ? `<button class="btn btn-live btn-block" data-a="open" data-v="live:${liveOf(S.me).id}">Back to your match</button>`
      : `<button class="btn btn-live btn-block" data-a="sheet" data-v="table">We're on the table</button>`}
    <div class="action-row">
      <button class="btn btn-secondary" data-a="sheet" data-v="log">${icon('clipboard-check')}Log result</button>
      <button class="btn btn-secondary" data-a="callout">${icon('swords')}Call out</button>
      <button class="btn btn-secondary btn-icon" data-a="quick" aria-label="Quick match">${icon('dices')}</button>
    </div>

    ${forMe.length ? `<div class="sec"><div class="sec-head"><h3>For you</h3></div>${forMe.map(challengeCard).join('')}</div>` : ''}

    <div class="sec">
      <div class="sec-head"><h3>On the table now</h3></div>
      ${live.length ? live.map((ch) => {
        const a = P(ch.from), b = P(ch.to);
        const left = ch.startedAt + VOTE_MS - now();
        return `<div class="feature live${fresh.has(ch.id) ? ' is-new' : ''}" role="button" tabindex="0" data-a="open" data-v="live:${ch.id}" aria-label="Watch ${esc(a.name)} against ${esc(b.name)}">
          ${ballHTML(a.ball, 128, '').replace('class="ball', 'class="big-ball corner-l ball')}
          ${ballHTML(b.ball, 128, '').replace('class="ball', 'class="big-ball corner-r ball')}
          <div class="live-names"><span class="ln">${esc(a.name)}</span><span class="vs">VS</span><span class="ln right">${esc(b.name)}</span></div>
          ${splitBar(ch, 'on-live')}
          <p>${plural(Object.keys(ch.preds).length, 'call')} in. ${plural(ch.chat.length, 'message')} in chat.</p>
          <div class="row" style="justify-content:space-between">
            <span class="btn btn-light btn-sm">${icon('tv')}Watch</span>
            <span class="row" style="gap:6px"><span class="chip chip-light chip-dotted">Live</span><span class="chip chip-dark" data-cd="${ch.id}">${left > 0 ? 'Calls ' + mmss(left) : 'Calls closed'}</span></span>
          </div>
        </div>`;
      }).join('') : `<div class="empty">${ballHTML(3, 64)}<h3>Table's free</h3><p>Nobody is playing right now. Somebody should be.</p><button class="btn btn-primary btn-sm" data-a="callout">Call someone out</button></div>`}
    </div>

    ${agreed.length ? `<div class="sec"><div class="sec-head"><h3>Agreed</h3></div>${agreed.map(challengeCard).join('')}</div>` : ''}
    ${waiting.length ? `<div class="sec"><div class="sec-head"><h3>Waiting on an answer</h3></div>${waiting.map(challengeCard).join('')}</div>` : ''}

    <div class="sec">
      <div class="sec-head"><h3>Calling table</h3><span class="muted">Nerve</span></div>
      <div class="lb" data-list="nerve">${nerveRows.map((x, i) => `
        <div class="lb-row${x.p.id === S.me ? ' me' : ''}" data-id="${x.p.id}">
          <span class="pos">${i + 1}</span>${avatar(x.p, 'xs')}
          <span class="who"><span class="name">${esc(x.p.name)}${you(x.p)}</span><span class="muted">${x.calls} calls</span></span>
          <span class="elo" data-ck="nerve:${x.p.id}">${x.nerve}</span>
        </div>`).join('')}</div>
    </div>
  </div>`;
}

function viewLive(ch) {
  const a = P(ch.from), b = P(ch.to);
  const left = ch.startedAt + VOTE_MS - now();
  const preds = Object.values(ch.preds);
  const ca = preds.filter((x) => x.pick === a.id).length, cb = preds.filter((x) => x.pick === b.id).length;
  const meIn = ch.from === S.me || ch.to === S.me;
  return `<div class="scroll no-tabs">
    <div class="top">
      <button class="btn btn-secondary btn-icon" data-a="back" aria-label="Back">${icon('chevron-left')}</button>
      <span class="chip chip-live" data-cd="${ch.id}">${left > 0 ? 'Live ' + mmss(left) : 'Live'}</span>
      ${meIn ? `<button class="btn btn-secondary btn-icon" data-a="sheet" data-v="result:${ch.id}" aria-label="Log result">${icon('flag')}</button>` : '<span class="btn-icon" aria-hidden="true"></span>'}
    </div>
    <div class="live-stage" id="stage">
      <div class="versus">
        ${[a, b].map((p, i) => `${i === 1 ? '<div class="vs">VS</div>' : ''}<div class="side">${avatar(p, 'lg')}<div class="pname">${esc(p.name)}</div><div class="pelo">${p.elo}</div><span class="chip chip-neutral">Win +${stakeFor(p, i ? a : b).win}</span></div>`).join('')}
      </div>
      ${splitBar(ch)}
      ${callButtons(ch, 'Call ')}
      <div class="cheers">${CHEERS.map((e) => `<button data-a="cheer" data-v="${e}" aria-label="Cheer ${e}">${e}</button>`).join('')}</div>
      <div class="chat" id="chat" aria-live="polite">${ch.chat.map((m) => chatLine(m)).join('')}</div>
      <form class="composer" data-form="chat" data-v="${ch.id}">
        <input id="chatInput" name="text" placeholder="Send a message" autocomplete="off" maxlength="280" aria-label="Chat message">
        <button class="btn btn-primary btn-icon" aria-label="Send">${icon('send')}</button>
      </form>
      ${meIn ? `<button class="btn btn-primary btn-block" data-a="sheet" data-v="result:${ch.id}">${icon('flag')}Log the result</button>
        <button class="btn btn-secondary btn-block" data-a="unstart" data-v="${ch.id}">Not playing after all</button>` : ''}
    </div>
  </div>`;
}
const chatLine = (m, isNew) => {
  const p = P(m.author);
  return `<div class="chat-line${isNew ? ' is-new' : ''}"><span class="bdot${p.ball === 8 ? ' eight' : ''}" style="background:${ballOf(p.ball).c}"></span><span><b style="color:${ballOf(p.ball).t}">${esc(p.name)}</b> ${esc(m.text)}</span></div>`;
};

function resultCard(m) {
  const w = P(m.w), l = P(m.l);
  const r = Object.values(m.reactions).reduce((acc, e) => ((acc[e] = (acc[e] || 0) + 1), acc), {});
  return `<div class="tap result${fresh.has(m.id) ? ' is-new' : ''}" role="button" tabindex="0" data-a="open" data-v="match:${m.id}" aria-label="${esc(w.name)} beat ${esc(l.name)}, plus ${m.delta + m.bounty}">
    <div class="result-players">
      <div class="result-side">${avatar(w)}<span class="rn">${esc(w.name)}</span><span class="row" style="gap:4px;justify-content:center"><span class="chip chip-win">W</span>${m.group ? `<span class="grp" title="${m.group}">${ballHTML(m.group === 'solids' ? 1 : 9, 20)}</span>` : ''}</span></div>
      <div class="delta">+${m.delta + m.bounty}${m.bounty ? `<small>👑 ${m.bounty} bounty</small>` : ''}</div>
      <div class="result-side lost">${avatar(l)}<span class="rn">${esc(l.name)}</span><span class="chip chip-neutral">L</span></div>
    </div>
    <div class="result-meta">
      <div class="reacts">${Object.entries(r).map(([e, n]) => `<span>${e} ${n}</span>`).join('') || '<span class="muted bare">No reactions yet</span>'}</div>
      <span class="row" style="gap:10px">${m.upset ? '<span class="muted">Upset</span>' : ''}<span class="muted row" style="gap:4px">${m.comments.length}${icon('message-circle')}</span><span class="muted">${ago(m.ts)}</span></span>
    </div>
  </div>`;
}

function viewHistory() {
  const list = S.matches.filter((m) => m.season === S.season);
  const older = S.matches.filter((m) => m.season !== S.season);
  const bySeason = older.reduce((acc, m) => ((acc[m.season] ??= []).push(m), acc), {});
  return `<div class="scroll">
    ${pageTop('History')}
    <div class="sec-head"><span class="chip chip-neutral">Season ${S.season}</span><span class="muted">${list.length} matches</span></div>
    ${list.length ? list.slice(0, S.historyLimit).map(resultCard).join('') + (list.length > S.historyLimit ? `<button class="btn btn-secondary btn-block" data-a="more">Show ${Math.min(20, list.length - S.historyLimit)} more</button>` : '') : `<div class="empty">${ballHTML(7, 64)}<h3>Clean slate</h3><p>Season ${S.season} just started. Somebody has to make history.</p><button class="btn btn-primary btn-sm" data-a="callout">Call someone out</button></div>`}

    <div class="sec">
      <div class="sec-head"><h3>Hall of fame</h3></div>
      ${S.seasons.slice().reverse().map((s) => `<div class="card">
        <h3>${esc(s.name)}</h3>
        <div class="hof-titles">${s.titles.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="lb">${s.podium.map(([n, e], i) => `<div class="lb-row${i === 0 ? ' first' : ''}" style="grid-template-columns:20px 1fr auto"><span class="pos">${i + 1}</span><span class="name">${i === 0 ? '🏆 ' : ''}${esc(n)}</span><span class="elo">${e}</span></div>`).join('')}</div>
      </div>`).join('')}
    </div>

    ${Object.keys(bySeason).sort((a, b) => b - a).map((n) => `<div class="sec">
      <div class="sec-head"><h3>Season ${n}</h3><span class="muted">Closed. Read only</span></div>
      ${bySeason[n].slice(0, 10).map(resultCard).join('')}
      ${bySeason[n].length > 10 ? `<span class="muted" style="text-align:center">${bySeason[n].length - 10} older matches archived</span>` : ''}
    </div>`).join('')}

    <div class="card">
      <h3>Season end</h3>
      <p>${S.seasonEndsAt ? `Season ${S.season} closes itself in ${describeTimeLeft(S.seasonEndsAt)}. Standings get archived, a champion is crowned, the next season opens.` : 'No end date. The season runs until someone closes it by hand.'}</p>
      <form class="field" data-form="deadline"><label class="label" for="deadlineInput">End date and time</label>
        <input id="deadlineInput" type="datetime-local" value="${S.seasonEndsAt ? toLocalInput(S.seasonEndsAt) : ''}" min="${toLocalInput(now())}" aria-label="Season end date and time"></form>
      <div class="row" style="flex-wrap:nowrap"><button class="btn btn-primary grow" data-a="saveDeadline">${S.seasonEndsAt ? 'Change end' : 'Set end'}</button>${S.seasonEndsAt ? '<button class="btn btn-secondary" data-a="clearDeadline">Clear</button>' : ''}</div>
    </div>
    <button class="btn btn-secondary btn-block" data-a="sheet" data-v="season">${icon('flag')}Close season ${S.season} now</button>
  </div>`;
}

function viewMatch(m) {
  const w = P(m.w), l = P(m.l);
  const my = m.reactions[S.me];
  const closed = m.season !== S.season;
  const meIn = m.w === S.me || m.l === S.me;
  return `<div class="scroll no-tabs">
    <div class="top"><button class="btn btn-secondary btn-icon" data-a="back" aria-label="Back">${icon('chevron-left')}</button><span class="muted">${closed ? `Season ${m.season}` : `${ago(m.ts)} ago`}</span></div>
    <div class="result-players" style="padding:12px 0">
      <div class="result-side">${avatar(w, 'lg')}<span class="rn">${esc(w.name)}</span><span class="chip chip-win">W ${m.wElo}</span></div>
      <div class="delta" style="font-size:56px">+${m.delta + m.bounty}${m.bounty ? `<small>👑 ${m.bounty} bounty</small>` : ''}</div>
      <div class="result-side lost">${avatar(l, 'lg')}<span class="rn">${esc(l.name)}</span><span class="chip chip-neutral">L ${m.lElo}</span></div>
    </div>
    ${m.upset ? '<p style="text-align:center">Upset. The ladder did not see this coming.</p>' : ''}
    <div class="reacts" style="justify-content:center">${REACTIONS.map((e) => {
      const n = Object.values(m.reactions).filter((x) => x === e).length;
      return closed ? (n ? `<span>${e} ${n}</span>` : '')
        : `<button class="react-btn${my === e ? ' on' : ''}" data-a="react" data-v="${m.id}:${e}" ${pressed(my === e)} aria-label="React ${e}">${e}${n ? ' ' + n : ''}</button>`;
    }).join('')}</div>
    ${meIn && !closed ? `<button class="btn btn-secondary btn-block" data-a="rematch" data-v="${m.w === S.me ? m.l : m.w}">${icon('repeat')}Rematch</button>` : ''}
    <div class="sec">
      <div class="sec-head"><h3>Comments</h3><span class="muted">${m.comments.length}</span></div>
      <div class="card">
        ${m.comments.length ? m.comments.map((c) => {
          const p = P(c.author);
          return `<div class="comment${fresh.has(c.id) ? ' is-new' : ''}">${avatar(p, 'xs')}<div class="body"><span><b style="color:${ballOf(p.ball).t}">${esc(p.name)}</b> <span class="muted">${ago(c.ts)}</span></span><span>${esc(c.text)}</span></div>
            ${c.author === S.me && !closed ? `<button class="btn-ghost" data-a="delComment" data-v="${m.id}:${c.id}" aria-label="Delete comment">${icon('x')}</button>` : ''}</div>`;
        }).join('') : `<p>${closed ? 'No comments.' : 'No comments yet. Say something.'}</p>`}
        ${closed ? '' : `<form class="composer" data-form="comment" data-v="${m.id}"><input id="commentInput" name="text" placeholder="Add a comment" autocomplete="off" maxlength="200" aria-label="Comment"><button class="btn btn-primary btn-icon" aria-label="Post">${icon('send')}</button></form>`}
      </div>
    </div>
  </div>`;
}

function viewPlayer(p, isMe) {
  const me = P(S.me);
  const rank = rankOf(p);
  const vs = S.matches.filter((m) => (m.w === p.id && m.l === S.me) || (m.w === S.me && m.l === p.id));
  const myWins = vs.filter((m) => m.w === S.me).length;
  const theirWins = vs.filter((m) => m.w === p.id).length;
  const held = titles().filter((t) => t.holderId === p.id);
  // legtöbbet játszott ellenfél
  const opp = {};
  S.matches.forEach((m) => { if (m.w === p.id) opp[m.l] = (opp[m.l] || 0) + 1; if (m.l === p.id) opp[m.w] = (opp[m.w] || 0) + 1; });
  const rival = Object.entries(opp).sort((a, b) => b[1] - a[1])[0];
  let raceText = 'Dead level. First to 10 takes the race.';
  if (theirWins >= 10 || myWins >= 10) raceText = theirWins > myWins ? `${esc(p.name)} has already taken the race.` : 'You have already taken the race.';
  else if (theirWins > myWins) raceText = `${esc(p.name)} leads. ${10 - theirWins} more and it's settled for good.`;
  else if (myWins > theirWins) raceText = `You lead. ${10 - myWins} more to close it out.`;
  const busy = busyWith(p.id) || busyWith(S.me);
  const tab = S.profileTab;
  return `<div class="scroll no-tabs">
    <div class="top"><button class="btn btn-secondary btn-icon" data-a="back" aria-label="Back">${icon('chevron-left')}</button>
      ${rank ? `<span class="chip ${rank === 1 ? 'chip-crown' : 'chip-neutral'}">${rank === 1 ? '👑 ' : ''}Rank ${rank}</span>` : '<span class="chip chip-neutral">Dormant</span>'}</div>
    <div class="hero-profile">
      ${avatar(p, 'xl')}
      <h1>${esc(p.name)}</h1>
      <div class="row" style="justify-content:center"><span class="chip chip-neutral">${esc(p.dept)}</span><span class="chip chip-neutral">Ball ${p.ball}</span></div>
      <div class="big-elo" data-ck="elo:${p.id}">${p.elo}</div>
      ${formHTML(p)}
    </div>
    <div class="seg" role="tablist" style="--k:${PTABS.indexOf(tab)};--n:${PTABS.length}"><span class="seg-ind" aria-hidden="true"></span>
      ${PTABS.map((t) => `<button class="${tab === t ? 'on' : ''}" role="tab" aria-selected="${tab === t}" data-a="ptab" data-v="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>
    ${tab === 'stats' ? statsTab(p) : tab === 'rivals' ? rivalsTab(p) : tab === 'badges' ? badgesTab(p) : `<div class="tab-pane">
    <div class="stats">
      <div class="stat"><span class="v">${p.wins}</span><span class="label">Wins</span></div>
      <div class="stat"><span class="v">${p.losses}</span><span class="label">Losses</span></div>
      <div class="stat"><span class="v">${p.streak > 0 ? 'W' + p.streak : p.streak < 0 ? 'L' + -p.streak : '0'}</span><span class="label">Streak</span></div>
      <div class="stat"><span class="v">${p.peak}</span><span class="label">Peak</span></div>
    </div>
    ${rival ? `<div class="card rival-card">${avatar(P(rival[0]), 'sm')}<div class="body"><span class="label">Top rival</span><span><b>${esc(P(rival[0]).name)}</b> <span class="muted">${rival[1]} ${rival[1] === 1 ? 'match' : 'matches'}</span></span></div><span class="muted">Best streak W${p.bestStreak}</span></div>` : ''}
    ${held.length ? `<div class="sec"><div class="sec-head"><h3>Titles held</h3></div><div class="titles">${held.map((t) => `<div class="title"><span class="emoji" aria-hidden="true">${t.e}</span><div class="title-text"><span class="title-name">${t.name}</span><span class="title-value">${t.value}</span></div></div>`).join('')}</div></div>` : ''}
    ${!isMe ? `<div class="sec">
      <div class="sec-head"><h3>You vs ${esc(p.name)}</h3><span class="muted">Race to 10</span></div>
      <div class="card">
        <div class="row" style="justify-content:space-between"><span class="num" style="font-size:28px">${myWins}</span><span class="num" style="font-size:28px">${theirWins}</span></div>
        <div class="race"><span style="flex:${myWins};background:${ballOf(me.ball).c}"></span><span style="flex:${Math.max(0.001, 20 - myWins - theirWins)};background:transparent"></span><span style="flex:${theirWins};background:${ballOf(p.ball).c}"></span></div>
        <p>${vs.length ? raceText : 'You two have not played yet.'}</p>
      </div>
    </div>
    <button class="btn btn-primary btn-block" data-a="callout" data-v="${p.id}" ${busy ? 'disabled' : ''}>${icon('swords')}${busy ? (busyWith(S.me) ? 'Finish your open challenge first' : `${esc(p.name)} is busy`) : `Call ${esc(p.name)} out`}</button>` : `
    <div class="sec"><div class="sec-head"><h3>Your ball</h3></div>
      <div class="card"><div class="ball-grid">${Array.from({ length: 15 }, (_, i) => i + 1).map((n) => `<button class="ball-pick${p.ball === n ? ' on' : ''}" data-a="setBall" data-v="${n}" ${pressed(p.ball === n)} aria-label="Ball ${n}">${ballHTML(n, 40)}</button>`).join('')}</div></div>
    </div>
    <button class="btn btn-secondary btn-block" data-a="switchMe">${icon('repeat')}Switch player</button>`}
    </div>`}
  </div>`;
}

// ---------- Játékos statisztikák ----------

const PTABS = ['overview', 'stats', 'rivals', 'badges'];

function playerStats(p) {
  const ms = S.matches.filter((m) => m.season === S.season && (m.w === p.id || m.l === p.id)).sort((a, b) => a.ts - b.ts);
  const wins = ms.filter((m) => m.w === p.id), losses = ms.filter((m) => m.l === p.id);
  let run = 0, best = 0;
  ms.forEach((m) => { run = m.w === p.id ? run + 1 : 0; best = Math.max(best, run); });
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, m) => s + m.delta + m.bounty, 0) / arr.length) : 0);
  const curve = [S.seasonStart[p.id] ?? 1000, ...ms.map((m) => (m.w === p.id ? m.wElo : m.lElo))];
  return {
    n: ms.length, wins: wins.length, losses: losses.length,
    winRate: ms.length ? Math.round((wins.length / ms.length) * 100) : 0,
    upsets: wins.filter((m) => m.upset).length, bounty: wins.reduce((s, m) => s + m.bounty, 0),
    defended: wins.filter((m) => m.defended).length, best, avgGain: avg(wins), avgLoss: avg(losses),
    curve, peak: Math.max(...curve),
  };
}

function eloChart(p, st) {
  const pts = st.curve;
  if (pts.length < 2) return `<div class="empty">${ballHTML(p.ball, 64)}<h3>No curve yet</h3><p>Play a match this season and the line starts here.</p></div>`;
  const W = 340, H = 150, L = 4, R = 44, T = 14, B = 14;
  const lo = Math.min(...pts) - 12, hi = Math.max(...pts) + 12;
  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H - B} L${x(0)} ${H - B} Z`;
  const pi = pts.lastIndexOf(st.peak), last = pts.length - 1, base = pts[0];
  const gid = 'g' + p.id;
  return `<svg class="elo-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elo from ${base} to ${pts[last]}, peak ${st.peak}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <line class="base" x1="${L}" x2="${W - R}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}"/>
    <text x="${W - R + 6}" y="${(y(base) + 4).toFixed(1)}">${base}</text>
    <text x="${W - R + 6}" y="${(y(st.peak) + 4).toFixed(1)}">${st.peak}</text>
    <path class="area" d="${area}" fill="url(#${gid})"/>
    <path class="curve-line" d="${line}" pathLength="1"/>
    <circle class="pt peak" cx="${x(pi).toFixed(1)}" cy="${y(st.peak).toFixed(1)}" r="4"/>
    <circle class="pt now" cx="${x(last).toFixed(1)}" cy="${y(pts[last]).toFixed(1)}" r="5.5" style="fill:${ballOf(p.ball).c}"/>
  </svg>`;
}

function statsTab(p) {
  const st = playerStats(p);
  const rec = S.nerve[p.id];
  const tile = (key, v, label, pre = '', post = '') => `<div class="tile"><span class="v">${pre}<span data-ck="st:${p.id}:${key}" data-ck-from="0">${v}</span>${post}</span><span class="label">${label}</span></div>`;
  return `<div class="tab-pane">
    <div class="card chart-card">
      <div class="row" style="justify-content:space-between"><h3>Elo this season</h3><span class="muted">${plural(st.n, 'match')}</span></div>
      ${eloChart(p, st)}
      <div class="chart-legend"><span><span class="label">Start</span><b>${st.curve[0]}</b></span><span><span class="label">Peak</span><b>${st.peak}</b></span><span><span class="label">Now</span><b>${p.elo}</b></span></div>
    </div>
    <div class="tiles">
      ${tile('wr', st.winRate, 'Win rate', '', '%')}
      ${tile('n', st.n, 'Matches')}
      ${tile('best', st.best, 'Best streak')}
      ${tile('up', st.upsets, 'Upset wins')}
      ${tile('bounty', st.bounty, 'Bounty claimed')}
      ${tile('def', st.defended, 'Crown defences')}
      ${tile('gain', st.avgGain, 'Avg win', '+')}
      ${tile('loss', st.avgLoss, 'Avg loss', '−')}
      ${tile('peak', st.peak, 'Peak')}
    </div>
    ${groupCard(p)}
    <div class="wl-card card">
      <div class="row" style="justify-content:space-between"><span class="label">Wins</span><span class="label">Losses</span></div>
      <div class="wl-bar"><span style="flex-grow:${st.wins || 0.001}"></span><span style="flex-grow:${st.losses || 0.001}"></span></div>
      <div class="row" style="justify-content:space-between"><b class="num">${st.wins}</b><b class="num">${st.losses}</b></div>
    </div>
    <div class="sec">
      <div class="sec-head"><h3>Calling</h3><span class="muted">Predictions on other matches</span></div>
      ${rec?.calls ? `<div class="tiles">
        ${tile('nerve', rec.nerve, 'Nerve')}
        ${tile('calls', rec.calls, 'Calls')}
        ${tile('hit', Math.round(((rec.hits ?? 0) / rec.calls) * 100), 'Hit rate', '', '%')}
        ${tile('lock', rec.lockHits ?? 0, `Locks hit of ${rec.locks ?? 0}`)}
        ${tile('against', rec.against ?? 0, 'Against the room')}
        ${tile('wrong', rec.calls - (rec.hits ?? 0), 'Missed calls')}
      </div>` : `<div class="empty"><h3>No calls yet</h3><p>Call a live match from the arena and the numbers start here.</p></div>`}
    </div>
  </div>`;
}

function badgesTab(p) {
  const got = earnedBadges(p);
  const everyone = S.players.map((x) => earnedBadges(x));
  const owners = (id) => everyone.filter((set) => set.has(id)).length;
  const list = [...BADGES].sort((a, b) => got.has(b.id) - got.has(a.id) || !!a.secret - !!b.secret);
  const ratio = (x) => (x.t < 5 ? x.v / x.a.at[x.t] : 1);
  const prog = achProgress(p).sort((x, y) => y.t - x.t || ratio(y) - ratio(x));
  const levels = prog.reduce((n, x) => n + x.t, 0), maxLevels = ACH.length * TIERS.length;
  const pct = Math.round((got.size / BADGES.length) * 100);
  return `<div class="tab-pane">
    <div class="card badge-head">
      <div class="head-stats">
        <span><b><span data-ck="st:${p.id}:lvl" data-ck-from="0">${levels}</span></b><span class="label">of ${maxLevels} tiers</span></span>
        <span><b><span data-ck="st:${p.id}:bdg" data-ck-from="0">${got.size}</span></b><span class="label">of ${BADGES.length} badges</span></span>
      </div>
      <div class="tier-legend">${TIERS.map((t) => `<span><i class="tdot" style="--tc:${t.c}"></i>${t.label}</span>`).join('')}</div>
    </div>

    <div class="sec-head"><h3>Achievements</h3><span class="muted">Five tiers each</span></div>
    <div class="ach-list">${prog.map(({ a, v, t }, j) => {
      const cur = t ? TIERS[t - 1] : null, next = t < 5 ? TIERS[t] : null;
      const from = t ? a.at[t - 1] : 0, to = next ? a.at[t] : a.at[4];
      const fill = next ? Math.min(100, Math.round(((v - (a.id === 'peak' && !t ? 1000 : from)) / (to - (a.id === 'peak' && !t ? 1000 : from))) * 100)) : 100;
      return `<div class="ach${t ? ' tier-' + cur.k : ' locked'}" style="--j:${Math.min(j, 14)}">
        <span class="tmedal" style="--tc:${cur ? cur.c : '#222222'};--tf:${cur ? cur.f : '#FFFFFF'}" aria-hidden="true">${a.e}</span>
        <div class="ach-body">
          <div class="ach-top"><b>${esc(t ? a.names[t - 1] : a.name)}</b>${cur ? `<span class="tchip" style="--tc:${cur.c};--tf:${cur.f}">${cur.label}</span>` : '<span class="muted">Locked</span>'}</div>
          <span class="muted">${t ? `${esc(a.name)}. ` : ''}${next ? `Next: ${next.label} ${esc(a.names[t])} at ${a.at[t]} ${a.unit}` : 'Maxed out. Legend.'}</span>
          <div class="progress ach-bar"><span style="width:${Math.max(0, fill)}%;background:${next && next.k !== 'eight' ? next.c : '#FFFFFF'}"></span></div>
          <div class="ach-foot"><span class="num">${v}${next ? ` / ${to}` : ''}</span><span class="pips">${TIERS.map((x, i) => `<i style="--tc:${x.c}" class="${i < t ? 'on' : ''}${x.k === 'eight' ? ' eight' : ''}"></i>`).join('')}</span></div>
        </div>
      </div>`;
    }).join('')}</div>

    <div class="sec-head"><h3>Badges</h3><span class="muted">${BADGES.filter((b) => b.secret).length} secret</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="badge-grid">${list.map((b, j) => {
      const has = got.has(b.id), n = owners(b.id), hidden = b.secret && !has;
      const rarity = n === 0 ? 'Nobody yet' : n === 1 && has ? 'Only ' + (p.id === S.me ? 'you' : esc(p.name)) : plural(n, 'player');
      return `<div class="badge${has ? ' got' : ''}${b.secret ? ' secret' : ''}" style="--j:${Math.min(j, 14)}">
        <span class="b-emo" aria-hidden="true">${hidden ? '❔' : b.e}</span>
        <b>${hidden ? '???' : esc(b.name)}</b>
        <span class="b-desc">${hidden ? 'Secret. Keep playing.' : esc(b.desc)}</span>
        <span class="b-rare">${rarity}</span>
      </div>`;
    }).join('')}</div>
  </div>`;
}

function groupStats(p) {
  const ms = S.matches.filter((m) => m.season === S.season && m.group && (m.w === p.id || m.l === p.id));
  const g = (grp) => {
    const played = ms.filter((m) => (m.w === p.id ? m.group : other(m.group)) === grp);
    const w = played.filter((m) => m.w === p.id).length;
    return { n: played.length, w, l: played.length - w, rate: played.length ? Math.round((w / played.length) * 100) : 0 };
  };
  const all = S.matches.filter((m) => m.season === S.season && m.group);
  const stripeShare = all.length ? Math.round((all.filter((m) => m.group === 'stripes').length / all.length) * 100) : 0;
  return { solids: g('solids'), stripes: g('stripes'), stripeShare, total: all.length };
}

function groupCard(p) {
  const gs = groupStats(p);
  if (!gs.solids.n && !gs.stripes.n) return '';
  const col = (key, ball, label) => `<div class="gs-col">${ballHTML(ball, 44)}<span class="label">${label}</span>
    <span class="gs-rate"><span data-ck="st:${p.id}:${key}" data-ck-from="0">${gs[key].rate}</span>%</span><span class="muted">${gs[key].w}W ${gs[key].l}L</span></div>`;
  const best = gs.solids.rate === gs.stripes.rate ? 'No preference. Plays both the same.' : `Better on ${gs.solids.rate > gs.stripes.rate ? 'solids' : 'stripes'}.`;
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><h3>Solids vs stripes</h3><span class="muted">Win rate</span></div>
    <div class="gs">${col('solids', 1, 'Solids')}${col('stripes', 9, 'Stripes')}</div>
    <p>${best} Office wide, stripes win ${gs.stripeShare}% of matches.</p>
  </div>`;
}

function rivalsTab(p) {
  const map = {};
  S.matches.filter((m) => m.season === S.season && (m.w === p.id || m.l === p.id)).forEach((m) => {
    const o = m.w === p.id ? m.l : m.w;
    map[o] ??= { w: 0, l: 0 };
    map[o][m.w === p.id ? 'w' : 'l']++;
  });
  const rows = Object.entries(map).filter(([id]) => P(id)).map(([id, r]) => ({ o: P(id), ...r, n: r.w + r.l })).sort((a, b) => b.n - a.n || b.w - a.w);
  if (!rows.length) return `<div class="tab-pane"><div class="empty">${ballHTML(p.ball, 64)}<h3>No rivals yet</h3><p>Nobody has faced ${p.id === S.me ? 'you' : esc(p.name)} this season.</p></div></div>`;
  const victim = rows.filter((r) => r.w >= 2 && r.w > r.l).sort((a, b) => b.w - a.w || a.l - b.l)[0];
  const nemesis = rows.filter((r) => r.l >= 2 && r.l > r.w).sort((a, b) => b.l - a.l || a.w - b.w)[0];
  const openOf = (o) => (o.id === S.me ? 'profile' : 'player:' + o.id);
  const hl = (r, label, text) => (r ? `<button class="tap card hl" data-a="open" data-v="${openOf(r.o)}">${avatar(r.o, 'sm')}<span class="label">${label}</span><b>${esc(r.o.name)}</b><span class="muted">${text}</span></button>` : '');
  return `<div class="tab-pane">
    ${victim || nemesis ? `<div class="hl-row">${hl(victim, 'Favourite victim', `${plural(victim?.w ?? 0, 'win')} against`)}${hl(nemesis, 'Nemesis', `${plural(nemesis?.l ?? 0, 'loss')} to`)}</div>` : ''}
    <div class="lb rivals">${rows.map((r, j) => `
      <button class="tap lb-row rival" style="--j:${Math.min(j, 12)}" data-a="open" data-v="${openOf(r.o)}">
        ${avatar(r.o, 'sm')}
        <span class="who"><span class="name">${esc(r.o.name)}${you(r.o)}</span><span class="wl-bar sm"><span style="flex-grow:${r.w || 0.001}"></span><span style="flex-grow:${r.l || 0.001}"></span></span></span>
        <span class="rec"><b>${r.w}W ${r.l}L</b><span class="muted">${Math.round((r.w / r.n) * 100)}%</span></span>
      </button>`).join('')}
    </div>
  </div>`;
}

// ---------- Sheetek ----------

function opponentGrid(sel, action) {
  const opts = S.players.filter((p) => p.id !== S.me && !isDormant(p)).sort((a, b) => b.elo - a.elo);
  if (!opts.length) return `<div class="empty">${ballHTML(9, 64)}<h3>Nobody to play</h3><p>Everyone else is dormant. Enrol someone new.</p><button class="btn btn-primary btn-sm" data-a="sheet" data-v="enrol">Enrol a player</button></div>`;
  return `<div class="pick-grid">${opts.map((p) => {
    const busy = busyWith(p.id);
    return `<button class="pick${sel === p.id ? ' on' : ''}" data-a="${action}" data-v="target:${p.id}" ${pressed(sel === p.id)} ${busy ? 'disabled' : ''}>${avatar(p)}<span class="pn">${esc(p.name)}</span><span class="muted">${busy ? 'Busy' : p.elo}</span></button>`;
  }).join('')}</div>`;
}

function sheetHTML() {
  const sh = S.sheet;
  if (!sh) return '';
  let title = '', body = '';
  const me = P(S.me);

  if (sh.type === 'callout') {
    title = 'Call out';
    const mineBusy = busyWith(S.me);
    if (mineBusy) {
      const o = P(mineBusy.from === S.me ? mineBusy.to : mineBusy.from);
      body = `<p>You already have an open challenge with ${esc(o.name)}. Play it, or answer it, before calling someone else.</p>
        <button class="btn btn-primary btn-block" data-a="toArena">Go to the arena</button>`;
    } else {
      const sel = sh.target && !busyWith(sh.target) ? P(sh.target) : null;
      const s = sel ? stakeFor(me, sel) : null;
      const nowRank = rankOf(me), afterElo = sel ? me.elo + s.win : 0;
      const newRank = sel ? ranked().filter((p) => p.id !== me.id && p.id !== sel.id && p.elo > afterElo).length + 1 : 0;
      body = `${opponentGrid(sh.target, 'draft')}
        ${sel ? `<div class="stakes">
          <div class="stake"><span class="label">If you win</span><span class="v">+${s.win}</span>${s.bonus ? `<span class="muted">incl. 👑 ${s.bonus} bounty</span>` : ''}</div>
          <div class="stake"><span class="label">If you lose</span><span class="v">−${s.lose}</span>${s.risk ? `<span class="muted">incl. your 👑 ${s.risk} bounty</span>` : ''}</div>
        </div>
        <p>${nowRank && newRank < nowRank ? `A win lifts you to #${newRank}. ` : ''}${esc(sel.name)} gets 24 hours to answer. The office can start calling it now.</p>` : '<p>Pick who you want to play. The stakes show before you send.</p>'}
        <button class="btn btn-primary btn-block" data-a="sendCallout" ${sel ? '' : 'disabled'}>${icon('send')}Send callout</button>`;
    }
  }

  if (sh.type === 'table') {
    title = "We're on the table";
    const opts = S.players.filter((p) => p.id !== S.me && !isDormant(p)).sort((a, b) => b.elo - a.elo);
    const sel = sh.target && !liveOf(sh.target) ? P(sh.target) : null;
    const s = sel ? stakeFor(me, sel) : null;
    const standing = sel && S.challenges.find((c) => ['pending', 'accepted'].includes(c.status) && [c.from, c.to].includes(S.me) && [c.from, c.to].includes(sel.id));
    const up = sel ? rankIfWin(me, sel) : 0, myRank = rankOf(me);
    body = `<p>Who are you playing?</p>
      <div class="pick-grid">${opts.map((p) => {
        const busy = liveOf(p.id);
        return `<button class="pick${sel?.id === p.id ? ' on' : ''}" data-a="draft" data-v="target:${p.id}" ${pressed(sel?.id === p.id)} ${busy ? 'disabled' : ''}>${avatar(p)}<span class="pn">${esc(p.name)}</span><span class="muted">${busy ? 'Playing' : p.elo}</span></button>`;
      }).join('')}</div>
      ${sel ? `<div class="stakes">
        <div class="stake"><span class="label">If you win</span><span class="v">+${s.win}</span>${s.bonus ? `<span class="muted">incl. 👑 ${s.bonus} bounty</span>` : ''}</div>
        <div class="stake"><span class="label">If you lose</span><span class="v">−${s.lose}</span>${s.risk ? `<span class="muted">incl. your 👑 ${s.risk} bounty</span>` : ''}</div>
      </div>
      <p>${!myRank || up < myRank ? `A win puts you at #${up}. ` : ''}${standing ? 'Your open challenge with them goes live. ' : ''}The office gets pinged and has four minutes to call it. Log the result from the same screen.</p>`
      : '<p>The match goes live right away. No callout, no waiting for an answer.</p>'}
      <button class="btn btn-live btn-block" data-a="startTable" ${sel ? '' : 'disabled'}>${sel ? `Start vs ${esc(sel.name)}` : 'Pick who you are playing'}</button>`;
  }

  if (sh.type === 'inbox') {
    title = 'Activity';
    const pending = S.challenges.filter((c) => c.status === 'pending' && c.to === S.me);
    const mine = S.inbox.filter((n) => n.to === S.me);
    const EMO = { match_result: '🎱', rank_change: '📈', prediction_result: '🔮', crown_taken: '👑', accepted: '🤝', welcome: '👋', season: '🏆' };
    body = `${pending.map((c) => `<div class="card pinned">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap">${avatar(P(c.from), 'sm')}<div class="grow" style="display:grid;gap:2px;min-width:0"><b>${esc(P(c.from).name)} called you out</b><span class="muted">${hoursLeft(c)}h left to answer</span></div>
        <button class="btn btn-primary btn-sm" data-a="sheet" data-v="incoming:${c.id}">Answer</button></div>
      </div>`).join('')}
      ${mine.length ? `<div class="inbox">${mine.map((n) => `<div class="note${n.read ? '' : ' unread'}">
        <span class="note-emo" aria-hidden="true">${n.e ?? EMO[n.type] ?? '🎱'}</span>
        <div class="note-body"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div>
        <span class="muted">${ago(n.ts)}</span>
      </div>`).join('')}</div>` : `<div class="empty">${ballHTML(8, 64)}<h3>All quiet</h3><p>Only things that happen to you land here.</p></div>`}`;
  }

  if (sh.type === 'log') {
    title = 'Log match';
    const a = sh.a ? P(sh.a) : null, b = sh.b ? P(sh.b) : null;
    const step = !a ? 'a' : !b ? 'b' : 'w';
    if (step !== 'w') {
      const act = S.players.filter((p) => !isDormant(p)).sort((x, y) => y.elo - x.elo);
      const dor = S.players.filter(isDormant);
      const grid = (list) => `<div class="pick-grid">${list.map((p) => `<button class="pick${sh.a === p.id ? ' on' : ''}" data-a="draft" data-v="${step}:${p.id}" ${pressed(sh.a === p.id)} ${sh.a === p.id ? 'disabled' : ''}>${avatar(p)}<span class="pn">${esc(p.name)}</span></button>`).join('')}</div>`;
      body = `<p>${step === 'a' ? 'Who played?' : `${esc(a.name)} played against`}</p>${grid(act)}
        ${dor.length ? `<span class="label">Dormant</span>${grid(dor)}` : ''}
        ${a ? '<button class="btn btn-secondary btn-block" data-a="draft" data-v="reset:">Change first player</button>' : ''}`;
    } else {
      body = winnerPicker(a, b, sh.w) + groupPicker(sh.w, 'confirmLog') + '<button class="btn btn-secondary btn-block" data-a="draft" data-v="reset:">Change players</button>';
    }
  }

  if (sh.type === 'result') {
    const ch = S.challenges.find((c) => c.id === sh.ch);
    title = 'Who won?';
    body = winnerPicker(P(ch.from), P(ch.to), sh.w) + groupPicker(sh.w, 'confirmResult');
  }

  if (sh.type === 'incoming') {
    const ch = S.challenges.find((c) => c.id === sh.ch);
    const a = P(ch.from), s = stakeFor(me, a);
    title = `${a.name} called you out`;
    body = `<div class="match-line"><div class="side">${avatar(a)}<span class="pn">${esc(a.name)}</span></div><span class="vs">VS</span><div class="side right">${avatar(me)}<span class="pn">You</span></div></div>
      <div class="stakes">
        <div class="stake"><span class="label">If you win</span><span class="v">+${s.win}</span>${s.bonus ? `<span class="muted">incl. 👑 ${s.bonus} bounty</span>` : ''}</div>
        <div class="stake"><span class="label">If you lose</span><span class="v">−${s.lose}</span></div>
      </div>
      <p>${hoursLeft(ch)} hours left to answer. Declining counts as a duck.</p>
      <div class="row"><button class="btn btn-primary grow" data-a="accept" data-v="${ch.id}">Accept</button><button class="btn btn-secondary" data-a="sheet" data-v="decline:${ch.id}">Decline</button></div>
      <button class="btn btn-secondary btn-block" data-a="closeSheet">Decide later</button>`;
  }

  if (sh.type === 'decline') {
    const ch = S.challenges.find((c) => c.id === sh.ch);
    title = 'Duck it?';
    body = `<div class="duck-sm" aria-hidden="true">🦆</div><p>Declining ${esc(P(ch.from).name)} counts as a duck. The Duck title keeps count and everyone sees it.</p>
      <div class="row"><button class="btn btn-secondary grow" data-a="closeSheet">Back</button><button class="btn btn-primary grow" data-a="decline" data-v="${ch.id}">Decline anyway</button></div>`;
  }

  if (sh.type === 'enrol') {
    title = sh.self ? "You're new" : 'Enrol a player';
    const ball = sh.ball ?? 9;
    body = `<form class="field" data-form="enrol"><label class="label" for="enrolName">Name</label><input id="enrolName" name="name" placeholder="First name" maxlength="16" autocomplete="off" ${sh.err ? 'aria-invalid="true" aria-describedby="enrolErr"' : ''}>
      ${sh.err ? `<span class="field-err" id="enrolErr">${esc(sh.err)}</span>` : ''}
      <label class="label" for="enrolDept">Team</label><input id="enrolDept" name="dept" placeholder="e.g. Marketing" maxlength="20" autocomplete="off"></form>
      <div class="field"><span class="label">Pick a ball</span><div class="ball-grid">${Array.from({ length: 15 }, (_, i) => i + 1).map((n) => `<button class="ball-pick${ball === n ? ' on' : ''}" data-a="enrolBall" data-v="${n}" ${pressed(ball === n)} aria-label="Ball ${n}">${ballHTML(n, 40)}</button>`).join('')}</div></div>
      <p>Everyone starts on 1000. The ladder counts you from your first match.</p>
      <button class="btn btn-primary btn-block" data-a="submitEnrol">${icon('user-plus')}${sh.self ? "Let's play" : 'Enrol'}</button>`;
  }

  if (sh.type === 'season') {
    title = `Close season ${S.season}`;
    const r = ranked().slice(0, 3);
    body = `<p>The ladder gets archived to the hall of fame. Wins, losses and streaks reset. Everyone keeps half of their lead over 1000 into season ${S.season + 1}.</p>
      <div class="lb">${r.map((p, i) => `<div class="lb-row${i === 0 ? ' first' : ''}"><span class="pos">${i + 1}</span>${avatar(p, 'xs')}<span class="name">${esc(p.name)}</span><span class="elo row" style="gap:10px">${p.elo}<span class="next-elo">${Math.round(1000 + (p.elo - 1000) / 2)}</span></span></div>`).join('')}</div>
      <button class="btn btn-primary btn-block" data-a="closeSeason">Close the season</button>`;
  }

  return `<div class="backdrop" data-a="closeSheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"><div class="grab"></div>
      <div class="sheet-head"><h2 id="sheetTitle">${esc(title)}</h2><button class="btn btn-secondary btn-icon" data-a="closeSheet" aria-label="Close">${icon('x')}</button></div>
      ${body}
    </div>`;
}

// A győztes után egy kérdés: teli vagy csíkos volt. A választás egyben rögzít is.
function groupPicker(w, action) {
  if (!w) return '<p class="gp-hint">Tap the winner</p>';
  return `<div class="group-pick">
    <p class="gp-q">${w === S.me ? 'What was your ball?' : `What was ${esc(P(w).name)}'s ball?`}</p>
    <div class="gp-row">
      <button class="gp" data-a="${action}" data-v="solids">${ballHTML(1, 64)}<span>Solids</span></button>
      <button class="gp" data-a="${action}" data-v="stripes">${ballHTML(9, 64)}<span>Stripes</span></button>
    </div>
  </div>`;
}

function winnerPicker(a, b, w) {
  return `<div class="winner-pick">${[a, b].map((p, i) => {
    const o = i ? a : b;
    return `<button class="pick${w === p.id ? ' on' : ''}" data-a="draft" data-v="w:${p.id}" ${pressed(w === p.id)}>${avatar(p, 'lg')}<span class="pn">${esc(p.name)}</span><span class="gain">+${stakeFor(p, o).win}</span></button>`;
  }).join('')}</div>`;
}

// ---------- Overlay-ek ----------

const burst = () => `<div class="burst" aria-hidden="true">${Array.from({ length: 15 }, (_, i) => {
  const a = (i / 15) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
  const d = 170 + Math.random() * 120;
  return ballHTML(i + 1, 44, `--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d * 1.4)}px;--r:${Math.round(Math.random() * 540 - 270)}deg;--d:${Math.round(Math.random() * 40)}ms`);
}).join('')}</div>`;

function overlayHTML() {
  const o = S.overlay;
  if (!o) return '';
  let inner = '', extra = '', scene = '';
  if (o.type === 'sent') {
    const t = P(o.to);
    // jelenet: a golyó ívben berepül, földet ér, porcsík és lökéshullám, utána a szöveg
    scene = 'scene-sent';
    inner = `<div class="throw-stage" aria-hidden="true"><div class="dust"></div><div class="impact"></div><div class="throw">${ballHTML(t.ball, 104)}</div></div>
      <div class="headline s-1" id="ovTitle">Callout sent</div>
      <div class="target s-2">${avatar(t, 'sm')}<b>${esc(t.name)}</b></div>
      <p class="s-2">${esc(t.name)} has 24 hours to answer. Everyone can see it in the arena.</p>
      <button class="btn btn-primary s-3" data-a="closeOverlay">Back to the arena</button>`;
  }
  if (o.type === 'duel') {
    const a = P(o.a), b = P(o.b);
    // jelenet: a két játékos egymásnak megy, villanás, pecsét a találkozásnál
    scene = 'scene-duel';
    inner = `<div class="clash"><div class="flash" aria-hidden="true"></div>
        <div class="side l">${avatar(a, 'lg')}<span class="cn">${esc(a.name)}</span></div>
        <div class="mid"><span class="vs">VS</span><span class="stamp${o.instant ? ' live' : ''}">${o.instant ? 'Live' : 'Accepted'}</span></div>
        <div class="side r">${avatar(b, 'lg')}<span class="cn">${esc(b.name)}</span></div>
      </div>
      <div class="headline s-1" id="ovTitle">${o.instant ? 'On the table' : "It's on"}</div><p class="s-2">${esc(o.msg)}</p>
      ${o.instant ? '<span class="chip chip-live s-3">Calls open</span>' : `<div class="row s-3" style="justify-content:center"><button class="btn btn-primary" data-a="start" data-v="${o.ch}">${icon('play')}Start now</button><button class="btn btn-secondary" data-a="closeOverlay">Later</button></div>`}`;
  }
  if (o.type === 'duck') {
    inner = `<div class="duck" aria-hidden="true">🦆</div><div class="headline" id="ovTitle">Ducked</div><p>The Duck title keeps count. Everyone saw that.</p><button class="btn btn-primary" data-a="closeOverlay">Fair enough</button>`;
  }
  if (o.type === 'quick') {
    inner = `<div class="quick-ball" aria-hidden="true">${ballHTML(8, 96)}</div><div class="headline" id="ovTitle" style="font-size:44px">Quick match</div>
      <div class="quick-name" id="quickName">…</div><p id="quickSub">Finding your opponent</p>`;
  }
  if (o.type === 'win' || o.type === 'crown') {
    const w = P(o.w), l = P(o.l);
    const meIn = o.w === S.me || o.l === S.me;
    extra = burst();
    const btns = `<div class="row" style="justify-content:center">${meIn ? `<button class="btn btn-secondary" data-a="rematch" data-v="${o.w === S.me ? o.l : o.w}">${icon('repeat')}Rematch</button>` : ''}<button class="btn btn-primary" data-a="closeOverlay">${o.type === 'crown' ? 'Long live the king' : 'Nice'}</button></div>`;
    inner = o.type === 'crown'
      ? `<div class="crown-emoji" aria-hidden="true">👑</div><div class="headline" id="ovTitle">Crown taken</div>
        <p>${esc(w.name)} took ${o.bounty ? `${o.bounty} bounty off ` : 'the top spot from '}${esc(l.name)}. The whole office just got notified.</p>${recapHTML(o)}${btns}`
      : `${avatar(w, 'lg')}<div class="mega">+<span data-ck="mega" data-ck-from="0">${o.total}</span></div><div class="headline" id="ovTitle" style="font-size:40px">${esc(w.name)} wins</div>
        ${o.upset ? '<p>That was an upset.</p>' : ''}${recapHTML(o)}${btns}`;
  }
  if (o.type === 'champion') {
    const w = P(o.w);
    extra = burst();
    inner = `<div class="crown-emoji" aria-hidden="true">🏆</div><div class="headline" id="ovTitle" style="font-size:44px">Season ${o.season} champion</div>
      ${avatar(w, 'lg')}<div class="quick-name">${esc(w.name)}</div>
      <p>${o.auto ? 'The clock ran out. ' : ''}Standings and titles are in the hall of fame. Ratings got a soft reset and season ${o.season + 1} is open.</p>
      <button class="btn btn-primary" data-a="closeOverlay">On to season ${o.season + 1}</button>`;
  }
  return `<div class="ov${scene ? ' ' + scene : ''}" role="dialog" aria-modal="true" aria-labelledby="ovTitle">${extra}<div class="ov-inner${scene ? ' scene' : ''}">${inner}</div></div>`;
}

// ---------- Render ----------

function currentView() {
  if (!S.me) return { key: 'identity', html: viewIdentity() };
  const topOfStack = S.stack[S.stack.length - 1];
  if (topOfStack) {
    const { type, id } = topOfStack;
    if (type === 'live') {
      const ch = S.challenges.find((c) => c.id === id);
      if (ch && ch.status === 'live') return { key: 'live' + id, html: viewLive(ch), full: true };
    }
    if (type === 'match') { const m = S.matches.find((x) => x.id === id); if (m) return { key: 'match' + id, html: viewMatch(m), full: true }; }
    if (type === 'player' && P(id)) return { key: 'player' + id, html: viewPlayer(P(id), false), full: true };
    if (type === 'profile') return { key: 'profile', html: viewPlayer(P(S.me), true), full: true };
    S.stack.pop();
    return currentView();
  }
  const v = { ranks: viewRanks, arena: viewArena, history: viewHistory }[S.tab]();
  return { key: 'tab' + S.tab, html: v };
}

function tabbar() {
  const alert = S.challenges.some((c) => c.status === 'pending' && c.to === S.me) || S.challenges.some((c) => c.status === 'live');
  const t = (id, ic, label) => {
    const dotOn = id === 'arena' && alert && S.tab !== 'arena';
    return `<button class="tab${S.tab === id ? ' on' : ''}" data-a="tab" data-v="${id}" aria-label="${label}${dotOn ? ', something new' : ''}" ${S.tab === id ? 'aria-current="page"' : ''}>${icon(ic)}${S.tab === id ? `<span class="tab-label">${label}</span>` : ''}${dotOn ? '<span class="badge-dot"></span>' : ''}</button>`;
  };
  return `<nav class="tabbar">${t('ranks', 'trophy', 'Ranks')}${t('arena', 'swords', 'Arena')}${t('history', 'history', 'History')}</nav>`;
}

const TABS = ['ranks', 'arena', 'history'];
const prev = { key: null, stack: 0, tab: null, sheet: null, step: null, overlay: null, toast: 0 };
const order = new Map();  // lista neve -> utoljára látott id-sorrend (FLIP)
const shown = new Map();  // számláló/sáv kulcs -> utoljára látott érték
const fresh = new Set();  // egyszer belépő elemek id-i
const ACK = new Set(['call', 'react', 'draft', 'lock', 'setBall', 'enrolBall']);
let lastHit = null, toastSeq = 0;

function countUp(el, from, to, ms = T.slow, delay = 0) {
  if (RM.matches || from === to) return;
  el.textContent = from;
  const t0 = performance.now() + delay;
  const step = (t) => {
    const k = Math.min(1, Math.max(0, (t - t0) / ms));
    el.textContent = Math.round(from + (to - from) * easeIO(k));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function baseline() {
  order.set('ladder', ranked().map((p) => p.id));
  for (const p of S.players) shown.set('elo:' + p.id, p.elo);
}

function animateRender(root, v, tabW) {
  const viewChanged = prev.key !== null && v.key !== prev.key;
  const lag = viewChanged ? 160 : 0;

  if (viewChanged) {
    const sc = $('.scroll', root);
    const d = S.stack.length - prev.stack;
    const dx = d > 0 ? 24 : d < 0 ? -24 : S.tab !== prev.tab ? 16 * Math.sign(TABS.indexOf(S.tab) - TABS.indexOf(prev.tab)) : 0;
    sc?.style.setProperty('--dx', dx + 'px');
    if (!dx) sc?.style.setProperty('--dy', '8px');
    sc?.classList.add('is-in');
  }
  // lépcsőzetes beúszás: új nézetnél és az első betöltésnél a blokkok és a sorok egymás után jönnek
  if ((viewChanged || prev.key === null) && !RM.matches) {
    const sc = $('.scroll', root);
    if (sc) {
      [...sc.children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 10)));
      sc.querySelectorAll('.lb').forEach((lb) => [...lb.children].forEach((r, j) => r.style.setProperty('--j', Math.min(j, 12))));
      sc.classList.add('stagger');
    }
  }
  const tabs = $('.tabbar', root);
  if (tabs && !prev.tabs) tabs.classList.add('intro');
  // profil fülváltás: a jelző átcsúszik, a tartalom beúszik, a görbe kirajzolódik
  const pane = $('.tab-pane', root);
  if (pane && !viewChanged && prev.ptab && prev.ptab !== S.profileTab) {
    pane.classList.add('pane-in');
    const from = PTABS.indexOf(prev.ptab), to = PTABS.indexOf(S.profileTab);
    anim($('.seg-ind', root), [{ transform: `translateX(calc(${from} * (100% + 4px)))` }, { transform: `translateX(calc(${to} * (100% + 4px)))` }], T.base);
  }
  if (S.tab !== prev.tab && tabW.size) {
    $('.tabbar', root)?.classList.add('is-switch');
    for (const t of root.querySelectorAll('.tab')) {
      const w0 = tabW.get(t.dataset.v);
      if (w0 && w0 !== t.offsetWidth) anim(t, [{ width: w0 + 'px' }, { width: t.offsetWidth + 'px' }]);
    }
  }
  const step = S.sheet && [S.sheet.type, !!S.sheet.a, !!S.sheet.b, !!S.sheet.w].join();
  let focusTarget = null;
  if (S.sheet && S.sheet !== prev.sheet) {
    $('.backdrop', root)?.classList.add('is-in');
    $('.sheet', root)?.classList.add('is-in');
    if (S.sheet.type !== prev.sheet?.type) focusTarget = $('.sheet', root);
  } else if (S.sheet && step !== prev.step) $('.sheet', root)?.classList.add('step-in');
  if (S.overlay && S.overlay !== prev.overlay) {
    $('.ov', root)?.classList.add('is-in');
    shown.delete('mega');
    focusTarget = $('.ov', root);
  }
  if (focusTarget) {
    const f = focusTarget.querySelector('input') || focusTarget.querySelector('.ov-inner .btn-primary, .sheet-head .btn');
    f?.focus({ preventScroll: true });
  }
  if (S.toast && toastSeq !== prev.toast) $('.toast', root)?.classList.add('is-in');
  const bp = $('.badge-pop', root);
  if (bp && bp.dataset.id !== prev.badge) {
    bp.classList.add('is-in');
    const id = bp.dataset.id;
    setTimeout(async () => {
      if (S.badgeQueue[0] !== id) return;
      await anim($('.badge-pop'), [{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, 24px)' }], T.base, { fill: 'forwards' });
      if (S.badgeQueue[0] === id) { S.badgeQueue.shift(); render(); }
    }, 3800);
  }
  if (lastHit) {
    const [a, val] = lastHit.split('|');
    [...root.querySelectorAll(`[data-a="${a}"]`)].find((x) => (x.dataset.v ?? '') === val)?.classList.add('ack');
    lastHit = null;
  }

  if (!S.overlay) {
    for (const list of root.querySelectorAll('[data-list]')) {
      const rows = [...list.children], ids = rows.map((r) => r.dataset.id);
      const old = order.get(list.dataset.list);
      order.set(list.dataset.list, ids);
      if (!old || RM.matches || rows.length < 2) continue;
      const pitch = rows[1].offsetTop - rows[0].offsetTop;
      rows.forEach((r, i) => {
        const was = old.indexOf(r.dataset.id);
        if (was === -1) return r.classList.add('is-new');
        if (was === i) return;
        r.style.zIndex = was > i ? 2 : 1;
        anim(r, [{ transform: `translateY(${(was - i) * pitch}px)` }, { transform: 'none' }], T.slow, { delay: lag })
          .then(() => (r.style.zIndex = ''));
      });
    }
    for (const el of root.querySelectorAll('[data-gk]')) {
      const k = el.dataset.gk, to = parseFloat(el.style.flexGrow), from = shown.get(k);
      if (from != null && from !== to) anim(el, [{ flexGrow: from }, { flexGrow: to }]);
      shown.set(k, to);
    }
  }
  const next = [];
  for (const el of root.querySelectorAll('[data-ck]')) {
    if (S.overlay && !el.closest('.ov')) continue;
    const k = el.dataset.ck, to = Number(el.textContent);
    const from = shown.has(k) ? shown.get(k) : el.dataset.ckFrom != null ? Number(el.dataset.ckFrom) : to;
    countUp(el, from, to, el.closest('.ov') ? 420 : T.slow, el.closest('.ov') ? 150 : lag);
    next.push([k, to]);
  }
  next.forEach(([k, n]) => shown.set(k, n));

  if (!S.overlay && !S.sheet) fresh.clear();
  Object.assign(prev, { key: v.key, stack: S.stack.length, tab: S.tab, sheet: S.sheet, step, overlay: S.overlay, toast: toastSeq, tabs: !!tabs, ptab: S.profileTab, badge: bp?.dataset.id });
}

const exitSheet = () => Promise.all([
  anim($('.sheet'), [{ transform: 'none' }, { transform: 'translateY(100%)' }], 220, { fill: 'forwards' }),
  anim($('.backdrop'), [{ opacity: 1 }, { opacity: 0 }], 200, { fill: 'forwards' }),
]);
const exitOverlay = () => anim($('.ov'), [{ opacity: 1 }, { opacity: 0 }], 200, { fill: 'forwards' });
const EXITS = {
  closeSheet: () => ($('.sheet') ? exitSheet() : null),
  closeOverlay: exitOverlay,
  start: () => ($('.ov') ? exitOverlay() : $('.sheet') ? exitSheet() : null),
  rematch: () => ($('.ov') ? exitOverlay() : null),
  cancelCh: (v, el) => anim(el.closest('.card'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], T.fast, { fill: 'forwards' }),
  delComment: (v, el) => anim(el.closest('.comment'), [{ opacity: 1 }, { opacity: 0 }], T.fast, { fill: 'forwards' }),
};

let lastKey = null;
function render() {
  const root = $('#device');
  const oldScroll = $('.scroll', root);
  const v = currentView();
  const keep = v.key === lastKey && oldScroll ? oldScroll.scrollTop : 0;
  const chatEl = $('#chat', root);
  const chatAtBottom = !chatEl || chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 30;
  const act = document.activeElement;
  const focusSel = act?.id ? '#' + act.id : act?.dataset?.a ? `[data-a="${act.dataset.a}"]${act.dataset.v != null ? `[data-v="${CSS.escape(act.dataset.v)}"]` : ''}` : null;
  const tabW = new Map([...root.querySelectorAll('.tab')].map((t) => [t.dataset.v, t.offsetWidth]));
  for (const i of root.querySelectorAll('input[id]')) S.inputs[i.id] = i.value;

  const t = S.toast;
  root.innerHTML = v.html + (S.me && !v.full ? tabbar() : '') + sheetHTML() + overlayHTML()
    + (t ? `<div class="toast" role="status" aria-live="polite"><span>${esc(t.msg)}</span>${t.undo ? '<button class="toast-btn" data-a="undo">Undo</button>' : ''}</div>` : '')
    + badgePopHTML();

  for (const i of root.querySelectorAll('input[id]')) if (S.inputs[i.id]) i.value = S.inputs[i.id];
  const sc = $('.scroll', root);
  if (sc) sc.scrollTop = keep;
  const chat = $('#chat', root);
  if (chat && chatAtBottom) chat.scrollTop = chat.scrollHeight;
  if (focusSel) { try { $(focusSel, root)?.focus({ preventScroll: true }); } catch { /* érvénytelen szelektor */ } }
  lastKey = v.key;
  if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 2.25 } });
  animateRender(root, v, tabW);
}

function badgePopHTML() {
  const id = !S.overlay && S.me && S.badgeQueue?.[0];
  if (!id) return '';
  if (id.startsWith('t:')) {
    const [, aid, k] = id.split(':'), a = ACHM[aid], t = TIERS[k - 1];
    return `<button class="badge-pop tier-pop" data-id="${id}" data-a="dismissBadge" role="status" aria-live="polite">
      <span class="tmedal lg" style="--tc:${t.c};--tf:${t.f}" aria-hidden="true">${a.e}</span>
      <span class="bp-text"><span class="label">${t.label} tier unlocked</span><b>${esc(a.names[k - 1])}</b><span>${esc(a.name)}. ${a.at[k - 1]} ${a.unit}.</span></span>
    </button>`;
  }
  const b = BADGE[id];
  return `<button class="badge-pop" data-id="${id}" data-a="dismissBadge" role="status" aria-live="polite">
    <span class="bp-emo" aria-hidden="true">${b.e}</span>
    <span class="bp-text"><span class="label">${b.secret ? 'Secret badge unlocked' : 'Badge unlocked'}</span><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></span>
  </button>`;
}

let toastTimer;
function toast(msg, opts = {}) {
  S.toast = { msg, ...opts }; toastSeq++;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(async () => {
    const seq = toastSeq;
    await anim($('.toast'), [{ opacity: 1, transform: 'translate(-50%,0)' }, { opacity: 0, transform: 'translate(-50%,-8px)' }], T.fast, { fill: 'forwards' });
    if (seq === toastSeq) { S.toast = null; if (opts.undo) S.undo = null; render(); }
  }, opts.undo ? 6000 : 2200);
}

// ---------- Logika ----------

const snapshot = () => structuredClone({
  players: S.players, matches: S.matches, challenges: S.challenges, nerve: S.nerve, tally: S.tally,
  crownSince: S.crownSince, lockDay: S.lockDay, inbox: S.inbox,
});

function applyResult(wId, lId, chId, opts = {}) {
  const silent = !!opts.silent;
  if (!silent) S.undo = snapshot();
  const w = P(wId), l = P(lId);
  const oldTop = crownHolder();
  const rankBefore = rankOf(w);
  const orderBefore = ranked().map((p) => p.id);
  const titlesBefore = new Set(titles().filter((t) => t.holderId === wId).map((t) => t.name));
  const lStreakBefore = l.streak;
  const exp = expected(w.elo, l.elo);
  const d = Math.max(1, Math.round(K * (1 - exp)));
  const b = oldTop?.id === l.id ? bounty() : 0;
  const defended = oldTop?.id === w.id;
  w.elo += d + b;
  const lBefore = l.elo;
  l.elo = Math.max(ELO_FLOOR, l.elo - d - b);
  w.peak = Math.max(w.peak, w.elo);
  w.wins++; l.losses++;
  w.streak = w.streak > 0 ? w.streak + 1 : 1;
  w.bestStreak = Math.max(w.bestStreak, w.streak);
  l.streak = l.streak < 0 ? l.streak - 1 : -1;
  w.form.push('W'); l.form.push('L');
  w.lastPlayedAt = l.lastPlayedAt = now();
  const upset = exp < 0.4;
  const m = { id: uid(), ts: now(), w: wId, l: lId, delta: d, bounty: b, season: S.season, wElo: w.elo, lElo: l.elo, upset, defended, group: opts.group ?? null, reactions: {}, comments: [] };
  S.matches.unshift(m);
  fresh.add(m.id);

  const t = S.tally, inc = (k, id, n = 1) => (t[k][id] = (t[k][id] || 0) + n);
  inc('week', wId); inc('week', lId);
  if (upset) { inc('upsets', wId); inc('cursed', lId); }
  if (b) inc('kings', wId, b);
  if (defended) inc('wall', wId);

  // ha szabadon rögzítették, a pár nyitott kihívása is lezárul
  if (!chId) chId = S.challenges.find((c) => ['accepted', 'live'].includes(c.status) && [c.from, c.to].includes(wId) && [c.from, c.to].includes(lId))?.id;
  let myNerve = null;
  const calls = { right: [], wrong: [] };
  const callers = [];
  if (chId) {
    const ch = S.challenges.find((c) => c.id === chId);
    ch.status = 'played';
    for (const [pid, pr] of Object.entries(ch.preds)) {
      const pickedElo = pr.pick === ch.from ? ch.fromElo : ch.toElo;
      const otherElo = pr.pick === ch.from ? ch.toElo : ch.fromElo;
      const right = pr.pick === wId;
      const raw = K * ((right ? 1 : 0) - expected(pickedElo, otherElo));
      const delta = Math.round(raw * (pr.lock ? 2 : 1));
      const rec = S.nerve[pid] ?? (S.nerve[pid] = { nerve: 1000, calls: 0, hits: 0, locks: 0, lockHits: 0, against: 0 });
      rec.nerve = Math.max(NERVE_FLOOR, rec.nerve + delta); rec.calls++;
      // szemben a tömeggel: a kisebbik oldalra tippelt
      const same = Object.values(ch.preds).filter((x) => x.pick === pr.pick).length;
      rec.hits = (rec.hits ?? 0) + (right ? 1 : 0);
      if (pr.lock) { rec.locks = (rec.locks ?? 0) + 1; rec.lockHits = (rec.lockHits ?? 0) + (right ? 1 : 0); }
      if (same < Object.keys(ch.preds).length - same) rec.against = (rec.against ?? 0) + 1;
      if (pid === S.me) myNerve = delta;
      if (P(pid)) { (right ? calls.right : calls.wrong).push(P(pid).name); callers.push({ pid, right, lock: pr.lock, delta }); }
    }
  }

  const newTop = crownHolder();
  const crownMoved = newTop?.id !== oldTop?.id && newTop?.id === wId;
  m.took = crownMoved;
  // a regnálás újraindul koronaváltáskor és bounty kifizetésekor is
  if (newTop?.id !== oldTop?.id || b > 0) S.crownSince = now();

  // Recap: mit változtatott az eredmény (helyek, akiket megelőzött, sorozat, H2H, tippek, címek)
  const orderAfter = ranked().map((p) => p.id);
  const move = (id) => {
    const was = orderBefore.indexOf(id), is = orderAfter.indexOf(id);
    const passed = orderAfter.slice(is + 1).filter((o) => orderBefore.indexOf(o) >= 0 && (was < 0 || orderBefore.indexOf(o) < was));
    const passedBy = orderAfter.slice(0, is).filter((o) => was >= 0 && orderBefore.indexOf(o) > was);
    return { before: was < 0 ? null : was + 1, after: is + 1, passed, passedBy };
  };
  const wMove = move(wId), lMove = move(lId);
  const h2h = S.matches.filter((x) => [x.w, x.l].includes(wId) && [x.w, x.l].includes(lId));
  const recap = {
    wMove, lMove, gain: d + b, lose: lBefore - l.elo,
    wStreak: w.streak, lStreakBefore,
    h2h: { w: h2h.filter((x) => x.w === wId).length, l: h2h.filter((x) => x.w === lId).length },
    calls: chId && (calls.right.length || calls.wrong.length) ? calls : null,
    titlesWon: titles().filter((t) => t.holderId === wId && !titlesBefore.has(t.name)),
    group: m.group,
    badges: syncBadges([wId, lId, ...callers.map((c) => c.pid)]),
  };

  // Kiérdemelt értesítések: személyenként egy, a legszemélyesebb ok nyer; aki logolt, nem kap
  const loggedBy = silent ? null : S.me;
  const told = new Set();
  const tell = (to, type, title, body) => { if (!to || to === loggedBy || told.has(to)) return; told.add(to); notify(to, type, title, body); };
  const place = (m) => (m.before === null || m.before === m.after ? `still #${m.after}` : `now #${m.after}`);
  const names = (ids) => joinNames(ids.map((id) => P(id).name));
  tell(lId, 'match_result', `${w.name} beat you`, `−${recap.lose}, ${place(lMove)}.${lMove.passedBy.length ? ` ${names(lMove.passedBy)} went by.` : ''}${crownMoved ? ' The crown is gone.' : ''}`);
  tell(wId, 'match_result', `Logged: you beat ${l.name}`, `+${recap.gain}, ${place(wMove)}.${wMove.passed.length ? ` Past ${names(wMove.passed)}.` : ''}${crownMoved ? ' You wear the crown.' : ''}`);
  wMove.passed.forEach((id) => tell(id, 'rank_change', `${w.name} went past you`, `Beat ${l.name} and climbed to #${wMove.after}. You're #${orderAfter.indexOf(id) + 1} now.`));
  callers.forEach((c) => tell(c.pid, 'prediction_result', c.right ? 'You called it' : 'Wrong call', `${w.name} beat ${l.name}.${c.lock ? (c.right ? ' Your lock paid double.' : ' That was your lock.') : ''}`));
  if (crownMoved) S.players.forEach((p) => tell(p.id, 'crown_taken', `New #1: ${w.name}`, `Took the crown off ${l.name}${b ? ` with a ${b} point bounty` : ''}.`));

  if (silent) {
    // ha épp ezt a meccset nézi, visszalép az arénába
    if (S.stack.some((x) => x.type === 'live' && x.id === chId)) { S.stack = []; S.tab = 'arena'; }
    return;
  }
  if (crownMoved) {
    S.overlay = { type: 'crown', w: wId, l: lId, bounty: b, nerve: myNerve, recap };
    fresh.add('crown');
  } else {
    S.overlay = { type: 'win', w: wId, l: lId, total: d + b, lose: recap.lose, upset, rankBefore, rankAfter: rankOf(w), nerve: myNerve, recap };
  }
  S.sheet = null;
  S.stack = S.stack.filter((x) => x.type !== 'live');
  S.tab = 'history';
  setTimeout(() => { if (S.undo) toast('Result logged', { undo: true }); }, 700);
}

function recapHTML(o) {
  const r = o.recap;
  if (!r) return '';
  const w = P(o.w), l = P(o.l);
  const names = (ids) => joinNames(ids.map((id) => esc(P(id).name)));
  const rows = [];
  const wm = r.wMove;
  rows.push(['Ladder', wm.before === null ? `${esc(w.name)} joins the ladder at #${wm.after}.`
    : wm.after < wm.before ? `${esc(w.name)} up to #${wm.after}${wm.passed.length ? `, past ${names(wm.passed)}` : ''}.`
    : `${esc(w.name)} stays #${wm.after}.`]);
  rows.push(['Drop', `${esc(l.name)} drops ${r.lose}${r.lMove.after !== r.lMove.before ? `, now #${r.lMove.after}` : ''}.`]);
  if (r.lStreakBefore >= 2) rows.push(['Streak', `Ended ${esc(l.name)}'s run of ${r.lStreakBefore} wins.`]);
  else if (r.wStreak >= 2) rows.push(['Streak', `${esc(w.name)} has won ${r.wStreak} in a row.`]);
  rows.push(['Head to head', `${esc(w.name)} ${r.h2h.w}, ${esc(l.name)} ${r.h2h.l}.`]);
  if (r.calls) rows.push(['Calls', `${r.calls.right.length ? `Right: ${joinNames(r.calls.right.map(esc))}.` : 'Nobody saw it coming.'}${r.calls.wrong.length ? ` Wrong: ${joinNames(r.calls.wrong.map(esc))}.` : ''}`]);
  if (o.nerve != null) rows.push(['Your call', `${o.nerve >= 0 ? '+' : '−'}${Math.abs(o.nerve)} nerve.`]);
  r.titlesWon.forEach((t) => rows.push(['New title', `${t.e} ${t.name}`]));
  if (r.group) rows.push(['Balls', `${esc(w.name)} won on ${r.group}. ${ballHTML(r.group === 'solids' ? 1 : 9, 18)}`]);
  [[w, r.badges?.[o.w]], [l, r.badges?.[o.l]]].forEach(([pl, ids]) => (ids ?? []).forEach((id) => {
    if (id.startsWith('t:')) { const [, aid, k] = id.split(':'); rows.push([`${TIERS[k - 1].label} tier`, `${ACHM[aid].e} ${esc(ACHM[aid].names[k - 1])} <span class="muted">${esc(pl.name)}</span>`]); }
    else rows.push(['New badge', `${BADGE[id].e} ${BADGE[id].name} <span class="muted">${esc(pl.name)}</span>`]);
  }));
  return `<div class="recap">${rows.map(([k, v]) => `<div class="recap-row"><span class="label">${k}</span><span>${v}</span></div>`).join('')}</div>`;
}

function openCallout(target) {
  S.sheet = { type: 'callout', target: target || null };
}

const actions = {
  setMe(id) {
    S.me = id;
    if (!S.seeded) { seedChallenges(); S.seeded = true; }
    seedInbox(id);
    S.tab = 'ranks'; S.stack = [];
    baseline();
    const inc = S.challenges.find((c) => c.status === 'pending' && c.to === id);
    if (inc) S.sheet = { type: 'incoming', ch: inc.id };
    toast(`Hi ${P(id).name}`);
    return 'noRender';
  },
  switchMe() { S.me = null; S.stack = []; S.sheet = null; S.overlay = null; S.lockArm = null; },
  tab(id) { S.tab = id; S.stack = []; },
  toArena() { S.sheet = null; S.tab = 'arena'; S.stack = []; },
  open(v) {
    const [type, id] = v.split(':');
    if (type === 'player' || type === 'profile') S.profileTab = 'overview';
    S.stack.push({ type, id });
  },
  ptab(t) {
    if (S.profileTab === t) return 'noRender';
    S.profileTab = t;
    // a számlálók minden fülváltáskor nulláról indulnak
    for (const k of [...shown.keys()]) if (k.startsWith('st:')) shown.delete(k);
  },
  more() { S.historyLimit += 20; },
  dismissBadge() { S.badgeQueue.shift(); },
  back() { S.stack.pop(); },
  sheet(v) {
    const [type, arg] = v.split(':');
    if (S.sheet?.type === 'inbox') S.inbox.forEach((n) => { if (n.to === S.me) n.read = true; });
    if (type === 'enrol') { S.sheet = { type: 'enrol', self: arg === 'self', ball: 9 }; delete S.inputs.enrolName; delete S.inputs.enrolDept; }
    else if (['result', 'decline', 'incoming'].includes(type)) S.sheet = { type, ch: arg };
    else if (type === 'log') S.sheet = { type: 'log', a: S.me };
    else if (type === 'table') {
      if (liveOf(S.me)) { S.stack = [{ type: 'live', id: liveOf(S.me).id }]; return; }
      S.sheet = { type: 'table', target: arg || null };
    }
    else S.sheet = { type };
  },
  closeSheet() {
    // az inbox bezárásakor minden elolvasott
    if (S.sheet?.type === 'inbox') S.inbox.forEach((n) => { if (n.to === S.me) n.read = true; });
    S.sheet = null;
  },
  startTable() {
    const me = P(S.me), opp = P(S.sheet.target);
    const busy = liveOf(me.id) || liveOf(opp.id);
    if (busy) return void toast(`${liveOf(me.id) ? 'You are' : `${opp.name} is`} already on the table`);
    // az ugyanerre a párra nyitott kihívás élesedik, nem duplikálódik
    let ch = S.challenges.find((c) => ['pending', 'accepted'].includes(c.status) && [c.from, c.to].includes(me.id) && [c.from, c.to].includes(opp.id));
    if (!ch) {
      ch = { id: uid(), from: me.id, to: opp.id, status: 'accepted', createdAt: now(), expiresAt: now() + EXPIRY_MS, fromElo: me.elo, toElo: opp.elo, preds: {}, chat: [], startedAt: null };
      S.challenges.unshift(ch);
    }
    S.sheet = null;
    S.overlay = { type: 'duel', a: me.id, b: opp.id, ch: ch.id, instant: true, msg: `Live now. The office has four minutes to call it. Winner takes ${stakeFor(me, opp).win}.` };
    // a clash után magától indul
    const o = S.overlay;
    setTimeout(async () => {
      if (S.overlay !== o) return;
      await exitOverlay();
      if (S.overlay !== o) return;
      actions.start(ch.id); render();
    }, RM.matches ? 200 : 2200);
  },
  saveDeadline() {
    const v = $('#deadlineInput')?.value;
    const ts = v ? new Date(v).getTime() : NaN;
    if (!v || Number.isNaN(ts)) return void toast('Pick a date and time');
    if (ts <= now()) return void toast('Pick a time in the future');
    S.seasonEndsAt = ts; delete S.inputs.deadlineInput;
    toast(`Season ${S.season} ends in ${describeTimeLeft(ts)}`);
    return 'noRender';
  },
  clearDeadline() { S.seasonEndsAt = null; delete S.inputs.deadlineInput; toast('End date cleared'); return 'noRender'; },
  closeOverlay() { S.overlay = null; },
  callout(target) { openCallout(target); },
  rematch(opp) { S.overlay = null; S.stack = []; openCallout(opp); },
  quick() {
    const pool = S.players.filter((p) => p.id !== S.me && !isDormant(p) && !busyWith(p.id));
    if (busyWith(S.me)) return void openCallout(null);
    if (!pool.length) return void toast('Nobody free to play');
    const o = { type: 'quick' };
    S.overlay = o;
    const final = pick(pool);
    let i = 0;
    const spin = setInterval(() => {
      const el = $('#quickName');
      if (!el || S.overlay !== o) return clearInterval(spin);
      el.textContent = pool[i++ % pool.length].name;
    }, 95);
    setTimeout(() => {
      clearInterval(spin);
      if (S.overlay !== o) return;
      const el = $('#quickName'), sub = $('#quickSub');
      if (el) el.textContent = final.name;
      if (sub) sub.textContent = 'Match found';
      setTimeout(async () => {
        if (S.overlay !== o) return;
        await exitOverlay();
        S.overlay = null; openCallout(final.id); render();
      }, 650);
    }, RM.matches ? 300 : 1850);
  },
  draft(v) {
    const [k, id] = v.split(':');
    if (k === 'reset') { S.sheet.a = S.sheet.b = S.sheet.w = null; return; }
    S.sheet[k] = id;
  },
  sendCallout() {
    const to = P(S.sheet.target), me = P(S.me);
    if (busyWith(me.id) || busyWith(to.id)) return void toast('One of you already has an open challenge');
    const myId = me.id;
    const ch = { id: uid(), from: me.id, to: to.id, status: 'pending', createdAt: now(), expiresAt: now() + EXPIRY_MS, fromElo: me.elo, toElo: to.elo, preds: {}, chat: [], startedAt: null };
    S.challenges.unshift(ch);
    fresh.add(ch.id);
    S.sheet = null; S.stack = []; S.tab = 'arena';
    S.overlay = { type: 'sent', to: to.id };
    // az ellenfél pár másodperc múlva elfogadja, hogy a folyamat végigkattintható legyen
    setTimeout(() => {
      if (ch.status !== 'pending' || S.me !== myId) return;
      ch.status = 'accepted';
      fresh.add(ch.id);
      const cur = S.stack[S.stack.length - 1];
      if (S.overlay || S.sheet || cur?.type === 'live') return void toast(`${to.name} accepted your callout`);
      S.overlay = { type: 'duel', a: me.id, b: to.id, ch: ch.id, msg: `${to.name} accepted. Winner takes ${stakeFor(me, to).win}.` };
      render();
    }, 6000);
  },
  accept(id) {
    const ch = S.challenges.find((c) => c.id === id);
    if (ch.status !== 'pending') { S.sheet = null; return void toast('This callout is no longer open'); }
    if (busyWith(S.me, id)) { S.sheet = null; return void toast('You already have another open challenge'); }
    ch.status = 'accepted';
    fresh.add(id);
    const opp = P(ch.from);
    S.sheet = null;
    S.overlay = { type: 'duel', a: S.me, b: opp.id, ch: id, msg: `You accepted ${opp.name}. Worth +${stakeFor(P(S.me), opp).win} to you.` };
  },
  decline(id) {
    const ch = S.challenges.find((c) => c.id === id);
    ch.status = 'declined';
    S.tally.ducks[S.me] = (S.tally.ducks[S.me] || 0) + 1;
    syncBadges([S.me]);
    S.sheet = null;
    S.overlay = { type: 'duck' };
  },
  cancelCh(id) { S.challenges.find((c) => c.id === id).status = 'cancelled'; toast('Callout cancelled'); return 'noRender'; },
  start(id) {
    const ch = S.challenges.find((c) => c.id === id);
    if (busyWith(ch.from, id)?.status === 'live' || busyWith(ch.to, id)?.status === 'live') return void toast('Someone is already on the table');
    ch.status = 'live'; ch.startedAt = now();
    const others = S.players.filter((p) => p.id !== ch.from && p.id !== ch.to && p.id !== S.me && !isDormant(p));
    if (others[0]) ch.preds[others[0].id] ??= { pick: ch.from };
    if (others[1]) ch.preds[others[1].id] ??= { pick: ch.to };
    if (others[2]) ch.chat.push({ id: uid(), author: others[2].id, text: "let's gooo", ts: now() });
    S.overlay = null; S.sheet = null;
    S.stack = [{ type: 'live', id }];
  },
  unstart(id) {
    const ch = S.challenges.find((c) => c.id === id);
    ch.status = 'accepted'; ch.startedAt = null;
    S.stack = []; S.tab = 'arena';
    toast('Back to agreed');
    return 'noRender';
  },
  call(v) {
    const [id, pid] = v.split(':');
    const ch = S.challenges.find((c) => c.id === id);
    if (ch.preds[S.me]) return;
    if (ch.status === 'live' && ch.startedAt + VOTE_MS <= now()) return void toast('Calls are closed');
    const lock = S.lockArm === id;
    ch.preds[S.me] = { pick: pid, lock };
    if (lock) { S.lockDay = new Date().toDateString(); S.lockArm = null; }
    toast(`You called ${P(pid).name}${lock ? '. Locked' : ''}`);
    return 'noRender';
  },
  lock(id) {
    if (S.lockDay === new Date().toDateString()) return void toast('One lock a day');
    S.lockArm = S.lockArm === id ? null : id;
  },
  cheer(e, el) {
    if (el) bump('cheers');
    const stage = $('#stage');
    if (!stage) return 'noRender';
    const f = document.createElement('span');
    f.className = 'float-emoji';
    f.setAttribute('aria-hidden', 'true');
    f.textContent = e;
    const x = el ? el.offsetLeft + el.offsetWidth / 2 - 15 : stage.offsetWidth * (0.2 + Math.random() * 0.6);
    f.style.left = `${x}px`;
    f.style.top = `${el ? el.offsetTop - 10 : stage.offsetHeight * 0.45}px`;
    stage.appendChild(f);
    setTimeout(() => f.remove(), 520);
    return 'noRender';
  },
  react(v) {
    const [id, e] = v.split(':');
    const m = S.matches.find((x) => x.id === id);
    if (m.reactions[S.me] === e) delete m.reactions[S.me]; else m.reactions[S.me] = e;
  },
  delComment(v) {
    const [mid, cid] = v.split(':');
    const m = S.matches.find((x) => x.id === mid);
    m.comments = m.comments.filter((c) => c.id !== cid);
  },
  confirmLog(g) { applyResult(S.sheet.w, S.sheet.w === S.sheet.a ? S.sheet.b : S.sheet.a, null, { group: g }); },
  confirmResult(g) {
    const ch = S.challenges.find((c) => c.id === S.sheet.ch);
    applyResult(S.sheet.w, S.sheet.w === ch.from ? ch.to : ch.from, ch.id, { group: g });
  },
  undo() {
    if (!S.undo) return;
    Object.assign(S, S.undo);
    S.undo = null; S.overlay = null;
    baseline();
    toast('Result removed');
    return 'noRender';
  },
  enrolBall(n) { S.sheet.ball = Number(n); },
  submitEnrol() {
    const f = $('[data-form="enrol"]');
    const name = f.name.value.trim();
    if (!name) { S.sheet.err = 'Add a name first'; return; }
    if (S.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) { S.sheet.err = `${name} is already here`; return; }
    const p = mkPlayer(uid(), name, f.dept.value.trim() || 'Office', S.sheet.ball ?? 9, 1000, 0, 0, 0, '', null);
    p.peak = 1000; p.bestStreak = 0;
    S.players.push(p);
    const self = S.sheet.self;
    S.sheet = null;
    delete S.inputs.enrolName; delete S.inputs.enrolDept;
    if (self) return actions.setMe(p.id);
    toast(`${name} enrolled on 1000`);
    return 'noRender';
  },
  setBall(n) { P(S.me).ball = Number(n); },
  closeSeason(v, el, auto = false) {
    const r = ranked();
    const champ = r[0], closing = S.season;
    S.seasons.push({ number: S.season, endedAt: now(), name: `Season ${S.season}`, podium: r.slice(0, 3).map((p) => [p.name, p.elo]), titles: titles().map((t) => `${t.e} ${t.holder}`) });
    S.players.forEach((p) => { p.elo = Math.round(1000 + (p.elo - 1000) / 2); S.seasonStart[p.id] = p.elo; p.peak = p.elo; p.form = []; p.streak = 0; p.bestStreak = 0; p.wins = 0; p.losses = 0; });
    S.challenges.forEach((c) => { if (ACTIVE.includes(c.status)) c.status = 'cancelled'; });
    S.tally = { upsets: {}, week: {}, wall: {}, kings: {}, cursed: {}, ducks: {} };
    S.season++;
    S.seasonEndsAt = null;
    S.crownSince = now();
    S.sheet = null; S.stack = []; S.undo = null;
    if (champ) {
      S.overlay = { type: 'champion', w: champ.id, season: closing, auto };
      S.players.forEach((p) => { if (p.id !== champ.id) S.inbox.unshift({ id: uid(), to: p.id, type: 'season', title: `${champ.name} won season ${closing}`, body: `Season ${S.season} is open. Everyone kept half their lead over 1000.`, ts: now(), read: false }); });
      S.inbox.unshift({ id: uid(), to: champ.id, type: 'season', title: `You won season ${closing}`, body: 'Your name is in the hall of fame.', ts: now(), read: false });
    }
  },
};

let exiting = false;
async function run(el) {
  if (!el || el.disabled || exiting) return;
  const a = el.dataset.a, v = el.dataset.v ?? '';
  if (EXITS[a]) {
    const p = EXITS[a](v, el);
    if (p) { exiting = true; await p; exiting = false; }
  }
  lastHit = ACK.has(a) ? `${a}|${v}` : null;
  const out = actions[a]?.(v, el);
  if (out !== 'noRender') render();
}

// Fényfolt a nyomás helyén. A #device-on kívül él, így túléli az újrarajzolást.
const RIPPLE = '.btn, .tap, .pick, .call-btn, .react-btn, .ball-pick, .chip-elo, .lock, .tab, .cheers button, .toast-btn';
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest(RIPPLE);
  if (!el || el.disabled || RM.matches) return;
  const r = el.getBoundingClientRect();
  const host = document.createElement('span');
  host.className = 'ripple-host';
  Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: getComputedStyle(el).borderRadius });
  const bg = getComputedStyle(el).backgroundColor;
  const light = /rgb\((2[3-5]\d), (2[3-5]\d), (2[3-5]\d)\)/.test(bg) || el.matches('.lb-row.first');
  const dot = document.createElement('span');
  const size = Math.max(r.width, r.height) * 2.2;
  Object.assign(dot.style, { width: size + 'px', height: size + 'px', left: e.clientX - r.left - size / 2 + 'px', top: e.clientY - r.top - size / 2 + 'px', background: light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.2)' });
  host.appendChild(dot);
  document.body.appendChild(host);
  dot.animate([{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }], { duration: 460, easing: EASE, fill: 'forwards' });
  setTimeout(() => host.remove(), 520);
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  e.preventDefault();
  run(el);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (S.overlay && S.overlay.type !== 'quick') return run($('.ov [data-a="closeOverlay"]'));
    if (S.sheet) return run($('.sheet [data-a="closeSheet"]'));
    if (S.stack.length) return run($('[data-a="back"]'));
  }
  // div-alapú gombok (eredménykártya, élő kártya)
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-a]')) { e.preventDefault(); run(e.target); }
  // fókuszcsapda a nyitott dialógusban
  if (e.key === 'Tab') {
    const dlg = $('.ov') || $('.sheet');
    if (!dlg) return;
    const f = [...dlg.querySelectorAll('button:not([disabled]), input')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  e.preventDefault();
  if (f.dataset.form === 'enrol') return run($('[data-a="submitEnrol"]'));
  const text = f.text?.value.trim();
  if (!text) return;
  if (f.dataset.form === 'chat') {
    const ch = S.challenges.find((c) => c.id === f.dataset.v);
    const m = { id: uid(), author: S.me, text, ts: now() };
    ch.chat.push(m);
    bump('chat');
    f.text.value = ''; delete S.inputs.chatInput;
    const chat = $('#chat');
    chat.insertAdjacentHTML('beforeend', chatLine(m, true));
    chat.scrollTop = chat.scrollHeight;
  }
  if (f.dataset.form === 'comment') {
    const c = { id: uid(), author: S.me, text, ts: now() };
    S.matches.find((m) => m.id === f.dataset.v).comments.push(c);
    fresh.add(c.id);
    f.text.value = ''; delete S.inputs.commentInput;
    render();
  }
});

// Visszaszámlálók, lejáratok és élő chat szimuláció
const CHAT_LINES = ['what a shot', 'no way', 'called it', 'bank it!', '🎱', 'pressure 😬', 'easy money', 'this is going to the 8', 'he is shaking', 'clutch', 'rematch incoming', '🔥🔥'];
let tickN = 0;
setInterval(() => {
  tickN++;
  let rerender = false;
  for (const el of document.querySelectorAll('[data-cd]')) {
    const ch = S.challenges.find((c) => c.id === el.dataset.cd);
    if (!ch || !ch.startedAt) continue;
    const left = ch.startedAt + VOTE_MS - now();
    const live = el.classList.contains('chip-live');
    el.textContent = left > 0 ? (live ? 'Live ' : 'Calls ') + mmss(left) : (live ? 'Live' : 'Calls closed');
    // a tipp-gombok zárásakor egyszer újrarajzolunk
    if (left <= 0 && !ch.closedShown) { ch.closedShown = true; rerender = true; }
  }
  for (const c of S.challenges) {
    if (c.status === 'pending' && c.expiresAt <= now()) { c.status = 'expired'; rerender = true; }
    // a minta élő meccs magától véget ér 30 mp-cel a tippek zárása után
    if (c.sim && c.status === 'live' && now() > c.startedAt + VOTE_MS + 30_000 && S.me) {
      const pa = expected(P(c.from).elo, P(c.to).elo);
      const [w, l] = Math.random() < pa ? [c.from, c.to] : [c.to, c.from];
      applyResult(w, l, c.id, { silent: true, group: Math.random() < 0.5 ? 'solids' : 'stripes' });
      rerender = true;
    }
  }
  // szezon határidő: pontosan egyszer zárul
  if (S.me && S.seasonEndsAt && now() >= S.seasonEndsAt) {
    S.seasonEndsAt = null;
    actions.closeSeason(null, null, true);
    render();
  }
  // a visszaszámláló percenként frissül a Ranks nézeten
  if (tickN % 30 === 0 && S.tab === 'ranks' && !S.stack.length) rerender = true;
  if (rerender && !S.sheet && !S.overlay && S.me) render();

  const cur = S.stack[S.stack.length - 1];
  if (cur?.type === 'live' && !S.sheet && !S.overlay) {
    const ch = S.challenges.find((c) => c.id === cur.id);
    if (ch && ch.status === 'live') {
      if (tickN % 5 === 0) {
        const pool = S.players.filter((p) => p.id !== S.me && p.id !== ch.from && p.id !== ch.to);
        const chat = $('#chat');
        if (pool.length && chat) {
          const m = { id: uid(), author: pick(pool).id, text: pick(CHAT_LINES), ts: now() };
          ch.chat.push(m);
          const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 30;
          chat.insertAdjacentHTML('beforeend', chatLine(m, true));
          if (atBottom) chat.scrollTop = chat.scrollHeight;
        }
      }
      if (tickN % 3 === 0) actions.cheer(pick(CHEERS));
    }
  }
}, 1000);

render();
