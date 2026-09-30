import { runLeagueReplay, deriveLeagueInsights, computeRivalry, bountyForReign, softResetElo, matchesInSeason, IMPLICIT_SEASON, DAY_MS } from '../src/utils/league';
import { isDatabaseDown, planSync, queueMatch, resolveName, offlineMatchDocId } from '../src/utils/outbox';
import { Season } from '../src/types';
import { calculateMatchElo, calculateProjectedStakes } from '../src/utils/elo';
import { previewStakes } from '../src/utils/stakes';
import { buildMatchRecap } from '../src/utils/recap';
import { earnedNotifications } from '../src/utils/earned';
import { buildSeasonFinale, FINALE_WINDOW_MS } from '../src/utils/finale';
import { nerveDelta, deriveNerve, describeTimeLeft, isFinalDay, callsOpen, VOTE_WINDOW_MS, NERVE_BASE } from '../src/utils/league';
import { Challenge } from '../src/types';
import { MatchRecord, Player } from '../src/types';
import { deriveChips, spentOnDay } from '../src/utils/chips';
import { dayKeyOf, deriveDaily, drawPairing } from '../src/utils/daily';
import { CARDS_PER_PACK, ODDS, RARITIES, earnedPackReason, rollPack, rollRarity, seeded, specialAwards } from '../src/utils/cards';
import { rewardFor } from '../src/utils/rewards';
import { buildBadgeContext, earnedBadges, achievementProgress } from '../src/utils/achievements';
import { latestReleasedMonday, releaseOf, weekAwards } from '../src/utils/awards';
import { bracketShape, deriveCups, gameDeadline, gamesOf, resolveCup, seedField, slotOrder, weekTournament, withCloseOverride } from '../src/utils/tournament';

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
  lastPlayedAt: null, createdAt: '2026-01-01',
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
// The crown is priced on mornings survived, not on elapsed hours.
const at = (iso: string) => new Date(iso).getTime();
const wonTuesdayEvening = at('2026-09-15T18:00:00');
eq('bounty: still nothing later the same evening',
   bountyForReign(wonTuesdayEvening, at('2026-09-15T23:30:00')), 0);
eq('bounty: 3 the very next morning, only 15 hours later',
   bountyForReign(wonTuesdayEvening, at('2026-09-16T09:00:00')), 3);
eq('bounty: still 3 later that same day',
   bountyForReign(wonTuesdayEvening, at('2026-09-16T22:00:00')), 3);
eq('bounty: 6 on the second morning',
   bountyForReign(wonTuesdayEvening, at('2026-09-17T07:30:00')), 6);
eq('bounty: a win just before midnight is worth nothing that night',
   bountyForReign(at('2026-09-15T23:50:00'), at('2026-09-15T23:59:00')), 0);
eq('bounty: capped at 60', bountyForReign(at('2026-01-01T12:00:00'), at('2026-09-01T12:00:00')), 60);

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

// --- the bounty is paid once per reign, not once per win ---
// A dominant holder can lose and stay #1; without ending the reign on payout
// the same maxed-out pot could be collected repeatedly.
const dominant: MatchRecord[] = [];
for (let i = 0; i < 25; i++) dominant.push(mkMatch('A', i % 2 ? 'B' : 'D', 'A', T0 + i * 1000));
dominant.push(mkMatch('C', 'A', 'C', T0 + 20 * DAY_MS));
dominant.push(mkMatch('C', 'A', 'C', T0 + 20 * DAY_MS + 3600_000));
const rBounty = runLeagueReplay(['A', 'B', 'C', 'D'], dominant);
eq('bounty: holder survives the loss and keeps top spot',
   rBounty.matches[25].playerAEloAfter < rBounty.members.get('A')!.elo + 1000, true);
eq('bounty: first win over the holder collects the pot', rBounty.matches[25].bountyCollected, 60);
eq('bounty: an immediate rematch collects nothing', rBounty.matches[26].bountyCollected, 0);
eq('bounty: total collected is one payout', rBounty.members.get('C')!.bountyCollected, 60);

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

// --- seasons ---
eq('season: soft reset halves the lead over 1000', softResetElo(1200), 1100);
eq('season: soft reset lifts a trailing rating', softResetElo(900), 950);
eq('season: baseline rating is unchanged', softResetElo(1000), 1000);

const seasonTwo: Season = {
  id: 's2', number: 2, name: 'Season 2',
  startedAt: T0 + 3 * DAY_MS, endedAt: null, endsAt: null,
  startingElo: { A: 1100, B: 950, C: 1000 },
  standings: [], titles: [],
};
const spanning = [
  mkMatch('A', 'B', 'A', T0),                    // season one
  mkMatch('B', 'C', 'B', T0 + 5 * DAY_MS),       // season two
];
eq('season: window excludes earlier matches', matchesInSeason(spanning, seasonTwo).length, 1);
eq('season: implicit season covers everything', matchesInSeason(spanning, IMPLICIT_SEASON).length, 2);

const s2replay = runLeagueReplay(ids, matchesInSeason(spanning, seasonTwo), seasonTwo.startingElo);
eq('season: untouched player keeps their carried rating', s2replay.members.get('A')!.elo, 1100);
eq('season: replay starts from the carried rating, not 1000',
   s2replay.members.get('B')!.elo > 950, true);
eq('season: season-two record ignores season-one results',
   [s2replay.members.get('A')!.wins, s2replay.members.get('B')!.wins], [0, 1]);
eq('season: carried ratings stay zero-sum within the season',
   s2replay.members.get('B')!.elo + s2replay.members.get('C')!.elo, 1950);

// --- nerve: calls are paid on how unlikely they were ---
const underdogHit = nerveDelta({ calledElo: 900, opponentElo: 1100, wasCorrect: true });
const favouriteHit = nerveDelta({ calledElo: 1100, opponentElo: 900, wasCorrect: true });
eq('nerve: calling the underdog pays more than calling the favourite',
   underdogHit > favouriteHit, true);
console.log(`      underdog call +${underdogHit} vs favourite call +${favouriteHit}`);

const favouriteMiss = nerveDelta({ calledElo: 1100, opponentElo: 900, wasCorrect: false });
const underdogMiss = nerveDelta({ calledElo: 900, opponentElo: 1100, wasCorrect: false });
eq('nerve: missing on the favourite costs more than missing on the underdog',
   favouriteMiss < underdogMiss, true);
console.log(`      favourite miss ${favouriteMiss} vs underdog miss ${underdogMiss}`);

// A proper scoring rule: at the model's own odds, calling is worth nothing on
// average, so there is no edge in only calling the easy ones.
const p = 1 / (1 + Math.pow(10, (900 - 1100) / 400));
const expectedValue = p * nerveDelta({ calledElo: 1100, opponentElo: 900, wasCorrect: true })
  + (1 - p) * nerveDelta({ calledElo: 1100, opponentElo: 900, wasCorrect: false });
eq('nerve: calling at the model odds is worth nothing on average',
   Math.abs(expectedValue) < 1, true);
console.log(`      expected value of a favourite call: ${expectedValue.toFixed(3)}`);

const evenUp = nerveDelta({ calledElo: 1000, opponentElo: 1000, wasCorrect: true });
eq('nerve: a coin-flip call pays half the K factor', evenUp, 16);
eq('nerve: a lock doubles the gain',
   nerveDelta({ calledElo: 1000, opponentElo: 1000, wasCorrect: true, isLock: true }), 32);
eq('nerve: a lock doubles the loss',
   nerveDelta({ calledElo: 1000, opponentElo: 1000, wasCorrect: false, isLock: true }), -32);

// --- nerve is rebuilt from challenges already settled, with nothing stored ---
let cn = 0;
const settledChallenge = (
  challengerElo: number, opponentElo: number, winner: 'challenger' | 'opponent',
  calls: Array<[string, 'challenger' | 'opponent', boolean?]>, atMs: number
): Challenge => ({
  id: `c${cn++}`, challengerId: 'A', challengerName: 'A', opponentId: 'B', opponentName: 'B',
  status: 'played', createdAt: atMs, expiresAt: atMs + 1, respondedAt: atMs, startedAt: atMs,
  stakes: { challengerElo, opponentElo, challengerRank: 1, opponentRank: 2,
    challengerWinDelta: 0, opponentWinDelta: 0, challengerIsUnderdog: false, crownBounty: 0 },
  matchId: null, resolvedWinnerId: winner === 'challenger' ? 'A' : 'B',
  predictions: calls.map(([who, side, lock]) => ({
    id: who, predictorId: who, predictorName: who,
    predictedWinnerId: side === 'challenger' ? 'A' : 'B', createdAt: atMs, isLock: lock,
  })),
});

const history: Challenge[] = [
  // Brave called the 900 underdog and was right; Safe called the 1100 favourite.
  settledChallenge(900, 1100, 'challenger', [['brave', 'challenger'], ['safe', 'opponent']], T0),
  settledChallenge(900, 1100, 'challenger', [['brave', 'challenger'], ['safe', 'opponent']], T0 + 1000),
];
const rebuilt = deriveNerve(history, []);
eq('nerve: history is recovered with nothing stored on the player',
   rebuilt.get('brave')!.total, 2);
eq('nerve: two correct underdog calls beat the baseline',
   rebuilt.get('brave')!.nerve > NERVE_BASE, true);
eq('nerve: two wrong favourite calls fall below it',
   rebuilt.get('safe')!.nerve < NERVE_BASE, true);
eq('nerve: streaks rebuild too', rebuilt.get('brave')!.bestStreak, 2);
eq('nerve: a wrong call ends the streak', rebuilt.get('safe')!.streak, 0);
console.log(`      rebuilt: brave ${rebuilt.get('brave')!.nerve}, safe ${rebuilt.get('safe')!.nerve}`);

// The 38%-accuracy caller outranking the 78% one is the whole point.
const mixed = deriveNerve([
  settledChallenge(900, 1100, 'challenger', [['brave', 'challenger'], ['safe', 'opponent']], T0),
  settledChallenge(1100, 900, 'challenger', [['brave', 'opponent'], ['safe', 'challenger']], T0 + 1),
  settledChallenge(1100, 900, 'challenger', [['brave', 'opponent'], ['safe', 'challenger']], T0 + 2),
], []);
const braveAcc = mixed.get('brave')!.correct / mixed.get('brave')!.total;
const safeAcc = mixed.get('safe')!.correct / mixed.get('safe')!.total;
eq('nerve: the braver caller outranks the more accurate one',
   braveAcc < safeAcc && mixed.get('brave')!.nerve > mixed.get('safe')!.nerve, true);
console.log(`      brave ${Math.round(braveAcc*100)}% -> ${mixed.get('brave')!.nerve}; safe ${Math.round(safeAcc*100)}% -> ${mixed.get('safe')!.nerve}`);

// --- season deadline ---
const H = 3600_000, M = 60_000;
eq('deadline: days and hours', describeTimeLeft(T0 + 3 * DAY_MS + 4 * H, T0), '3d 4h');
eq('deadline: under a day drops to hours and minutes', describeTimeLeft(T0 + 6 * H + 12 * M, T0), '6h 12m');
eq('deadline: under an hour is minutes only', describeTimeLeft(T0 + 42 * M, T0), '42m');
eq('deadline: passed reads as now', describeTimeLeft(T0, T0 + 1), 'now');
eq('deadline: final day is the same calendar day', isFinalDay(at('2026-09-15T22:00:00'), at('2026-09-15T09:00:00')), true);
eq('deadline: tomorrow is not the final day', isFinalDay(at('2026-09-16T01:00:00'), at('2026-09-15T23:00:00')), false);
eq('deadline: once passed it is no longer the final day', isFinalDay(at('2026-09-15T09:00:00'), at('2026-09-15T10:00:00')), false);

// --- the call window is a rule, not a view ---
eq('calls: open while pending', callsOpen({ status: 'pending', startedAt: null }, T0), true);
eq('calls: open while accepted', callsOpen({ status: 'accepted', startedAt: null }, T0), true);
eq('calls: open just after the match starts', callsOpen({ status: 'live', startedAt: T0 }, T0 + 1000), true);
eq('calls: still open at the last second of the window', callsOpen({ status: 'live', startedAt: T0 }, T0 + VOTE_WINDOW_MS - 1), true);
eq('calls: closed once the window is up', callsOpen({ status: 'live', startedAt: T0 }, T0 + VOTE_WINDOW_MS), false);
eq('calls: closed on a settled match', callsOpen({ status: 'played', startedAt: T0 }, T0 + 1000), false);

// --- the payoff screen: what a result actually changed ---
{
  const roster = ['top', 'mid', 'low'].map(mkPlayer);
  roster[0].elo = 1030; roster[1].elo = 1010; roster[2].elo = 1000;
  roster.forEach((p, i) => { p.wins = 5; p.currentStreak = i === 0 ? 4 : 1; });
  // low beats top: passes both, top drops to third and has a 4-match run ended.
  const afterRoster = roster.map((p) =>
    p.id === 'low' ? { ...p, elo: 1040, wins: 6, currentStreak: 2 }
    : p.id === 'top' ? { ...p, elo: 990, losses: 1, currentStreak: -1 } : p);
  const recapMatch = mkMatch('low', 'top', 'low', T0 + 50 * DAY_MS);
  recapMatch.eloDelta = 40;
  const leagueEmpty = deriveLeagueInsights(roster, [], [], T0);
  const recap = buildMatchRecap({
    match: recapMatch, playersBefore: roster, playersAfter: afterRoster,
    matchesAfter: [recapMatch], challenge: null, leagueBefore: leagueEmpty, leagueAfter: leagueEmpty, now: T0 + 50 * DAY_MS,
  });
  eq('recap: winner rank before/after', [recap.winner.rank.before, recap.winner.rank.after], [3, 1]);
  eq('recap: names who was passed', recap.winner.rank.passed.sort(), ['mid', 'top']);
  eq('recap: loser rank before/after', [recap.loser.rank.before, recap.loser.rank.after], [1, 3]);
  eq('recap: names who went past the loser', recap.loser.rank.passedBy.sort(), ['low', 'mid']);
  eq('recap: remembers the run that was ended', recap.loser.streakBefore, 4);
  eq('recap: winner streak after', recap.winner.streak, 2);
  eq('recap: rivalry told from the winner side', [recap.rivalry?.wins, recap.rivalry?.losses], [1, 0]);
  eq('recap: no calls when there was no challenge', recap.calls, null);

  const called = { ...settledChallenge(1000, 1030, 'challenger', [['a', 'challenger'], ['b', 'opponent'], ['c', 'challenger']], T0),
    challengerId: 'low', opponentId: 'top', resolvedWinnerId: 'low' };
  called.predictions = called.predictions.map((p) => ({ ...p, predictedWinnerId: p.predictedWinnerId === 'A' ? 'low' : 'top' }));
  const withCalls = buildMatchRecap({
    match: recapMatch, playersBefore: roster, playersAfter: afterRoster,
    matchesAfter: [recapMatch], challenge: called, leagueBefore: leagueEmpty, leagueAfter: leagueEmpty, now: T0 + 50 * DAY_MS,
  });
  eq('recap: splits callers by whether they were right', [withCalls.calls?.right, withCalls.calls?.wrong], [['a', 'c'], ['b']]);
}

// --- who a result is worth telling ---
{
  const roster = ['top', 'mid', 'low', 'idle'].map(mkPlayer);
  roster[0].elo = 1030; roster[1].elo = 1010; roster[2].elo = 1000; roster[3].elo = 990;
  roster.forEach((p) => { p.wins = 5; });
  const afterRoster = roster.map((p) =>
    p.id === 'low' ? { ...p, elo: 1040, wins: 6 } : p.id === 'top' ? { ...p, elo: 990, losses: 1 } : p);
  const m = mkMatch('low', 'top', 'low', T0 + 60 * DAY_MS); m.eloDelta = 40; m.bountyCollected = 9;
  const leagueEmpty = deriveLeagueInsights(roster, [], [], T0);
  const rec = buildMatchRecap({ match: m, playersBefore: roster, playersAfter: afterRoster, matchesAfter: [m],
    challenge: null, leagueBefore: leagueEmpty, leagueAfter: leagueEmpty, now: T0 + 60 * DAY_MS });
  const called = { ...settledChallenge(1000, 1030, 'challenger', [['a', 'challenger'], ['b', 'opponent']], T0),
    challengerId: 'low', opponentId: 'top' };
  called.predictions = called.predictions.map((p) => ({ ...p, predictedWinnerId: p.predictedWinnerId === 'A' ? 'low' : 'top' }));

  const quiet = earnedNotifications({ match: m, recap: rec, players: afterRoster, challenge: called, crownChangedHands: false, loggedBy: 'low' });
  const byId = new Map(quiet.map((n) => [n.recipientPlayerId, n]));
  eq('earned: the logger hears nothing', byId.has('low'), false);
  eq('earned: loser is told', byId.get('top')?.type, 'match_result');
  // top lands level with idle on 990 and the tie goes by id, so idle edges above too.
  eq('earned: loser body names the drop and who went by', byId.get('top')?.body, '−49, now #4 · low, mid and idle went by.');
  eq('earned: the player climbed over hears it as a ladder move', byId.get('mid')?.type, 'rank_change');
  eq('earned: predictors hear their verdict', [byId.get('a')?.title, byId.get('b')?.title], ['You called it', 'Wrong call']);
  eq('earned: nobody uninvolved is told', byId.has('idle'), false);
  eq('earned: one message per person', quiet.length, new Set(quiet.map((n) => n.recipientPlayerId)).size);

  const loud = earnedNotifications({ match: m, recap: rec, players: afterRoster, challenge: null, crownChangedHands: true, loggedBy: 'idle' });
  const loudById = new Map(loud.map((n) => [n.recipientPlayerId, n]));
  eq('earned: crown change reaches the uninvolved (minus the logger)', loud.map((n) => n.recipientPlayerId).sort(), ['low', 'mid', 'top']);
  eq('earned: winner hears it when someone else logged', loudById.get('low')?.title, 'Logged: you beat top');
  eq('earned: the personal reason beats the crown headline', loudById.get('top')?.type, 'match_result');
}

// --- the last two days, told forward ---
{
  const roster = ['king', 'close', 'third', 'fourth', 'far'].map(mkPlayer);
  roster[0].elo = 1100; roster[1].elo = 1090; roster[2].elo = 1060; roster[3].elo = 1057; roster[4].elo = 950;
  roster.forEach((p) => { p.wins = 8; p.losses = 4; });
  const crown = { holderId: 'king', heldSince: T0, heldDays: 3, bounty: 9, defences: 1, idleDays: 3 };
  const endsAt = T0 + 30 * 3_600_000;

  eq('finale: silent with more than 48h left', buildSeasonFinale({ players: roster, crown, endsAt: T0 + FINALE_WINDOW_MS + 1, now: T0, viewerId: 'third' }), null);
  eq('finale: silent once the season has ended', buildSeasonFinale({ players: roster, crown, endsAt: T0 - 1, now: T0, viewerId: 'third' }), null);
  eq('finale: silent with no deadline', buildSeasonFinale({ players: roster, crown, endsAt: null, now: T0, viewerId: 'third' }), null);

  const f = buildSeasonFinale({ players: roster, crown, endsAt, now: T0, viewerId: 'third' });
  eq('finale: heading inside the window', f?.heading, 'Final 48 hours');
  eq('finale: names who is one win from the crown', f?.contenderIds, ['close']);
  eq('finale: crown line', f?.lines[0].text, "close can still take king's crown with one win and the 9 point bounty.");
  eq('finale: reader line says what one win does', f?.lines[1].text?.startsWith('One win over close puts you at #2.'), true);
  eq('finale: reader line warns about the player below', f?.lines[1].text?.endsWith('Lose to fourth and they finish above you.'), true);

  const asKing = buildSeasonFinale({ players: roster, crown, endsAt, now: T0, viewerId: 'king' });
  eq('finale: holder is told who can end it', asKing?.lines[1].text, 'You hold it. Lose to close and the season is theirs.');
  eq('finale: tightest race skips the reader and the crown pair', asKing?.lines[2]?.text, '#3 is 3 points: third over fourth. One match settles it.');

  const lastDay = buildSeasonFinale({ players: roster, crown, endsAt: T0 + 5 * 3_600_000, now: T0 + 3_600_000, viewerId: null });
  eq('finale: final day heading', [lastDay?.heading, lastDay?.finalDay], ['Final day', true]);
  eq('finale: no reader line without a viewer', lastDay?.lines.some((l) => l.kind === 'you'), false);
}

// --- office chips: every match is its own pool, the jackpot rolls ---
{
  const base = Date.UTC(2026, 8, 1, 10);
  const mkMatch = (id: string, winnerId: string, loserId: string, at: number, winnerBall?: 'solids' | 'stripes') => ({
    id, timestamp: at, playerAId: winnerId, playerAName: winnerId, playerBId: loserId, playerBName: loserId,
    winnerId, loserId, playerAEloBefore: 1000, playerAEloAfter: 1016, playerBEloBefore: 1000, playerBEloAfter: 984,
    eloDelta: 16, isUpset: false, bountyCollected: 0, modifiers: { eightOnBreak: false, scratchOnEight: false }, winnerBall,
  });
  const mkChallenge = (id: string, matchId: string, winnerId: string, at: number, bets: Array<[string, string, number, ('solids' | 'stripes')?]>) => ({
    id, challengerId: 'A', challengerName: 'A', opponentId: 'B', opponentName: 'B', status: 'played' as const,
    createdAt: at, expiresAt: at + 1, respondedAt: at, startedAt: at,
    stakes: { challengerElo: 1000, opponentElo: 1000, challengerRank: 1, opponentRank: 2, challengerWinDelta: 16, opponentWinDelta: 16, challengerIsUnderdog: false, crownBounty: 0 },
    matchId, resolvedWinnerId: winnerId,
    predictions: bets.map(([who, pick, stake, ball]) => ({ id: who, predictorId: who, predictorName: who, predictedWinnerId: pick, createdAt: at, stake, ball })),
  });
  // x and y back A for 20 and 60, z backs B for 40. A wins: x gets 20 + 10, y gets 60 + 30.
  const one = deriveChips(
    [mkChallenge('c1', 'm1', 'A', base, [['x', 'A', 20], ['y', 'A', 60], ['z', 'B', 40]])],
    [mkMatch('m1', 'A', 'B', base)]
  );
  eq('chips: winners share the losing stakes by what they put in', [one.records.get('x')!.chips, one.records.get('y')!.chips], [30, 90]);
  eq('chips: a losing stake is gone', [one.records.get('z')!.chips, one.records.get('z')!.lost], [0, 40]);
  // Nobody backs the winner: the pool feeds the jackpot.
  const none = deriveChips([mkChallenge('c2', 'm2', 'B', base, [['x', 'A', 50]])], [mkMatch('m2', 'B', 'A', base)]);
  eq('chips: a pool nobody won goes to the jackpot', none.jackpot, 50);
  // Ball tips: two misses roll the jackpot on, then an exact call takes it all.
  const rolled = deriveChips(
    [
      mkChallenge('c3', 'm3', 'A', base, [['x', 'A', 10, 'stripes'], ['y', 'B', 10, 'solids']]),
      mkChallenge('c4', 'm4', 'A', base + 60_000, [['x', 'A', 10, 'solids'], ['y', 'A', 10, 'solids']]),
    ],
    [mkMatch('m3', 'A', 'B', base, 'solids'), mkMatch('m4', 'A', 'B', base + 60_000, 'solids')]
  );
  eq('chips: an exact call splits the rolled jackpot evenly', [rolled.records.get('x')!.jackpots, rolled.records.get('y')!.jackpots, rolled.jackpot], [1, 1, 0]);
  eq('chips: every tip paid into the jackpot', rolled.payouts.get('c4')!.reduce((sum, p) => sum + p.jackpot, 0), 40);
  // The daily allowance counts stakes and tips placed that day.
  const today = [mkChallenge('c5', 'm5', 'A', base, [['x', 'A', 50, 'solids']])];
  eq('chips: stake plus tip comes out of the day', spentOnDay(today, 'x', base + 3_600_000), 60);
  eq('chips: tomorrow starts clean', spentOnDay(today, 'x', base + 86_400_000), 0);
}

// --- match of the day: one draw per day, streaks and chips read off matches ---
{
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const one = drawPairing('2026-09-28', ids);
  const again = drawPairing('2026-09-28', [...ids].reverse());
  eq('daily: the same day draws the same pairs on any phone', JSON.stringify(one), JSON.stringify(again));
  const seen = [...one.pairs.flat(), one.bye].sort();
  eq('daily: everyone gets exactly one opponent or the bye', seen, ids);
  const day = (d: number) => new Date(2026, 8, d, 12).getTime();
  const match = (id: string, w: string, l: string, at: number) => ({
    id, timestamp: at, playerAId: w, playerAName: w, playerBId: l, playerBName: l, winnerId: w, loserId: l,
    playerAEloBefore: 1000, playerAEloAfter: 1016, playerBEloBefore: 1000, playerBEloAfter: 984,
    eloDelta: 16, isUpset: false, bountyCollected: 0, modifiers: { eightOnBreak: false, scratchOnEight: false },
  });
  const dailies = [
    { day: dayKeyOf(day(1)), pairs: [['a', 'b']] as Array<[string, string]>, bye: null },
    { day: dayKeyOf(day(2)), pairs: [['a', 'b']] as Array<[string, string]>, bye: null },
    { day: dayKeyOf(day(3)), pairs: [['a', 'b']] as Array<[string, string]>, bye: null },
  ];
  const records = deriveDaily(dailies, [match('m1', 'a', 'b', day(1)), match('m2', 'b', 'a', day(2))], day(4));
  eq('daily: a skipped day breaks the streak', [records.get('a')!.bestStreak, records.get('a')!.streak, records.get('a')!.skipped], [2, 0, 1]);
  eq('daily: playing pays both, winning pays more', [records.get('a')!.bonus, records.get('b')!.bonus], [150, 150]);
  const todayOpen = deriveDaily(dailies.slice(2), [], day(3));
  eq('daily: today is not a skip until the day is over', todayOpen.get('a')!.skipped, 0);
}

{
  const at = new Date(2026, 8, 28, 9).getTime(); // a Monday
  const cup = weekTournament(at);
  eq('cup: week key is the Monday', cup.week, '2026-09-28');
  eq('cup: bracket order keeps 1 and 2 apart', slotOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  eq('cup: shapes for 3, 8, 9 and 12', [3, 8, 9, 12].map((n) => bracketShape(n)), [
    { size: 2, rounds: 1, playIns: 1 }, { size: 8, rounds: 3, playIns: 0 }, { size: 8, rounds: 3, playIns: 1 }, { size: 8, rounds: 3, playIns: 4 },
  ]);
  const entrants = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) => ({ id, at: at + i }));
  const elo = { a: 1000, b: 1100, c: 950, d: 1200, e: 1000, f: 900, g: 1050, h: 980, i: 1010 };
  const field = seedField({ ...cup, entrants }, elo);
  eq('cup: seeded by Elo, ties to the earlier sign-up', field, ['d', 'b', 'g', 'i', 'a', 'e', 'h', 'c', 'f']);
  eq('cup: 2 entrants, no cup', seedField({ ...cup, entrants: entrants.slice(0, 2) }, elo), []);

  const m = (id: string, w: string, l: string, t: number) => ({
    id, timestamp: t, playerAId: w, playerAName: w, playerBId: l, playerBName: l, winnerId: w, loserId: l,
    playerAEloBefore: 1000, playerAEloAfter: 1016, playerBEloBefore: 1000, playerBEloAfter: 984,
    eloDelta: 16, isUpset: false, bountyCollected: 0, modifiers: { eightOnBreak: false, scratchOnEight: false },
  });
  const h = (n: number) => cup.closesAt + n * 3600_000;
  const t = { ...cup, entrants, field, drawnAt: cup.closesAt, claims: [] };
  let state = resolveCup(t, [], h(1))!;
  eq('cup: 9 players, seeds 8 and 9 play in', [state.playIn.length, state.playIn[0].a, state.playIn[0].b], [1, 'c', 'f']);
  eq('cup: seed 1 waits for the play-in winner', [state.rounds[0][0].a, state.rounds[0][0].b], ['d', null]);
  eq('cup: the rest meet straight away', [state.rounds[0][1].a, state.rounds[0][1].b], ['i', 'a']);

  const early = m('x', 'd', 'c', cup.closesAt - 1000);
  const games = [early, m('p', 'f', 'c', h(1)), m('q1', 'd', 'f', h(2)), m('q2', 'i', 'a', h(3)), m('q3', 'b', 'h', h(4)), m('q4', 'g', 'e', h(5)), m('s1', 'd', 'i', h(6)), m('s2', 'b', 'g', h(7)), m('f', 'b', 'd', h(8))];
  state = resolveCup(t, games, h(9))!;
  eq('cup: a match before the draw does not count', state.playIn[0].matchId, 'p');
  eq('cup: the play-in winner takes the seat', state.rounds[0][0].b, 'f');
  eq('cup: champion and runner-up', [state.champion, state.runnerUp], ['b', 'd']);
  eq('cup: nobody who skipped the play-in plays more than 3', Math.max(...field.slice(0, 7).map((id) => gamesOf(state, id).length)), 3);
  const records = deriveCups([t], games, h(9));
  eq('cup: champion takes the title and chips', [records.get('b')!.titles, records.get('b')!.bonus, records.get('d')!.bonus], [1, 300, 100]);

  // Nothing played: walkover for the only ready player, otherwise the higher seed.
  const deadlinePassed = gameDeadline(t, 'p8') + 1;
  const quiet = resolveCup({ ...t, claims: [{ game: 'p8', id: 'f', at: h(1) }] }, [], deadlinePassed)!;
  eq('walkover: the only ready player goes through', [quiet.playIn[0].winnerId, quiet.playIn[0].walkover], ['f', true]);
  const nobody = resolveCup(t, [], deadlinePassed)!;
  eq('walkover: nobody ready, the higher seed goes through', [nobody.playIn[0].winnerId, nobody.playIn[0].auto], ['c', true]);
  eq('walkover: nothing is decided before the deadline', resolveCup(t, [], h(1))!.playIn[0].winnerId, null);
  eq('walkover: not a cup win', deriveCups([{ ...t, claims: [{ game: 'p8', id: 'f', at: h(1) }] }], [], deadlinePassed).get('f')!.matchWins, 0);
  eq('cup: the final is on Friday 17:00', new Date(gameDeadline(t, 'r2-0')).toString(), new Date(t.deadline).toString());
}

{
  const monday = new Date(2026, 8, 21);
  eq('awards: out Friday 16:00', new Date(releaseOf(monday)).toString(), new Date(2026, 8, 25, 16).toString());
  eq('awards: Friday 15:59 still shows last week', latestReleasedMonday(new Date(2026, 8, 25, 15, 59).getTime()).getDate(), 14);
  eq('awards: Friday 16:00 shows this week', latestReleasedMonday(new Date(2026, 8, 25, 16).getTime()).getDate(), 21);
  const m = (id: string, w: string, l: string, t: number, wd: number, scratch = false) => ({
    id, timestamp: t, playerAId: w, playerAName: w, playerBId: l, playerBName: l, winnerId: w, loserId: l,
    playerAEloBefore: 1000, playerAEloAfter: 1000 + wd, playerBEloBefore: 1000, playerBEloAfter: 1000 - wd,
    eloDelta: wd, isUpset: false, bountyCollected: 0, modifiers: { eightOnBreak: false, scratchOnEight: scratch },
  });
  const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime();
  const ps = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), elo: 1000 })) as any[];
  const games = [m('1', 'a', 'b', at(21, 9), 16), m('2', 'a', 'b', at(22, 10), 16), m('3', 'a', 'b', at(23, 18), 16, true), m('4', 'b', 'a', at(25, 17), 16)];
  const week = weekAwards(monday, ps, [...games, m('0', 'c', 'a', at(10, 12), 16)], [], deriveChips([], []));
  const who = (key: string) => week.awards.find((award) => award.key === key)?.playerId;
  eq('awards: after Friday 16:00 does not count', week.matches, 3);
  eq('awards: MVP, generous, landlord, butterfingers', [who('mvp'), who('clown'), who('bully'), who('butter')], ['a', 'b', 'a', 'b']);
  eq('awards: a regular who skipped the week is the ghost', who('ghost'), 'c');
}

{
  const today = weekTournament(new Date(2026, 8, 28, 9).getTime());
  eq('cup override: this week closes 16:00', new Date(today.closesAt).getHours(), 16);
  eq('cup override: next week back to noon', new Date(weekTournament(new Date(2026, 9, 5, 9).getTime()).closesAt).getHours(), 12);
  const drawnAtNoon = withCloseOverride({ ...today, field: [], drawnAt: new Date(2026, 8, 28, 12, 5).getTime() });
  eq('cup override: an early draw is undone', [drawnAtNoon.field, drawnAtNoon.drawnAt], [null, null]);
}

{
  const before = 1790597742000 - 1000;
  const call = (id: string, pick: string, extra: Record<string, unknown> = {}) => ({ id, predictorId: id, predictorName: id, predictedWinnerId: pick, createdAt: before, ...extra });
  const legacy = [{
    id: 'old', status: 'played', resolvedWinnerId: 'x', matchId: null, createdAt: before,
    predictions: [call('p', 'x'), call('q', 'y', { isLock: true }), call('r', 'y')],
  }] as any;
  const rec = deriveChips(legacy, []).records;
  eq('legacy calls: 25 a call, 50 a lock, settled as a pool', [rec.get('p')!.chips, rec.get('q')!.chips, rec.get('r')!.chips], [100, 0, 0]);
}

{
  const at = (h: number) => new Date(2026, 8, 21, h).getTime();
  const m = (id: string, w: string, l: string, t: number) => ({
    id, timestamp: t, playerAId: w, playerAName: w, playerBId: l, playerBName: l, winnerId: w, loserId: l,
    playerAEloBefore: 1000, playerAEloAfter: 1010, playerBEloBefore: 1000, playerBEloAfter: 990,
    eloDelta: 10, isUpset: false, bountyCollected: 0, modifiers: { eightOnBreak: false, scratchOnEight: false },
  });
  const games = [m('1', 'b', 'a', at(9)), m('2', 'b', 'a', at(10)), m('3', 'b', 'a', at(11)), m('4', 'a', 'b', at(12))];
  const call = (who: string, pick: string, t: number) => ({ id: who, predictorId: who, predictorName: who, predictedWinnerId: pick, createdAt: t, stake: 10 });
  const challenges = [{
    id: 'c', status: 'played', challengerId: 'a', opponentId: 'b', resolvedWinnerId: 'b', matchId: '3', createdAt: at(10),
    predictions: [call('x', 'a', at(10)), call('y', 'a', at(10) + 1), call('z', 'a', at(10) + 2)],
  }] as any;
  const player = { id: 'a', name: 'A', elo: 1000, wins: 1, losses: 3, currentStreak: 1, recentForm: [] } as any;
  const ctx = buildBadgeContext(player, games as any, challenges, 1000, undefined, undefined, undefined, [
    { week: 'w1', key: 'mvp' }, { week: 'w1', key: 'clown' }, { week: 'w1', key: 'ghost' },
  ]);
  const got = earnedBadges(ctx);
  eq('badges: shame trip, redemption, jinx', [ctx.shame.times, ctx.shame.redemptions, got.has('clowncar'), got.has('redemption'), got.has('jinx')], [1, 1, true, true, true]);
  eq('badges: weekly awards feed badges', [got.has('potw'), got.has('bigclown'), got.has('onstage'), got.has('sweep')], [true, true, true, true]);
  eq('achievements: award shelf counts awards', achievementProgress(ctx).find((row) => row.a.id === 'awards')!.v, 3);
}


{
  eq('cards: odds add up to 1', Math.round(RARITIES.reduce((sum, r) => sum + ODDS[r], 0) * 1e6) / 1e6, 1);
  const random = seeded('odds');
  const tally: Record<string, number> = {};
  for (let i = 0; i < 200000; i++) { const r = rollRarity(random); tally[r] = (tally[r] ?? 0) + 1; }
  eq('cards: commons land near 62%', Math.abs(tally.common / 200000 - 0.62) < 0.01, true);
  eq('cards: legendaries stay rare', Math.abs((tally.legendary ?? 0) / 200000 - 0.0045) < 0.001, true);
  const ids = ['a', 'b', 'c', 'd'];
  const pack = rollPack({ packId: 'p1', kind: 'weekly', playerIds: ids, pity: 0, takenMythics: new Set() });
  eq('cards: a pack is 3 cards, fixed by its id', [pack.length, JSON.stringify(pack) === JSON.stringify(rollPack({ packId: 'p1', kind: 'weekly', playerIds: [...ids].reverse(), pity: 0, takenMythics: new Set() }))], [CARDS_PER_PACK, true]);
  let allCommonPacks = 0;
  for (let i = 0; i < 2000; i++) if (rollPack({ packId: `x${i}`, kind: 'weekly', playerIds: ids, pity: 0, takenMythics: new Set() }).every((c) => c.rarity === 'common')) allCommonPacks++;
  eq('cards: never three commons', allCommonPacks, 0);
  eq('cards: pity makes a legendary', rollPack({ packId: 'p2', kind: 'weekly', playerIds: ids, pity: 29, takenMythics: new Set() }).some((c) => c.rarity === 'legendary' || c.rarity === 'mythic'), true);
  const champ = rollPack({ packId: 'p3', kind: 'champion', playerIds: ids, pity: 0, takenMythics: new Set() });
  eq('cards: champion pack has an epic or better', champ.some((c) => ['epic', 'legendary', 'mythic'].includes(c.rarity)), true);
  let mythicTaken = true;
  for (let i = 0; i < 40000; i++) if (rollPack({ packId: `m${i}`, kind: 'weekly', playerIds: ['a'], pity: 0, takenMythics: new Set(['a']) }).some((c) => c.rarity === 'mythic')) mythicTaken = false;
  eq('cards: a taken mythic is never pulled again', mythicTaken, true);

  const monday = new Date(2026, 8, 28, 9).getTime();
  const w = (id: string, t: number) => ({ id, timestamp: t, winnerId: 'a', loserId: 'b', playerAId: 'a', playerBId: 'b' }) as any;
  const five = [1, 2, 3, 4, 5].map((i) => w(`w${i}`, monday + i * 3600_000));
  eq('cards: 5 wins earn the pack', earnedPackReason({ playerId: 'a', matches: five, now: monday + 10 * 3600_000, newTierThisWeek: false, dailyDaysPlayed: [] })?.reason, '5 wins this week');
  eq('cards: 4 wins do not', earnedPackReason({ playerId: 'a', matches: five.slice(1), now: monday + 10 * 3600_000, newTierThisWeek: false, dailyDaysPlayed: [] }), null);
  eq('cards: 3 daily days running earn it', earnedPackReason({ playerId: 'a', matches: [], now: monday + 3 * 86_400_000, newTierThisWeek: false, dailyDaysPlayed: ['2026-09-28', '2026-09-29', '2026-09-30'] })?.reason, 'Match of the day, 3 days running');
  const specials = specialAwards({ playerId: 'a', matches: [{ ...w('b1', monday), modifiers: { eightOnBreak: true, scratchOnEight: false } }], crownHolderId: 'a', crownSince: monday, cupTitles: [{ week: '2026-09-28' }], weeklyAwards: [] });
  eq('cards: crown, cup and moment specials', specials.map((x) => x.type).sort(), ['crown', 'cup', 'moment']);
}

{
  eq('rewards: tiers pay better packs', ['t:wins:1', 't:wins:3', 't:wins:4', 't:wins:5'].map((k) => rewardFor(k).label), ['Card pack', 'Rare pack', 'Epic pack', 'Legendary pack']);
  eq('rewards: secret badges pay a rare pack', [rewardFor('first').label, rewardFor('broke', true).label], ['Card pack', 'Rare pack']);
  eq('rewards: special achievements give a themed card', [rewardFor('t:upsets:3').kind, rewardFor('jackpot1').label], ['card', 'Jackpot card']);
  const legendaryPack = rollPack({ packId: 'r1', kind: 'reward', playerIds: ['a', 'b'], pity: 0, takenMythics: new Set(), minRarity: 'legendary' });
  eq('rewards: a legendary pack holds a legendary', legendaryPack.some((c) => c.rarity === 'legendary' || c.rarity === 'mythic'), true);
}

// --- offline outbox: logging while the database is out ---
{
  const roster = [
    { id: 'p1', name: 'Ármin Kovács' },
    { id: 'p2', name: 'Sarah Jenkins' },
    { id: 'p3', name: 'Dave Bell' },
    { id: 'p4', name: 'Dávid Nagy' },
  ];
  eq('outbox: full name without accents resolves', resolveName('armin kovacs', roster), 'p1');
  eq('outbox: a unique first name resolves', resolveName('Sarah', roster), 'p2');
  eq('outbox: case and spacing do not matter', resolveName('  SARAH ', roster), 'p2');
  eq('outbox: an ambiguous start stays unresolved', resolveName('Da', roster), null);
  eq('outbox: a start two players share stays unresolved', resolveName('Dav', roster), null);
  eq('outbox: a start only one player has resolves', resolveName('Sar', roster), 'p2');
  eq('outbox: "dave" is Dave, not Dávid', resolveName('dave', roster), 'p3');
  eq('outbox: nobody by that name', resolveName('Zoltan', roster), null);

  let box = queueMatch([], { winnerId: null, loserId: null, winnerName: 'Sarah', loserName: 'dave', loggedById: null, playedAt: T0 + 2_000 });
  box = queueMatch(box, { winnerId: 'p1', loserId: 'p2', winnerName: 'Ármin Kovács', loserName: 'Sarah Jenkins', loggedById: 'p1', playedAt: T0 + 1_000 });
  box = queueMatch(box, { winnerId: null, loserId: null, winnerName: 'Zoltan', loserName: 'Sarah', loggedById: null, playedAt: T0 + 3_000 });
  box = queueMatch(box, { winnerId: null, loserId: null, winnerName: 'Dave', loserName: 'Dávid', loggedById: null, playedAt: T0 + 4_000 });
  eq('outbox: every entry gets its own id', new Set(box.map((entry) => entry.id)).size, 4);

  // Dave beat Dávid was already logged on another phone a minute later.
  const elsewhere = [{ id: 'm-other', winnerId: 'p3', loserId: 'p4', timestamp: T0 + 64_000 }];
  const plan = planSync(box, roster, elsewhere);
  eq('outbox: ready in the order played', plan.ready.map((entry) => [entry.winnerId, entry.loserId]), [['p1', 'p2'], ['p2', 'p3']]);
  eq('outbox: an unknown name waits', plan.unresolved.map((entry) => entry.winnerName), ['Zoltan']);
  eq('outbox: the same result from another phone is a duplicate', plan.duplicates.map((entry) => entry.winnerName), ['Dave']);

  // A sync that landed but was not cleared from the phone is not written again.
  const landed = [{ id: offlineMatchDocId(plan.ready[0]), winnerId: 'p1', loserId: 'p2', timestamp: T0 + 1_000 }];
  eq('outbox: a retried sync skips what already landed', planSync(box, roster, landed).duplicates.map((entry) => entry.id).includes(plan.ready[0].id), true);
  // Two real games between the same pair, far enough apart, are two games.
  const twice = queueMatch(queueMatch([], { winnerId: 'p1', loserId: 'p2', winnerName: 'a', loserName: 'b', loggedById: null, playedAt: T0 }),
    { winnerId: 'p1', loserId: 'p2', winnerName: 'a', loserName: 'b', loggedById: null, playedAt: T0 + 15 * 60_000 });
  eq('outbox: a rematch later is not a duplicate', planSync(twice, roster, []).ready.length, 2);
  eq('outbox: a player cannot beat themselves', planSync(queueMatch([], { winnerId: null, loserId: null, winnerName: 'Sarah', loserName: 'sarah jenkins', loggedById: null }), roster, []).unresolved.length, 1);

  eq('outbox: quota error means the database is down', isDatabaseDown({ code: 'resource-exhausted', message: 'Quota exceeded.' }), true);
  eq('outbox: a timeout means the database is down', isDatabaseDown(new Error('Timed out reaching the league database.')), true);
  eq('outbox: a real bug is not mistaken for an outage', isDatabaseDown(new Error('Players not found')), false);

}

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
