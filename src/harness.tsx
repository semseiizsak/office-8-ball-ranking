import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Challenge, MatchRecord, Player } from './types';
import { deriveLeagueInsights, runLeagueReplay, DAY_MS } from './utils/league';
import { LeaderboardView } from './components/LeaderboardView';
import { ArenaView } from './components/ArenaView';
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
const players = basePlayers.map((player) => {
  const member = replay.members.get(player.id)!;
  return { ...player, elo: member.elo, peakElo: member.peakElo, wins: member.wins,
    losses: member.losses, currentStreak: member.currentStreak,
    bestWinStreak: member.bestWinStreak, recentForm: member.recentForm,
    lastPlayedAt: member.lastPlayedAt };
});

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
  startedAt: now - 180 * DAY_MS, endedAt: now - 60 * DAY_MS,
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
  startedAt: now - 60 * DAY_MS, endedAt: null,
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

const Harness: React.FC = () => {
  const [tab, setTab] = useState<'leaderboard' | 'arena' | 'events' | 'log'>('leaderboard');
  // Mirrors the app's submission lock so the double-tap guard is exercised.
  const [logged, setLogged] = useState<string[]>([]);
  const [isLogging, setIsLogging] = useState(false);
  const loggingRef = React.useRef(false);
  const [showIncoming, setShowIncoming] = useState(false);
  const [showDuel, setShowDuel] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
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

  const handlePredict = async (challenge: Challenge, predictedWinnerId: string) => {
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
              createdAt: Date.now(),
            },
          ],
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#dfe2eb] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#10141a] flex flex-col">
        <Header activeTab={tab === 'arena' || tab === 'log' ? 'arena' : tab === 'events' ? 'history' : 'leaderboard'}
          currentUser={me} matchesCount={seasonMatches.length}
          onOpenProfile={() => {}} onQuickMatch={() => {}} onOpenChallengeInbox={() => {}} />
        <div className="flex gap-2 p-2">
          <button id="demo-incoming" onClick={() => setShowIncoming(true)}
            className="rounded bg-[#1c2026] px-2 py-1 text-[11px] text-white">incoming</button>
          <button id="demo-duel" onClick={() => setShowDuel(true)}
            className="rounded bg-[#1c2026] px-2 py-1 text-[11px] text-white">duel</button>
          <button id="demo-sent" onClick={() => setShowSent(true)}
            className="rounded bg-[#1c2026] px-2 py-1 text-[11px] text-white">sent</button>
          <button id="demo-accept" onClick={() => setShowAccept(true)}
            className="rounded bg-[#1c2026] px-2 py-1 text-[11px] text-white">accept</button>
        </div>
        <main className="flex-1 px-4 pt-3">
          {tab === 'events' ? (
            <EventsView matches={seasonMatches} players={players} season={currentSeason}
              seasons={[currentSeason, pastSeason]} currentPlayer={me} onEditWinner={async () => {}}
              onDelete={async () => {}} onEndSeason={async () => {}}
              onReact={async () => {}} onOpenComments={() => () => {}}
              onSubmitComment={async () => {}} onDeleteComment={async () => {}} />
          ) : tab === 'leaderboard' ? (
            <LeaderboardView players={players} matches={seasonMatches} league={league}
              season={currentSeason} currentPlayer={me} leaderboardChanges={{}} onSelectPlayer={setDossier} onChallenge={() => setChallenging(true)} onAddPlayer={() => {}} />
          ) : (
            <ArenaView players={players} challenges={[liveChallenge, ...challengesList]} currentPlayer={me}
              nerve={nerveFixture} onLogMatch={() => setTab('log')} onSelectPlayer={setDossier}
              onIssueChallenge={() => setChallenging(true)}
              onRespond={async () => {}} onCancel={async () => {}}
              onPredict={handlePredict} onPlayChallenge={() => {}}
              onStartChallenge={async () => setShowDuel(true)} onOpenLiveMatch={() => {}} />
          )}
        </main>
        <Navigation activeTab={tab === 'log' ? 'arena' : tab === 'events' ? 'history' : tab}
          onSelectTab={(t) => setTab(t === 'arena' ? 'arena' : t === 'history' ? 'events' : 'leaderboard')}
          arenaBadge={1} />
        <PlayerDossierModal player={dossier} rank={players.findIndex((p) => p.id === dossier?.id) + 1}
          allPlayers={players} matches={seasonMatches} league={league}
          onClose={() => setDossier(null)} onChallenge={() => setDossier(null)} />
        {showIncoming && (
          <IncomingChallengeModal challenge={challenges[0]} players={players}
            onAccept={async () => { setShowIncoming(false); setShowDuel(true); }}
            onDecline={async () => setShowIncoming(false)}
            onDismiss={() => setShowIncoming(false)} />
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
