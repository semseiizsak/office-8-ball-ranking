import { runLeagueReplay, deriveLeagueInsights, computeRivalry, bountyForReign, DAY_MS } from '../src/utils/league';
import { calculateMatchElo, calculateProjectedStakes } from '../src/utils/elo';
import { previewStakes } from '../src/utils/stakes';
import { MatchRecord, Player } from '../src/types';

const T0 = new Date('2026-09-01T10:00:00Z').getTime();
let ok = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  pass ? ok++ : fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${pass ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};

const mkPlayer = (id: string): Player => ({
  id, name: id, avatarUrl: '', ballPreference: 'solids', elo: 1000, peakElo: 1000,
  wins: 0, losses: 0, currentStreak: 0, bestWinStreak: 0, breakAndRuns: 0, recentForm: [],
  lastPlayedAt: null, predictionsCorrect: 0, predictionsTotal: 0, createdAt: '2026-01-01',
});
let n = 0;
const mkMatch = (a: string, b: string, winner: string, atMs: number): MatchRecord => ({
  id: `m${n++}`, timestamp: atMs, playerAId: a, playerAName: a, playerBId: b, playerBName: b,
  winnerId: winner, loserId: winner === a ? b : a,
  playerAEloBefore: 0, playerAEloAfter: 0, playerBEloBefore: 0, playerBEloAfter: 0,
  eloDelta: 0, isUpset: false, bountyCollected: 0,
  modifiers: { eightOnBreak: false, scratchOnEight: false },
});

// --- bounty pricing ---
eq('bounty: same day = 0', bountyForReign(DAY_MS - 1), 0);
eq('bounty: 1 day = 3', bountyForReign(DAY_MS), 3);
eq('bounty: 6 days = 18', bountyForReign(6 * DAY_MS), 18);
eq('bounty: capped at 60', bountyForReign(400 * DAY_MS), 60);

// --- elo asymmetry (the user's one requirement) ---
const underdog = calculateMatchElo(900, 1100, 'A');
const favourite = calculateMatchElo(1100, 900, 'A');
eq('underdog win pays more than favourite win', underdog.deltaA > favourite.deltaA, true);
console.log(`      underdog +${underdog.deltaA} vs favourite +${favourite.deltaA}`);
eq('underdog win is flagged an upset', underdog.isUpset, true);
eq('favourite win is not an upset', favourite.isUpset, false);
eq('near-even win is not an upset', calculateMatchElo(1000, 1030, 'A').isUpset, false);

// --- replay: A beats B twice, zero-sum ---
const ids = ['A', 'B', 'C'];
const r1 = runLeagueReplay(ids, [mkMatch('A', 'B', 'A', T0), mkMatch('A', 'B', 'A', T0 + 3600_000)]);
const a1 = r1.members.get('A')!, b1 = r1.members.get('B')!;
eq('replay: zero-sum with no crown involved', a1.elo + b1.elo, 2000);
eq('replay: wins/losses', [a1.wins, a1.losses, b1.wins, b1.losses], [2, 0, 0, 2]);
eq('replay: streaks', [a1.currentStreak, b1.currentStreak], [2, -2]);
eq('replay: A crowned', r1.reigns[r1.reigns.length - 1].playerId, 'A');

// --- crown bounty: A holds crown 6 days, C takes it down ---
const r2 = runLeagueReplay(ids, [
  mkMatch('A', 'B', 'A', T0),                       // A takes #1
  mkMatch('C', 'A', 'C', T0 + 6 * DAY_MS),          // C dethrones after 6 days
]);
const m2 = r2.matches[1];
eq('crown: 6-day reign pays 18 bounty', m2.bountyCollected, 18);
const a2 = r2.members.get('A')!, c2 = r2.members.get('C')!;
eq('crown: bounty is zero-sum', a2.elo + c2.elo + r2.members.get('B')!.elo, 3000);
eq('crown: slayer credited', c2.bountyCollected, 18);
eq('crown: changed hands', r2.reigns[r2.reigns.length - 1].playerId, 'C');

// --- crown cannot be farmed same-day ---
const r3 = runLeagueReplay(ids, [
  mkMatch('A', 'B', 'A', T0),
  mkMatch('C', 'A', 'C', T0 + 3600_000),
]);
eq('crown: same-day dethrone pays nothing', r3.matches[1].bountyCollected, 0);

// --- determinism: replay is stable regardless of input order ---
const shuffled = [mkMatch('C', 'A', 'C', T0 + 6 * DAY_MS), mkMatch('A', 'B', 'A', T0)];
const r4 = runLeagueReplay(ids, shuffled);
eq('replay: order-independent', r4.members.get('C')!.elo, c2.elo);

// --- titles ---
const players = ids.map(mkPlayer);
const applied = r2.members;
for (const p of players) { const m = applied.get(p.id)!; p.elo = m.elo; p.wins = m.wins; p.losses = m.losses; p.lastPlayedAt = m.lastPlayedAt; }
const now = T0 + 6 * DAY_MS + 3600_000;
const ins = deriveLeagueInsights(players, r2.matches, [], now);
eq('crown state: holder is C', ins.crown.holderId, 'C');
eq('crown state: fresh reign has no bounty yet', ins.crown.bounty, 0);
const killer = ins.titles.find((t) => t.key === 'giant-killer');
eq('title: Giant Killer went to C', killer?.holderId, 'C');
const kingslayer = ins.titles.find((t) => t.key === 'kingslayer');
eq('title: Kingslayer went to C', kingslayer?.holderId, 'C');
eq('title: Cursed went to A (lost to lower-rated)', ins.titles.find((t) => t.key === 'cursed')?.holderId, 'A');
eq('title: no Oracle without enough predictions', ins.titles.find((t) => t.key === 'the-oracle'), undefined);

// --- dormancy ---
const later = deriveLeagueInsights(players, r2.matches, [], T0 + 40 * DAY_MS);
eq('dormancy: everyone idle 40 days is dormant', [...later.insights.values()].every((i) => i.isDormant), true);
eq('dormancy: nobody dormant inside the 14-day window', [...ins.insights.values()].filter((i) => i.isDormant).length, 0);
const edge = deriveLeagueInsights(players, r2.matches, [], T0 + 6 * DAY_MS + 14 * DAY_MS);
eq('dormancy: dormant exactly on day 14', edge.insights.get('C')!.isDormant, true);

// --- rivalry truthfulness ---
const riv = computeRivalry('A', 'B', players, r2.matches, now);
eq('rivalry: meetings counted', riv?.meetings, 1);
eq('rivalry: ledger', [riv?.wins, riv?.losses], [1, 0]);
console.log('      commentary:', riv?.commentary);

// --- projected stakes include bounty ---
const stakes = calculateProjectedStakes(1000, 1100, 0, 18);
const plain = calculateProjectedStakes(1000, 1100, 0, 0);
eq('stakes: bounty added to challenger upside', stakes.playerAWinsDelta - plain.playerAWinsDelta, 18);
eq('stakes: bounty not added to holder upside', stakes.playerBWinsDelta, plain.playerBWinsDelta);

// --- pre-match stakes: the app reaching into the room ---
const ladder = ['top', 'mid', 'low'].map(mkPlayer);
ladder[0].elo = 1030; ladder[1].elo = 1010; ladder[2].elo = 1000;
ladder.forEach((p) => { p.wins = 5; });
const climb = previewStakes(ladder[2], ladder[1], ladder);
eq('stakes: beating the player above you takes their rank', climb.rankIfWin, 2);
eq('stakes: losing to them keeps you where you are', climb.rankIfLose, 3);
eq('stakes: names who you would overtake', climb.overtakes, 'mid');
eq('stakes: underdog flagged', climb.isUnderdog, true);
console.log('      headline:', climb.headline);

const defend = previewStakes(ladder[0], ladder[1], ladder);
eq('stakes: leader losing drops a place', defend.rankIfLose, 2);
eq('stakes: names who would pass you', defend.fallsBelow, 'mid');
console.log('      headline:', defend.headline);

const withBounty = previewStakes(ladder[2], ladder[0], ladder, 30);
const withoutBounty = previewStakes(ladder[2], ladder[0], ladder, 0);
eq('stakes: crown bounty raises the upside', withBounty.winDelta - withoutBounty.winDelta, 30);
eq('stakes: crown bounty leaves the downside alone', withBounty.loseDelta, withoutBounty.loseDelta);

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
