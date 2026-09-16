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
  predictionsCorrect: [0, 7, 3, 5, 1][index],
  predictionsTotal: [0, 9, 8, 6, 4][index],
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
    createdAt: now - 3600_000, expiresAt: now + 5 * 3600_000, respondedAt: null,
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
    opponentId: 'p3', opponentName: NAMES[3], status: 'accepted',
    createdAt: now - 7200_000, expiresAt: now + 3600_000, respondedAt: now - 3000_000,
    stakes: { challengerElo: players[0].elo, opponentElo: players[3].elo, challengerRank: 2,
      opponentRank: 4, challengerWinDelta: 11, opponentWinDelta: 21,
      challengerIsUnderdog: false, crownBounty: 0 },
    matchId: null, resolvedWinnerId: null, predictions: [],
  },
];

const Harness: React.FC = () => {
  const [tab, setTab] = useState<'leaderboard' | 'arena'>('leaderboard');
  const [dossier, setDossier] = useState<Player | null>(null);
  const [challenging, setChallenging] = useState(false);
  const league = deriveLeagueInsights(players, matches, challenges, now);
  const me = players[2];

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#dfe2eb] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#10141a] flex flex-col">
        <main className="flex-1 px-4 pt-3">
          {tab === 'leaderboard' ? (
            <LeaderboardView players={players} matches={matches} league={league}
              currentPlayer={me} onSelectPlayer={setDossier} onChallenge={() => setChallenging(true)} />
          ) : (
            <ArenaView players={players} challenges={challenges} currentPlayer={me}
              onIssueChallenge={() => setChallenging(true)}
              onRespond={async () => {}} onCancel={async () => {}}
              onPredict={async () => {}} onPlayChallenge={() => {}} />
          )}
        </main>
        <Navigation activeTab={tab} onSelectTab={(t) => setTab(t === 'arena' ? 'arena' : 'leaderboard')} arenaBadge={1} />
        <PlayerDossierModal player={dossier} rank={players.findIndex((p) => p.id === dossier?.id) + 1}
          allPlayers={players} matches={matches} league={league}
          onClose={() => setDossier(null)} onChallenge={() => setDossier(null)} />
        {challenging && (
          <ChallengeModal currentPlayer={me} players={players} crown={league.crown}
            onSend={async () => setChallenging(false)} onClose={() => setChallenging(false)} />
        )}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
