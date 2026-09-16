import React, { useState, useEffect } from 'react';
import { TabType, Player, MatchRecord, MatchModifier, BallPreference } from './types';
import { poolService } from './services/poolService';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { LeaderboardView } from './components/LeaderboardView';
import { LogMatchView } from './components/LogMatchView';
import { PlayersView } from './components/PlayersView';
import { PlayerDossierModal } from './components/PlayerDossierModal';
import { MatchSuccessModal } from './components/MatchSuccessModal';
import { IdentityPicker } from './components/IdentityPicker';
import { ProfileModal } from './components/ProfileModal';
import { EventsView } from './components/EventsView';
import { EightBallIcon } from './components/EightBallIcon';

const LOCAL_PLAYER_KEY = 'office_8ball_current_player_id';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('leaderboard');
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  // Match setup state passed to LogMatchView
  const [selectedPlayerAId, setSelectedPlayerAId] = useState<string | undefined>(undefined);
  const [selectedPlayerBId, setSelectedPlayerBId] = useState<string | undefined>(undefined);

  // Selected player for Dossier modal
  const [dossierPlayer, setDossierPlayer] = useState<Player | null>(null);

  // Match success modal state
  const [matchResult, setMatchResult] = useState<{
    match: MatchRecord;
    winnerName: string;
    loserName: string;
    eloDelta: number;
    winnerNewElo: number;
    loserNewElo: number;
    isUpset: boolean;
  } | null>(null);

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [loadedPlayers, loadedMatches] = await Promise.all([
          poolService.getPlayers(),
          poolService.getMatches(),
        ]);
        setPlayers(loadedPlayers);
        setMatches(loadedMatches);
        const savedPlayerId = localStorage.getItem(LOCAL_PLAYER_KEY);
        setCurrentPlayer(loadedPlayers.find((player) => player.id === savedPlayerId) ?? null);
      } finally {
        setIsLoading(false);
        // Quick subtle splash transition for native app feel
        const timer = setTimeout(() => {
          setShowSplash(false);
        }, 650);
        return () => clearTimeout(timer);
      }
    }
    loadData();
  }, []);

  // Handle Recording Match
  const handleRecordMatch = async (
    playerAId: string,
    playerBId: string,
    winnerId: string,
    modifiers: MatchModifier
  ) => {
    try {
      const result = await poolService.logMatch({
        playerAId,
        playerBId,
        winnerId,
        modifiers,
      });

      setPlayers(result.updatedPlayers);
      setMatches((prev) => [result.match, ...prev]);
      setMatchResult(result);
    } catch (err) {
      console.error('Failed to log match:', err);
      alert('Failed to log match. Please try again.');
    }
  };

  // Handle adding a new player
  const handleAddPlayer = async (params: {
    name: string;
    department?: string;
    title?: string;
    ballPreference: BallPreference;
  }): Promise<Player> => {
    const newPlayer = await poolService.addPlayer(params);
    setPlayers((prev) => [...prev, newPlayer]);
    return newPlayer;
  };

  const handleSelectPlayer = (player: Player) => {
    localStorage.setItem(LOCAL_PLAYER_KEY, player.id);
    setCurrentPlayer(player);
  };

  const handleSaveProfile = async (updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference'>) => {
    if (!currentPlayer) return;
    await poolService.updatePlayer(currentPlayer.id, updates);
    const updatedPlayer = { ...currentPlayer, ...updates };
    setCurrentPlayer(updatedPlayer);
    setPlayers((prev) => prev.map((player) => (player.id === updatedPlayer.id ? updatedPlayer : player)));
  };

  const handleEditMatch = async (matchId: string, winnerId: string) => {
    const result = await poolService.updateMatchWinner(matchId, winnerId);
    setPlayers(result.players);
    setMatches(result.matches);
  };

  const handleDeleteMatch = async (matchId: string) => {
    const result = await poolService.deleteMatch(matchId);
    setPlayers(result.players);
    setMatches(result.matches);
  };

  // Quick challenge action from Dossier or Leaderboard
  const handleChallenge = (player: Player) => {
    const sorted = [...players].sort((a, b) => b.elo - a.elo);
    const topPlayer = sorted[0];

    if (topPlayer.id !== player.id) {
      setSelectedPlayerAId(topPlayer.id);
      setSelectedPlayerBId(player.id);
    } else {
      setSelectedPlayerAId(player.id);
      setSelectedPlayerBId(sorted[1]?.id);
    }
    setActiveTab('log');
  };

  // Find rank of selected dossier player
  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
  const dossierRank = dossierPlayer
    ? sortedPlayers.findIndex((p) => p.id === dossierPlayer.id) + 1
    : 1;

  // Splash Screen Display
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-[#10141a] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-[#10b981]/20 blur-xl animate-pulse"></div>
          <EightBallIcon size={72} className="relative shadow-2xl" />
        </div>
        <h1 className="font-['Chivo'] text-2xl sm:text-3xl font-black text-white tracking-tight">
          OFFICE 8-BALL
        </h1>
        <p className="font-['JetBrains_Mono'] text-xs font-bold tracking-widest text-[#4edea3] uppercase mt-1">
          POWER RANKINGS & ELO
        </p>

        <div className="mt-8 flex items-center gap-2 text-[11px] font-['Space_Grotesk'] text-[#86948a]">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-ping"></span>
          <span>CALIBRATING LEAGUE MATRIX...</span>
        </div>
      </div>
    );
  }

  if (!currentPlayer) {
    return <IdentityPicker players={players} onSelect={handleSelectPlayer} onAdd={handleAddPlayer} />;
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#dfe2eb] flex justify-center selection:bg-[#10b981]/30 selection:text-[#4edea3]">
      {/* Mobile Frame Container: Centered on desktop, fluid on mobile up to 480px */}
      <div className="w-full max-w-md min-h-screen bg-[#10141a] border-x border-[#30363d]/40 flex flex-col relative shadow-2xl">
        {/* Sticky App Header */}
        <Header
          activeTab={activeTab}
          currentUser={currentPlayer}
          matchesCount={matches.length}
          onOpenProfile={() => setShowProfile(true)}
        />

        {/* Main Content Area: Instantaneous State-Driven View Switching */}
        <main className="flex-1 px-4 pt-3 overflow-x-hidden">
          {activeTab === 'leaderboard' && (
            <div className="animate-in fade-in duration-150">
              <LeaderboardView
                players={players}
                matches={matches}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onNavigateToLog={(playerA, playerB) => {
                  if (playerA) setSelectedPlayerAId(playerA.id);
                  if (playerB) setSelectedPlayerBId(playerB.id);
                  setActiveTab('log');
                }}
              />
            </div>
          )}

          {activeTab === 'log' && (
            <div className="animate-in fade-in duration-150">
              <LogMatchView
                players={players}
                recentMatches={matches}
                initialPlayerAId={selectedPlayerAId}
                initialPlayerBId={selectedPlayerBId}
                onRecordMatch={handleRecordMatch}
              />
            </div>
          )}

          {activeTab === 'players' && (
            <div className="animate-in fade-in duration-150">
              <PlayersView
                players={players}
                matches={matches}
                onAddPlayer={handleAddPlayer}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onChallengePlayer={handleChallenge}
              />
            </div>
          )}

          {activeTab === 'events' && (
            <div className="animate-in fade-in duration-150">
              <EventsView
                matches={matches}
                players={players}
                onEditWinner={handleEditMatch}
                onDelete={handleDeleteMatch}
              />
            </div>
          )}
        </main>

        {/* Fixed Bottom Navigation */}
        <Navigation activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} />

        {/* Player Tactical Dossier Modal */}
        <PlayerDossierModal
          player={dossierPlayer}
          rank={dossierRank}
          allPlayers={players}
          matches={matches}
          onClose={() => setDossierPlayer(null)}
          onChallenge={handleChallenge}
        />

        {/* Match Recorded Celebration Toast / Modal */}
        <MatchSuccessModal
          result={matchResult}
          onClose={() => setMatchResult(null)}
          onViewLeaderboard={() => {
            setMatchResult(null);
            setActiveTab('leaderboard');
          }}
        />

        <ProfileModal
          player={showProfile ? currentPlayer : null}
          onClose={() => setShowProfile(false)}
          onSave={handleSaveProfile}
        />
      </div>
    </div>
  );
}
