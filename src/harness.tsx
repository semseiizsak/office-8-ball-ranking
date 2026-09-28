import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Challenge, MatchRecord, Player } from './types';
import { deriveLeagueInsights, runLeagueReplay, DAY_MS } from './utils/league';
import { LeaderboardView } from './components/LeaderboardView';
import { MatchSuccessModal } from './components/MatchSuccessModal';
import { buildMatchRecap } from './utils/recap';
import { ActivitySheet, ActivityToast } from './components/ActivitySheet';
import { LeagueNotification } from './services/notifications';
import { ArenaView } from './components/ArenaView';
import { CupView } from './components/CupView';
import { WeeklyAwardsScene } from './components/WeeklyAwardsScene';
import { weekAwards } from './utils/awards';
import { CupGame, Tournament, allGames, bracketShape, deriveCups, resolveCup, weekTournament } from './utils/tournament';
import { PlayerDossierModal } from './components/PlayerDossierModal';
import { ChallengeModal } from './components/ChallengeModal';
import { Navigation } from './components/Navigation';
import { EventsView } from './components/EventsView';
import { MatchLoggerSheet } from './components/MatchLoggerSheet';
import { IncomingChallengeModal } from './components/IncomingChallengeModal';
import { DuelAcceptedOverlay } from './components/DuelAcceptedOverlay';
import { CalloutSentOverlay } from './components/CalloutSentOverlay';
import { ChallengeAcceptedOverlay } from './components/ChallengeAcceptedOverlay';
import { Header } from './components/Header';
import { FightPoster } from './components/FightPoster';
import { Season } from './types';

const NAMES = ['Ármin Kovács', 'Sarah Jenkins', 'Dave Bell', 'Priya Nair', 'Tom Oakes'];
const now = Date.now();

const basePlayers: Player[] = NAMES.map((name, index) => ({
  id: `p${index}`,
  name,
  department: ['Design', 'Product', 'Sales', 'Engineering', 'Ops'][index],
  title: 'Pool Contender',
  avatarUrl: '',
  ballPreference: 'solids',
  elo: 1000,
  peakElo: 1000,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  bestWinStreak: 0,
  breakAndRuns: 0,
  recentForm: [],
  lastPlayedAt: null,
  createdAt: new Date(now - 90 * DAY_MS).toISOString(),
}));

// A plausible season: Sarah builds a lead and sits on it, Dave keeps grinding.
const script: Array<[number, number, number, number]> = [
  [0, 1, 1, 40], [2, 3, 2, 39], [1, 2, 1, 38], [0, 3, 0, 35], [1, 3, 1, 33],
  [2, 4, 2, 30], [0, 2, 2, 28], [1, 4, 1, 25], [2, 3, 2, 22], [0, 1, 1, 20],
  [2, 0, 2, 16], [1, 2, 1, 12], [2, 4, 2, 9], [0, 2, 0, 6], [2, 3, 2, 2],
];
const matches: MatchRecord[] = script.map(([a, b, winner, daysAgo], index) => ({
  id: `m${index}`,
  timestamp: now - daysAgo * DAY_MS,
  playerAId: `p${a}`, playerAName: NAMES[a],
  playerBId: `p${b}`, playerBName: NAMES[b],
  winnerId: `p${winner}`, loserId: `p${winner === a ? b : a}`,
  playerAEloBefore: 0, playerAEloAfter: 0, playerBEloBefore: 0, playerBEloAfter: 0,
  eloDelta: 0, isUpset: false, bountyCollected: 0,
  modifiers: { eightOnBreak: false, scratchOnEight: false },
}));

const replay = runLeagueReplay(basePlayers.map((p) => p.id), matches);
// Use the replayed snapshots so displayed Elo swings are the real ones.
const seasonMatches = replay.matches;
const playersBase = basePlayers.map((player) => {
  const member = replay.members.get(player.id)!;
  return { ...player, elo: member.elo, peakElo: member.peakElo, wins: member.wins,
    losses: member.losses, currentStreak: member.currentStreak,
    bestWinStreak: member.bestWinStreak, recentForm: member.recentForm,
    lastPlayedAt: member.lastPlayedAt };
});
const players = playersBase;

// ---------- Cup fixtures: a bigger field than the league above, one per phase. ----------
const CUP_EXTRA = ['Anna Kiss', 'Ben Ortiz', 'Chloe Wu', 'Dan Novak', 'Eszter Tóth', 'Felix Grant', 'Gina Rossi', 'Anna Varga', 'Hugo Lind', 'Ivy Chen', 'Jonas Berg'];
const cupPlayers: Player[] = [
  ...players,
  ...CUP_EXTRA.map((name, index) => ({
    ...basePlayers[0], id: `c${index}`, name, elo: 960 + index * 17, ball: ((index * 4) % 15) + 1,
  })),
];
const HOUR = 3_600_000;
type CupDemo = 'open' | 'before' | 'drawing' | 'off' | 'weekend' | 'nine' | 'four' | 'sixteen' | 'final' | 'champion' | `n${number}`;
const CUP_DEMOS: CupDemo[] = ['open', 'before', 'drawing', 'off', 'weekend', 'nine', 'four', 'sixteen', 'final', 'champion'];
const CUP_SIZES = Array.from({ length: 14 }, (_, index) => index + 3);

/** Everyone who could enter, best Elo first. Dave (p2, "me") is seed 3; two Annas share a first name. */
const SEED_POOL = ['p1', 'p0', 'p2', 'p3', 'c0', 'p4', 'c1', 'c7', 'c2', 'c3', 'c4', 'c5', 'c6', 'c8', 'c9', 'c10'];
type Outcome = 'a' | 'b' | 'wo-a' | 'wo-b' | 'auto' | null;

/**
 * A knockout for the week starting `monday`, walked forward game by game:
 * `decide` says how each game went once both players are known. Walkovers
 * and seed advances only land once the game's deadline is before `at`.
 */
const buildCup = (key: string, monday: number, field: string[], at: number, decide: (game: CupGame) => Outcome, claims: Tournament['claims'] = []) => {
  const base = weekTournament(monday + 9 * HOUR);
  const cup: Tournament = { ...base, week: key, entrants: field.map((id, i) => ({ id, at: base.opensAt + i * 60_000 })), field, drawnAt: base.closesAt, claims: [...claims] };
  const played: MatchRecord[] = [];
  const handled = new Set<string>();
  for (let pass = 0; pass < 8; pass++) {
    const state = resolveCup(cup, played, at);
    if (!state) break;
    let changed = false;
    allGames(state).forEach((game, index) => {
      // Keyed by who is in it: an earlier pass may have seen provisional players.
      const seat = `${game.key}:${game.a}:${game.b}`;
      if (handled.has(seat) || !game.a || !game.b || game.matchId) return;
      handled.add(seat);
      const outcome = decide(game);
      if (outcome === 'a' || outcome === 'b') {
        const winner = outcome === 'a' ? game.a : game.b;
        const timestamp = Math.min(game.deadline - 3 * HOUR, at - 20 * 60_000) - index * 60_000;
        played.push({ ...matches[0], id: `${key}-${game.key}`, timestamp, playerAId: game.a, playerAName: game.a, playerBId: game.b, playerBName: game.b,
          winnerId: winner, loserId: winner === game.a ? game.b : game.a });
        changed = true;
      } else if (outcome === 'wo-a' || outcome === 'wo-b') {
        cup.claims.push({ game: game.key, id: outcome === 'wo-a' ? game.a : game.b, at: game.deadline - 5 * HOUR });
        changed = true;
      } else if (outcome === 'auto') changed = true;
    });
    if (!changed) break;
  }
  return { cup, played };
};
const outcomes = (map: Record<string, Outcome>) => (game: CupGame) => map[game.key] ?? null;

const cupMonday = (() => {
  // A week whose Thursday is still ahead, so the countdowns have something to count.
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.getTime() + (now > monday.getTime() + 3 * DAY_MS + 11 * HOUR ? 7 * DAY_MS : 0);
})();
const day = (d: number, h: number) => cupMonday + d * DAY_MS + h * HOUR;

// Nine players: Chloe takes the play-in on a walkover, Priya goes through as the higher seed, Dave and Ben still to play.
const NINE: Record<string, Outcome> = { p8: 'wo-b', 'r0-0': 'a', 'r0-1': 'auto', 'r0-2': 'b', 'r0-3': 'a', 'r1-0': 'a' };
const SIXTEEN: Record<string, Outcome> = {
  'r0-0': 'a', 'r0-1': 'wo-b', 'r0-2': 'b', 'r0-3': 'auto', 'r0-4': 'a', 'r0-5': 'b', 'r0-6': 'a', 'r0-7': 'a', 'r1-0': 'a', 'r1-2': 'b',
};

/** Any field size mid-week: the first stage done (an upset every third game), the one after it half played. */
const sizedCup = (n: number) => {
  const field = SEED_POOL.slice(0, n);
  const probe = resolveCup(buildCup('probe', cupMonday, field, day(0, 13), () => null).cup, [], day(0, 13))!;
  const stages = [...(probe.playIn.length ? [probe.playIn] : []), ...probe.rounds];
  const at = (stages[1] ?? stages[0])[0].deadline - 6 * HOUR;
  let count = 0;
  const cup = buildCup(`harness-n${n}`, cupMonday, field, at, (game) => {
    count++;
    if (game.deadline < at) return count % 3 === 0 ? 'b' : 'a';
    if (game.a === 'p2' || game.b === 'p2') return null;
    return count % 2 === 0 ? 'a' : null;
  });
  return { ...cup, at };
};

const fixture = ({ cup, played }: { cup: Tournament; played: MatchRecord[] }, at: number) => ({ current: cup, played, at });

/** The cup for a demo, the matches it reads and the moment it is shown at. */
const cupFixture = (demo: CupDemo, joined: boolean): { current: Tournament | null; played: MatchRecord[]; at: number } => {
  const signup: Tournament = {
    week: `harness-${demo}`, opensAt: now - 2 * HOUR, closesAt: now + 2 * HOUR + 40 * 60_000,
    deadline: now + 4 * DAY_MS, entrants: [], field: null, drawnAt: null, claims: [],
  };
  const entrants = ['p0', 'c0', 'p1', 'c1', 'p3', 'c2', 'c7'].map((id, i) => ({ id, at: now - (10 - i) * 600_000 }));
  const withMe = joined ? [...entrants, { id: 'p2', at: now - 60_000 }] : entrants;
  const nine = SEED_POOL.slice(0, 9);
  if (demo.startsWith('n') && demo !== 'nine') {
    const { cup, played, at } = sizedCup(Number(demo.slice(1)));
    return { current: cup, played, at };
  }
  switch (demo) {
    case 'weekend': return { current: null, played: [], at: now };
    case 'before': return { current: { ...signup, opensAt: now + 5 * HOUR + 12 * 60_000, closesAt: now + 9 * HOUR }, played: [], at: now };
    case 'off': return { current: { ...signup, closesAt: now - HOUR, entrants: entrants.slice(0, 2), field: [], drawnAt: now - HOUR }, played: [], at: now };
    case 'drawing': return { current: { ...signup, closesAt: now - 60_000, entrants: withMe }, played: [], at: now };
    case 'open': return { current: { ...signup, entrants: withMe }, played: [], at: now };
    case 'nine': {
      const at = day(3, 11);
      return fixture(buildCup('harness-nine', cupMonday, nine, at, outcomes(NINE), [{ game: 'r1-1', id: 'c1', at: day(3, 9) }]), at);
    }
    case 'four': {
      const at = day(2, 12);
      return fixture(buildCup('harness-four', cupMonday, ['p1', 'p2', 'p0', 'p3'], at, outcomes({ 'r0-0': 'b' })), at);
    }
    case 'sixteen': {
      const at = day(2, 13);
      return fixture(buildCup('harness-sixteen', cupMonday, SEED_POOL, at, outcomes(SIXTEEN)), at);
    }
    case 'final': {
      const at = day(4, 10);
      return fixture(buildCup('harness-final', cupMonday, nine, at, outcomes({ ...NINE, 'r1-1': 'b' })), at);
    }
    case 'champion': {
      const at = day(4, 16);
      return fixture(buildCup('harness-champion', cupMonday, nine, at, outcomes({ ...NINE, 'r1-1': 'b', 'r2-0': 'a' })), at);
    }
    default: return { current: null, played: [], at: now };
  }
};
// Two finished cups for the cabinet, the reigning champion and the past list.
const pastCups = [
  buildCup('2026-harness-past-1', cupMonday - 7 * DAY_MS, ['p1', 'p0', 'c0', 'p3', 'c3'], cupMonday - 2 * DAY_MS, (game) => (game.key === 'r0-1' ? 'b' : 'a')),
  buildCup('2026-harness-past-2', cupMonday - 14 * DAY_MS, ['p0', 'p2', 'c1', 'p1', 'c3', 'p4', 'c0', 'p3'], cupMonday - 9 * DAY_MS, (game) => (game.key === 'r1-0' ? 'b' : 'a')),
];
const harnessCup = pastCups[1].cup;

const challenges: Challenge[] = [
  {
    id: 'c1', challengerId: 'p2', challengerName: NAMES[2],
    opponentId: 'p1', opponentName: NAMES[1], status: 'pending',
    createdAt: now - 3600_000, expiresAt: now + 5 * 3600_000, respondedAt: null, startedAt: null,
    stakes: { challengerElo: players[2].elo, opponentElo: players[1].elo, challengerRank: 3,
      opponentRank: 1, challengerWinDelta: 41, opponentWinDelta: 9,
      challengerIsUnderdog: true, crownBounty: 24 },
    matchId: null, resolvedWinnerId: null,
    predictions: [
      { id: 'p0', predictorId: 'p0', predictorName: NAMES[0], predictedWinnerId: 'p1', createdAt: now },
      { id: 'p3', predictorId: 'p3', predictorName: NAMES[3], predictedWinnerId: 'p2', createdAt: now },
      { id: 'p4', predictorId: 'p4', predictorName: NAMES[4], predictedWinnerId: 'p1', createdAt: now },
    ],
  },
  {
    id: 'c2', challengerId: 'p0', challengerName: NAMES[0],
    opponentId: 'p2', opponentName: NAMES[2], status: 'accepted',
    createdAt: now - 7200_000, expiresAt: now + 3600_000, respondedAt: now - 3000_000, startedAt: null,
    stakes: { challengerElo: players[0].elo, opponentElo: players[3].elo, challengerRank: 2,
      opponentRank: 4, challengerWinDelta: 11, opponentWinDelta: 21,
      challengerIsUnderdog: false, crownBounty: 0 },
    matchId: null, resolvedWinnerId: null,
    predictions: [
      { id: 'pr1', predictorId: 'p1', predictorName: NAMES[1], predictedWinnerId: 'p0', createdAt: now - 1800_000 },
      { id: 'pr4', predictorId: 'p4', predictorName: NAMES[4], predictedWinnerId: 'p3', createdAt: now - 600_000 },
    ],
  },
];

const pastSeason: Season = {
  id: 's1', number: 1, name: 'Season 1',
  startedAt: now - 180 * DAY_MS, endedAt: now - 60 * DAY_MS, endsAt: null,
  startingElo: {},
  standings: [
    { playerId: 'p1', name: NAMES[1], rank: 1, elo: 1212, wins: 24, losses: 6 },
    { playerId: 'p0', name: NAMES[0], rank: 2, elo: 1104, wins: 19, losses: 11 },
    { playerId: 'p2', name: NAMES[2], rank: 3, elo: 1041, wins: 16, losses: 14 },
  ],
  titles: [
    { key: 'giant-killer', label: 'Giant Killer', emoji: '\u{1F5E1}\uFE0F', holderId: 'p2', holderName: NAMES[2], valueLabel: '7 upset wins' },
    { key: 'iron-man', label: 'Iron Man', emoji: '\u2699\uFE0F', holderId: 'p3', holderName: NAMES[3], valueLabel: '9 matches this week' },
  ],
};
const currentSeason: Season = {
  id: 's2', number: 2, name: 'Season 2',
  startedAt: now - 60 * DAY_MS, endedAt: null, endsAt: now + DAY_MS + 5 * 3600_000 + 12 * 60_000,
  startingElo: {}, standings: [], titles: [],
};

// Stands in for what deriveNerve would rebuild from settled challenges.
const nerveFixture = new Map([
  ['p2', { nerve: 1088, correct: 3, total: 8, streak: 4, bestStreak: 6 }],
  ['p1', { nerve: 1042, correct: 7, total: 9, streak: 2, bestStreak: 3 }],
  ['p4', { nerve: 1011, correct: 1, total: 4, streak: 1, bestStreak: 1 }],
  ['p3', { nerve: 964, correct: 5, total: 6, streak: 0, bestStreak: 2 }],
]);

const liveChallenge: Challenge = {
  id: 'c3', challengerId: 'p0', challengerName: NAMES[0],
  opponentId: 'p4', opponentName: NAMES[4], status: 'live',
  createdAt: now - 9000_000, expiresAt: now + 3600_000,
  respondedAt: now - 8000_000, startedAt: now - 254_000,
  stakes: { challengerElo: 1004, opponentElo: 958, challengerRank: 3, opponentRank: 4,
    challengerWinDelta: 14, opponentWinDelta: 18, challengerIsUnderdog: false, crownBounty: 0 },
  matchId: null, resolvedWinnerId: null,
  predictions: [
    { id: 'p1', predictorId: 'p1', predictorName: NAMES[1], predictedWinnerId: 'p0', createdAt: now },
    { id: 'p2', predictorId: 'p2', predictorName: NAMES[2], predictedWinnerId: 'p4', createdAt: now },
    { id: 'p3', predictorId: 'p3', predictorName: NAMES[3], predictedWinnerId: 'p0', createdAt: now },
  ],
};

/** A callout between two other people, so the call buttons can be exercised. */
const callableChallenge: Challenge = {
  id: 'c4', challengerId: 'p0', challengerName: NAMES[0],
  opponentId: 'p3', opponentName: NAMES[3], status: 'pending',
  createdAt: now - 600_000, expiresAt: now + 7 * 3600_000,
  respondedAt: null, startedAt: null,
  stakes: { challengerElo: 1004, opponentElo: 1030, challengerRank: 3, opponentRank: 2,
    challengerWinDelta: 18, opponentWinDelta: 14, challengerIsUnderdog: true, crownBounty: 0 },
  matchId: null, resolvedWinnerId: null, predictions: [],
};

const inboxFixture: LeagueNotification[] = [
  { id: 'n1', type: 'match_result', title: 'Sarah beat you', body: '−22, now #3 · Dave went by.', createdAt: now - 4 * 60_000, read: false },
  { id: 'n2', type: 'rank_change', title: 'Dave went past you', body: "Beat Sarah and climbed to #1. You're #2 now.", createdAt: now - 50 * 60_000, read: false },
  { id: 'n3', type: 'prediction_result', title: 'You called it', body: 'Dave beat Sarah. Your lock paid double.', createdAt: now - 3 * 3600_000, read: false },
  { id: 'n4', type: 'crown_taken', title: 'New #1: Dave', body: 'Took the crown off Sarah with an 18 point bounty.', createdAt: now - 26 * 3600_000, read: true },
  { id: 'n5', type: 'challenge_answered', title: 'Priya accepted', body: 'Your callout is on. Get to the table.', createdAt: now - 3 * 86400_000, read: true, challengeId: 'c2' },
];

const Harness: React.FC = () => {
  const [tab, setTab] = useState<'leaderboard' | 'arena' | 'cup' | 'events' | 'log'>('leaderboard');
  const [cupDemo, setCupDemo] = useState<CupDemo>(() => (new URLSearchParams(location.search).get('cup') as CupDemo | null) ?? 'nine');
  const [cupJoined, setCupJoined] = useState(false);
  // Claims made with the walkover button, on top of the demo's own.
  const [cupClaims, setCupClaims] = useState<Tournament['claims']>([]);
  const [cupRun, setCupRun] = useState(0);
  // Mirrors the app's submission lock so the double-tap guard is exercised.
  const [logged, setLogged] = useState<string[]>([]);
  const [isLogging, setIsLogging] = useState(false);
  const loggingRef = React.useRef(false);
  const [showIncoming, setShowIncoming] = useState(false);
  const [showDuel, setShowDuel] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [showPoster, setShowPoster] = useState(false);
  const [showAwards, setShowAwards] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [aId, setAId] = useState<string | undefined>('p2');
  const [bId, setBId] = useState<string | undefined>('p1');

  const record = async (playerAId: string, playerBId: string, winnerId: string) => {
    if (loggingRef.current) return;
    loggingRef.current = true;
    setIsLogging(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setLogged((prev) => [...prev, `${playerAId}|${playerBId}|${winnerId}`]);
    } finally {
      loggingRef.current = false;
      setIsLogging(false);
    }
  };
  const [dossier, setDossier] = useState<Player | null>(null);
  const [challenging, setChallenging] = useState(false);
  const [challengesList, setChallengesList] = useState<Challenge[]>([callableChallenge, ...challenges]);
  const league = deriveLeagueInsights(players, seasonMatches, challengesList, now);
  const me = players[2];

  const handlePredict = async (challenge: Challenge, predictedWinnerId: string, stake: number, ball?: 'solids' | 'stripes') => {
    setChallengesList((prev) =>
      prev.map((c) => {
        if (c.id !== challenge.id) return c;
        if (c.predictions.some((p) => p.predictorId === me.id)) return c;
        return {
          ...c,
          predictions: [
            ...c.predictions,
            {
              id: `pred-${me.id}`,
              predictorId: me.id,
              predictorName: me.name,
              predictedWinnerId,
              stake,
              ball,
              createdAt: Date.now(),
            },
          ],
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#0A0A0A] flex flex-col">
        <Header activeTab={tab === 'arena' || tab === 'log' ? 'arena' : tab === 'events' ? 'history' : tab === 'cup' ? 'cup' : 'leaderboard'}
          currentUser={me} matchesCount={seasonMatches.length}
          onOpenProfile={() => {}} onQuickMatch={() => {}} activityBadge={3} onOpenActivity={() => setShowActivity(true)} />
        <div className="flex flex-wrap gap-2 p-2">
          <button id="demo-incoming" onClick={() => setShowIncoming(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">incoming</button>
          <button id="demo-duel" onClick={() => setShowDuel(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">duel</button>
          <button id="demo-sent" onClick={() => setShowSent(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">sent</button>
          <button id="demo-recap" onClick={() => setShowRecap(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">recap</button>
          <button id="demo-activity" onClick={() => setShowActivity(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">activity</button>
          <button id="demo-toast" onClick={() => setShowToast(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">toast</button>
          <button id="demo-poster" onClick={() => setShowPoster(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">poster</button>
          <button id="demo-awards" onClick={() => setShowAwards(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">awards</button>
          <button id="demo-accept" onClick={() => setShowAccept(true)}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">accept</button>
          {CUP_DEMOS.map((demo) => (
            <button key={demo} id={`demo-cup-${demo}`} onClick={() => { setCupDemo(demo); setCupClaims([]); setTab('cup'); }}
              className={`rounded px-2 py-1 text-[11px] ${cupDemo === demo && tab === 'cup' ? 'bg-white text-[#0A0A0A]' : 'bg-[#171717] text-white'}`}>cup {demo}</button>
          ))}
          {CUP_SIZES.map((n) => (
            <button key={n} id={`demo-cup-n${n}`} onClick={() => { setCupDemo(`n${n}`); setCupClaims([]); setTab('cup'); }}
              className={`rounded px-2 py-1 text-[11px] ${cupDemo === `n${n}` && tab === 'cup' ? 'bg-white text-[#0A0A0A]' : 'bg-[#171717] text-white'}`}>{n}</button>
          ))}
          <button id="demo-cup-reset" onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith('cup-seen-')).forEach((k) => localStorage.removeItem(k)); } catch { /* blocked */ } setCupJoined(false); setCupClaims([]); setCupRun((run) => run + 1); setTab('cup'); }}
            className="rounded bg-[#171717] px-2 py-1 text-[11px] text-white">reset seen results</button>
        </div>
        <main className="flex-1 overflow-x-hidden px-3 pt-3">
          {tab === 'cup' ? (() => {
            const { current: base, played, at } = cupFixture(cupDemo, cupJoined);
            const current = base ? { ...base, claims: [...base.claims, ...cupClaims] } : null;
            const cupMatches = [...pastCups.flatMap((entry) => entry.played), ...played];
            const all = [...pastCups.map((entry) => entry.cup), ...(current ? [current] : [])];
            return (
              <CupView key={`${cupDemo}-${cupRun}`} tournaments={all} current={current} currentState={current ? resolveCup(current, cupMatches, at) : null}
                records={deriveCups(all, cupMatches, at)}
                matches={[...seasonMatches, ...cupMatches]} players={cupPlayers} currentPlayer={me} now={at}
                onJoin={() => setTimeout(() => setCupJoined(true), 700)} onPlay={() => setChallenging(true)} onSelectPlayer={setDossier}
                onClaimWalkover={async (game) => setCupClaims((prev) => [...prev, { game, id: me.id, at }])} />
            );
          })() : tab === 'events' ? (
            <EventsView matches={seasonMatches} players={players} season={currentSeason}
              seasons={[currentSeason, pastSeason]} currentPlayer={me} onEditWinner={async () => {}}
              onDelete={async () => {}} onEndSeason={async () => {}} onScheduleSeasonEnd={async () => {}} now={now}
              onReact={async () => {}} onOpenComments={() => () => {}}
              onSubmitComment={async () => {}} onDeleteComment={async () => {}}
              detail={{ challenges: [liveChallenge, ...challengesList], payouts: league.chips.payouts, dailies: [], tournaments: [harnessCup],
                subscribeChat: (_id, cb) => { cb([{ id: 'c1', authorId: players[1].id, authorName: players[1].name, text: 'That 8 ball was filthy', createdAt: Date.now() - 600000 }, { id: 'c2', authorId: players[2].id, authorName: players[2].name, text: 'Rematch. Now.', createdAt: Date.now() - 300000 }]); return () => {}; },
                subscribeCheers: (_id, cb) => { cb([{ id: 'h1', playerId: 'x', playerName: 'x', emoji: '🔥', createdAt: 0 }, { id: 'h2', playerId: 'y', playerName: 'y', emoji: '🔥', createdAt: 0 }, { id: 'h3', playerId: 'z', playerName: 'z', emoji: '😱', createdAt: 0 }]); return () => {}; } }} />
          ) : tab === 'leaderboard' ? (
            <LeaderboardView players={players} matches={seasonMatches} league={league}
              season={currentSeason} currentPlayer={me} now={now} leaderboardChanges={{}} onSelectPlayer={setDossier} onChallenge={() => setChallenging(true)} onAddPlayer={() => {}} />
          ) : (
            <ArenaView players={players} challenges={[liveChallenge, ...challengesList]} currentPlayer={me}
              chips={league.chips} daily={{ bye: false, opponent: players[1], played: false, won: false, streak: 2 }} onPlayDaily={() => setChallenging(true)} onLogMatch={() => setTab('log')} onInstantMatch={() => setChallenging(true)} onSelectPlayer={setDossier}
              onIssueChallenge={() => setChallenging(true)}
              onRespond={async () => {}} onCancel={async () => {}}
              onPredict={handlePredict} onPlayChallenge={() => {}}
              onStartChallenge={async () => setShowDuel(true)} onOpenLiveMatch={() => {}} />
          )}
        </main>
        <Navigation activeTab={tab === 'log' ? 'arena' : tab === 'events' ? 'history' : tab}
          onSelectTab={(t) => setTab(t === 'arena' ? 'arena' : t === 'cup' ? 'cup' : t === 'history' ? 'events' : 'leaderboard')}
          arenaBadge={1} cupBadge />
        <PlayerDossierModal player={dossier} rank={players.findIndex((p) => p.id === dossier?.id) + 1}
          allPlayers={players} matches={seasonMatches} league={league}
          onClose={() => setDossier(null)} onChallenge={() => setDossier(null)} />
        {showIncoming && (
          <IncomingChallengeModal challenge={challenges[0]} players={players}
            onAccept={async () => { setShowIncoming(false); setShowDuel(true); }}
            onDecline={async () => setShowIncoming(false)}
            onDismiss={() => setShowIncoming(false)} />
        )}
        {showActivity && (
          <ActivitySheet items={inboxFixture} pendingChallenge={challenges[0]} now={now}
            onOpenChallenge={() => { setShowActivity(false); setShowIncoming(true); }}
            onSelect={() => setShowActivity(false)} onClose={() => setShowActivity(false)} />
        )}
        {showToast && (
          <ActivityToast item={inboxFixture[0]} onOpen={() => { setShowToast(false); setShowActivity(true); }}
            onDismiss={() => setShowToast(false)} />
        )}
        {showRecap && (() => {
          // Dave (rank 2) beats Sarah (rank 1): passes her, collects the crown.
          const winner = players[2], loser = players[1];
          const gain = 30;
          const after = players.map((p) => p.id === winner.id ? { ...p, elo: p.elo + gain, wins: p.wins + 1, currentStreak: 3 }
            : p.id === loser.id ? { ...p, elo: p.elo - gain, losses: p.losses + 1, currentStreak: -1 } : p);
          const match = { ...seasonMatches[0], id: 'demo', timestamp: now, playerAId: winner.id, playerAName: winner.name,
            playerBId: loser.id, playerBName: loser.name, winnerId: winner.id, loserId: loser.id, eloDelta: 12, bountyCollected: 18, isUpset: true };
          const matchesAfter = [match, ...seasonMatches];
          const leagueAfter = deriveLeagueInsights(after, matchesAfter, challengesList, now);
          const recap = buildMatchRecap({ match, playersBefore: players, playersAfter: after, matchesAfter,
            challenge: challenges[0], leagueBefore: league, leagueAfter, now });
          return (
            <MatchSuccessModal
              result={{ match, winnerName: winner.name, loserName: loser.name, eloDelta: 12, bountyCollected: 18,
                winnerNewElo: winner.elo + gain, loserNewElo: loser.elo - gain, isUpset: true, crownChangedHands: true, recap }}
              onClose={() => setShowRecap(false)} onViewLeaderboard={() => setShowRecap(false)} />
          );
        })()}
        {showAwards && (
          <WeeklyAwardsScene week={weekAwards(new Date(Date.now() - 6 * 86_400_000), players, matches, [], league.chips)} players={players} onClose={() => setShowAwards(false)} />
        )}
        {showPoster && (
          <FightPoster challenge={liveChallenge} players={players} matches={seasonMatches} crown={league.crown} pot={140} onClose={() => setShowPoster(false)} />
        )}
        {showSent && (
          <CalloutSentOverlay opponent={players[1]} winDelta={41} crownBounty={24}
            onComplete={() => setShowSent(false)} />
        )}
        {showAccept && (
          <ChallengeAcceptedOverlay challenge={challengesList[0]} players={players}
            onComplete={() => setShowAccept(false)} />
        )}
        {showDuel && (
          <DuelAcceptedOverlay challenge={challenges[0]} players={players}
            onComplete={() => { setShowDuel(false); setTab('log'); }} />
        )}
        {tab === 'log' && (
          <>
            <div id="logged-count" data-count={logged.length} className="fixed left-2 top-2 z-[60] font-mono text-xs text-white">
              logged={logged.length}
            </div>
            <MatchLoggerSheet
              players={players}
              recentMatches={seasonMatches}
              crown={league.crown}
              playerAId={aId}
              playerBId={bId}
              isSubmitting={isLogging}
              onChangePlayers={(a, b) => { setAId(a || undefined); setBId(b || undefined); }}
              onRecordMatch={record}
              onClose={() => setTab('arena')}
            />
          </>
        )}
        {challenging && (
          <ChallengeModal currentPlayer={me} players={players} crown={league.crown}
            onSend={async () => setChallenging(false)} onClose={() => setChallenging(false)} />
        )}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
