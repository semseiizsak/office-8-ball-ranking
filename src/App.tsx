import React, { useState, useEffect, useMemo } from 'react';
import { TabType, Player, MatchRecord, MatchModifier, BallPreference, Challenge, ChallengeStakes } from './types';
import { poolService } from './services/poolService';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { LeaderboardView } from './components/LeaderboardView';
import { LogMatchView } from './components/LogMatchView';
import { PlayersView } from './components/PlayersView';
import { ArenaView } from './components/ArenaView';
import { PlayerDossierModal } from './components/PlayerDossierModal';
import { MatchSuccessModal } from './components/MatchSuccessModal';
import { IdentityPicker } from './components/IdentityPicker';
import { ProfileModal } from './components/ProfileModal';
import { EventsView } from './components/EventsView';
import { QuickMatchModal } from './components/QuickMatchModal';
import { ChallengeModal } from './components/ChallengeModal';
import { registerForPushNotifications, sendNotification, subscribeToSparkNotifications } from './services/notifications';
import { deriveLeagueInsights } from './utils/league';
import { previewStakes } from './utils/stakes';
import { EightBallIcon } from './components/EightBallIcon';

const LOCAL_PLAYER_KEY = 'office_8ball_current_player_id';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('leaderboard');
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<{ opponentId?: string } | null>(null);

  // Match setup state passed to LogMatchView
  const [selectedPlayerAId, setSelectedPlayerAId] = useState<string | undefined>(undefined);
  const [selectedPlayerBId, setSelectedPlayerBId] = useState<string | undefined>(undefined);
  /** Challenge this match is settling, so predictions get scored when it lands. */
  const [activeChallengeId, setActiveChallengeId] = useState<string | undefined>(undefined);

  const [dossierPlayer, setDossierPlayer] = useState<Player | null>(null);

  const [matchResult, setMatchResult] = useState<{
    match: MatchRecord;
    winnerName: string;
    loserName: string;
    eloDelta: number;
    bountyCollected: number;
    winnerNewElo: number;
    loserNewElo: number;
    isUpset: boolean;
    crownChangedHands: boolean;
  } | null>(null);

  // The crown, the titles and every rivalry fall out of match history, so they
  // stay correct after an edit without anything extra being stored.
  const league = useMemo(
    () => deriveLeagueInsights(players, matches, challenges),
    [players, matches, challenges]
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [loadedPlayers, loadedMatches, loadedChallenges] = await Promise.all([
          poolService.getPlayers(),
          poolService.getMatches(),
          poolService.getChallenges(),
        ]);
        setPlayers(loadedPlayers);
        setMatches(loadedMatches);
        setChallenges(loadedChallenges);
        const savedPlayerId = localStorage.getItem(LOCAL_PLAYER_KEY);
        setCurrentPlayer(loadedPlayers.find((player) => player.id === savedPlayerId) ?? null);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 650);
    return () => window.clearTimeout(timer);
  }, []);

  // The arena is only fun if it updates while people are watching it.
  useEffect(() => {
    if (!currentPlayer) return;
    return poolService.subscribeToChallenges(setChallenges);
  }, [currentPlayer]);

  useEffect(() => {
    if (!currentPlayer) return;
    void registerForPushNotifications(currentPlayer.id).catch(() => undefined);
    if (typeof Notification === 'undefined') return;
    return subscribeToSparkNotifications(currentPlayer.id, (title, body) => {
      if (Notification.permission === 'granted') new Notification(title, { body });
    });
  }, [currentPlayer]);

  const refreshPlayers = async () => {
    setPlayers(await poolService.getPlayers());
  };

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
        challengeId: activeChallengeId,
      });

      setPlayers(result.players);
      setMatches((prev) => [result.match, ...prev]);
      setMatchResult(result);

      if (activeChallengeId) {
        // Settling the challenge books every spectator's call, so the player
        // records have to be re-read afterwards.
        await poolService.resolveChallenge({
          challengeId: activeChallengeId,
          matchId: result.match.id,
          winnerId,
        });
        setActiveChallengeId(undefined);
        await refreshPlayers();
      }
    } catch (err) {
      console.error('Failed to log match:', err);
      alert('Failed to log match. Please try again.');
    }
  };

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

  const handleSwitchPlayer = () => {
    localStorage.removeItem(LOCAL_PLAYER_KEY);
    setShowProfile(false);
    setCurrentPlayer(null);
  };

  const handleSaveProfile = async (
    updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference'>
  ) => {
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

  const handleQuickMatchComplete = (opponent: Player) => {
    setShowQuickMatch(false);
    setSelectedPlayerAId(currentPlayer?.id);
    setSelectedPlayerBId(opponent.id);
    setActiveChallengeId(undefined);
    setActiveTab('log');
  };

  /** Opens the challenge composer rather than silently jumping to the log form. */
  const handleChallenge = (player: Player) => {
    if (!currentPlayer || currentPlayer.id === player.id) return;
    setDossierPlayer(null);
    setChallengeTarget({ opponentId: player.id });
  };

  const handleSendChallenge = async (opponent: Player, stakes: ChallengeStakes) => {
    if (!currentPlayer) return;
    const challenge = await poolService.createChallenge({ challenger: currentPlayer, opponent, stakes });
    setChallenges((prev) => [challenge, ...prev]);
    setChallengeTarget(null);
    setActiveTab('arena');

    // Tell them what the match is worth to them, not just that it exists.
    const theirStakes = previewStakes(
      opponent,
      currentPlayer,
      players,
      league.crown.holderId === currentPlayer.id ? league.crown.bounty : 0,
      league.crown.holderId === opponent.id ? league.crown.bounty : 0
    );
    await sendNotification({
      recipientPlayerId: opponent.id,
      type: 'challenge',
      title: `${currentPlayer.name} called you out`,
      body: theirStakes.headline,
      challengeId: challenge.id,
    }).catch(() => undefined);
  };

  const handleRespondToChallenge = async (challenge: Challenge, status: 'accepted' | 'declined') => {
    await poolService.respondToChallenge(challenge.id, status);
    await sendNotification({
      recipientPlayerId: challenge.challengerId,
      type: 'challenge_answered',
      title: status === 'accepted' ? 'Challenge accepted' : 'Challenge declined',
      body:
        status === 'accepted'
          ? `${challenge.opponentName} is up for it.`
          : `${challenge.opponentName} ducked it.`,
      challengeId: challenge.id,
    }).catch(() => undefined);
  };

  const handleCancelChallenge = async (challenge: Challenge) => {
    await poolService.cancelChallenge(challenge.id);
  };

  const handlePredict = async (challenge: Challenge, predictedWinnerId: string) => {
    if (!currentPlayer) return;
    await poolService.addPrediction({
      challengeId: challenge.id,
      predictorId: currentPlayer.id,
      predictorName: currentPlayer.name,
      predictedWinnerId,
    });
  };

  const handlePlayChallenge = (challenge: Challenge) => {
    setSelectedPlayerAId(challenge.challengerId);
    setSelectedPlayerBId(challenge.opponentId);
    setActiveChallengeId(challenge.id);
    setActiveTab('log');
  };

  const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
  const dossierRank = dossierPlayer
    ? sortedPlayers.findIndex((p) => p.id === dossierPlayer.id) + 1
    : 1;
  const arenaBadge = currentPlayer
    ? challenges.filter(
        (challenge) => challenge.status === 'pending' && challenge.opponentId === currentPlayer.id
      ).length
    : 0;

  if (showSplash || isLoading) {
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
      <div className="w-full max-w-md min-h-screen bg-[#10141a] border-x border-[#30363d]/40 flex flex-col relative shadow-2xl">
        <Header
          activeTab={activeTab}
          currentUser={currentPlayer}
          matchesCount={matches.length}
          onOpenProfile={() => setShowProfile(true)}
          onQuickMatch={() => setShowQuickMatch(true)}
        />

        <main className="flex-1 px-4 pt-3 overflow-x-hidden">
          {activeTab === 'leaderboard' && (
            <div className="animate-in fade-in duration-150">
              <LeaderboardView
                players={players}
                matches={matches}
                league={league}
                currentPlayer={currentPlayer}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onChallenge={handleChallenge}
              />
            </div>
          )}

          {activeTab === 'arena' && (
            <div className="animate-in fade-in duration-150">
              <ArenaView
                players={players}
                challenges={challenges}
                currentPlayer={currentPlayer}
                onIssueChallenge={() => setChallengeTarget({})}
                onRespond={handleRespondToChallenge}
                onCancel={handleCancelChallenge}
                onPredict={handlePredict}
                onPlayChallenge={handlePlayChallenge}
              />
            </div>
          )}

          {activeTab === 'log' && (
            <div className="animate-in fade-in duration-150">
              <LogMatchView
                key={`${selectedPlayerAId ?? 'default'}-${selectedPlayerBId ?? 'default'}`}
                players={players}
                recentMatches={matches}
                crown={league.crown}
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
                league={league}
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

        <Navigation activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} arenaBadge={arenaBadge} />

        <PlayerDossierModal
          player={dossierPlayer}
          rank={dossierRank}
          allPlayers={players}
          matches={matches}
          league={league}
          onClose={() => setDossierPlayer(null)}
          onChallenge={handleChallenge}
        />

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
          onSwitchPlayer={handleSwitchPlayer}
          onSave={handleSaveProfile}
        />

        {showQuickMatch && (
          <QuickMatchModal
            player={currentPlayer}
            opponents={players.filter((player) => player.id !== currentPlayer.id)}
            onComplete={handleQuickMatchComplete}
            onClose={() => setShowQuickMatch(false)}
          />
        )}

        {challengeTarget && (
          <ChallengeModal
            currentPlayer={currentPlayer}
            players={players}
            crown={league.crown}
            preselectedOpponentId={challengeTarget.opponentId}
            onSend={handleSendChallenge}
            onClose={() => setChallengeTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
