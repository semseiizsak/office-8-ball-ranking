// Demo league so a single phone already has a living ladder. Join it with code DEMO42.
import { applyMatch, type DB } from '@/lib/engine';
import type { Member } from '@/lib/types';
import type { PlayerColour } from '@/theme';

export const DEMO_CODE = 'DEMO42';

export function seedDemo(seed = 16): DB {
  const d: DB = { teams: [{ id: 'team_acme', name: 'Acme Studio' }], leagues: [], members: [], matches: [], mps: [] };
  const created = new Date(Date.now() - 24 * 86400000);
  d.leagues.push({ id: 'lg_demo', team_id: 'team_acme', name: 'Office foosball', sport: 'foosball', invite_code: DEMO_CODE, k_factor: 32, start_rating: 1000, created_at: created.toISOString(),
    modules: { seasons: true, xp: true, kiosk: true, pass: true, predictions: true }, season: { length: 'weekly' } }); // weekly test seasons: 3 finished, 1 live
  const people: [string, PlayerColour, number, number][] = [
    ['Mira', 'orange', 5, 0.68], ['Dave', 'blue', 7, 0.62], ['Sam', 'yellow', 1, 0.52], ['Kim', 'purple', 4, 0.45], ['Joe', 'red', 3, 0.4], ['Ann', 'maroon', 2, 0.36],
  ];
  const skill = new Map<string, number>();
  people.forEach(([name, colour, jersey, s]) => {
    const m: Member = { id: 'm_' + name.toLowerCase(), league_id: 'lg_demo', user_id: null, display_name: name, jersey, colour, role: name === 'Mira' ? 'owner' : 'member', rating: 1000, wins: 0, losses: 0, streak: 0, last_played_at: null };
    d.members.push(m); skill.set(m.id, s);
  });
  // Deterministic pseudo random so the demo looks the same on every phone.
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const ids = d.members.map((m) => m.id);
  for (let i = 0; i < 64; i++) {
    const at = new Date(created.getTime() + (i / 64) * 23 * 86400000 + rnd() * 3600000 * 6);
    at.setHours(9 + (i % 9), at.getMinutes()); // office hours only
    const pick = [...ids];
    for (let j = pick.length - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); [pick[j], pick[k]] = [pick[k], pick[j]]; }
    const two = rnd() < 0.3;
    const a = pick.slice(0, two ? 2 : 1), b = pick.slice(two ? 2 : 1, two ? 4 : 2);
    const sa = a.reduce((s, id) => s + skill.get(id)!, 0), sb = b.reduce((s, id) => s + skill.get(id)!, 0);
    const winner = rnd() < sa ** 4 / (sa ** 4 + sb ** 4) ? 'a' : 'b';
    const loserGoals = Math.floor(rnd() * 9);
    applyMatch(d, 'lg_demo', a, b, winner, 'seed', rnd() < 0.6 ? (winner === 'a' ? [10, loserGoals] : [loserGoals, 10]) : null, at);
  }
  // A few reactions from teammates so match details are not empty.
  const emojis = ['🔥', '👏', '😂', '😮', '💀'];
  d.reactions = [];
  for (const m of d.matches) {
    if (rnd() < 0.45) {
      const who = ids[Math.floor(rnd() * ids.length)];
      d.reactions.push({ match_id: m.id, member_id: who, emoji: emojis[Math.floor(rnd() * emojis.length)] });
      if (rnd() < 0.4) d.reactions.push({ match_id: m.id, member_id: ids[(ids.indexOf(who) + 1) % ids.length], emoji: '🔥' });
    }
  }
  return d;
}
