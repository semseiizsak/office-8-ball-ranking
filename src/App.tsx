import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TabType, Player, MatchRecord, MatchModifier, BallPreference, Challenge, ChallengeStakes,
  Season, SeasonStanding, SeasonTitle,
} from './types';
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
import { IncomingChallengeModal } from './components/IncomingChallengeModal';
import { DuelAcceptedOverlay } from './components/DuelAcceptedOverlay';
import { registerForPushNotifications, sendNotification, subscribeToSparkNotifications } from './services/notifications';
import { deriveLeagueInsights, matchesInSeason, IMPLICIT_SEASON } from './utils/league';
import { previewStakes } from './utils/stakes';
import { EightBallIcon } from './components/EightBallIcon';

const LOCAL_PLAYER_KEY = 'office_8ball_current_player_id';
/** How long to wait for the first load before telling the user it is not coming. */
const LOAD_TIMEOUT_MS = 15_000;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('leaderboard');
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<{ opponentId?: string } | null>(null);
  const [isLoggingMatch, setIsLoggingMatch] = useState(false);
  /**
   * Synchronous lock on match submission.
   * State alone is not enough: taps that land in the same frame all read the
   * pre-update value and every one of them starts a transaction.
   */
  const loggingRef = useRef(false);
  /** Challenge currently playing its accept animation before opening the match. */
  const [acceptedDuel, setAcceptedDuel] = useState<Challenge | null>(null);
  /** Incoming challenges the user chose to answer later, this session. */
  const [snoozedChallengeIds, setSnoozedChallengeIds] = useState<string[]>([]);
  const sendingChallengeRef = useRef(false);

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

  // Everything is scoped to the running season, so closing one genuinely
  // starts the table over instead of just relabelling it.
  const currentSeason = useMemo(
    () => seasons.find((season) => season.endedAt === null) ?? IMPLICIT_SEASON,
    [seasons]
  );
  const seasonMatches = useMemo(
    () => matchesInSeason(matches, currentSeason),
    [matches, currentSeason]
  );

  // The crown, the titles and every rivalry fall out of match history, so they
  // stay correct after an edit without anything extra being stored.
  const league = useMemo(
    () => deriveLeagueInsights(players, seasonMatches, challenges, Date.now(), currentSeason.startingElo),
    [players, seasonMatches, challenges, currentSeason]
  );

  useEffect(() => {
    let cancelled = false;

    // Firestore retries a bad project or an unreachable network indefinitely
    // rather than rejecting, which would otherwise leave the splash spinning
    // forever with nothing to explain it.
    const withTimeout = <T,>(work: Promise<T>): Promise<T> =>
      Promise.race([
        work,
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error('Timed out reaching the league database.')),
            LOAD_TIMEOUT_MS
          )
        ),
      ]);

    async function loadData() {
      try {
        const [loadedPlayers, loadedMatches, loadedChallenges, loadedSeasons] = await withTimeout(
          Promise.all([
            poolService.getPlayers(),
            poolService.getMatches(),
            poolService.getChallenges(),
            poolService.getSeasons(),
          ])
        );
        if (cancelled) return;
        setPlayers(loadedPlayers);
        setMatches(loadedMatches);
        setChallenges(loadedChallenges);
        setSeasons(loadedSeasons);
        const savedPlayerId = localStorage.getItem(LOCAL_PLAYER_KEY);
        setCurrentPlayer(loadedPlayers.find((player) => player.id === savedPlayerId) ?? null);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load league data:', error);
        setLoadError(
          error instanceof Error ? error.message : 'Could not reach the league database.'
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
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

  // You are almost always one of the two people in a match you are logging.
  // Defaulting to the top of the table instead made a stray tap credit a result
  // to the leaders.
  useEffect(() => {
    if (currentPlayer && !selectedPlayerAId) setSelectedPlayerAId(currentPlayer.id);
  }, [currentPlayer, selectedPlayerAId]);

  const refreshPlayers = async () => {
    setPlayers(await poolService.getPlayers());
  };

  const handleRecordMatch = async (
    playerAId: string,
    playerBId: string,
    winnerId: string,
    modifiers: MatchModifier
  ) => {
    if (loggingRef.current) return;
    loggingRef.current = true;
    setIsLoggingMatch(true);
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
    } finally {
      loggingRef.current = false;
      setIsLoggingMatch(false);
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

  /** Replaying a season returns only that season's matches, so older ones are kept. */
  const applyMutation = (result: { players: Player[]; matches: MatchRecord[] }) => {
    setPlayers(result.players);
    const rebuilt = new Map(result.matches.map((match) => [match.id, match]));
    setMatches((prev) =>
      prev
        .filter((match) => rebuilt.has(match.id) || matchesInSeason([match], currentSeason).length === 0)
        .map((match) => rebuilt.get(match.id) ?? match)
    );
  };

  const handleEditMatch = async (matchId: string, winnerId: string) => {
    applyMutation(await poolService.updateMatchWinner(matchId, currentSeason, winnerId));
  };

  const handleDeleteMatch = async (matchId: string) => {
    applyMutation(await poolService.deleteMatch(matchId, currentSeason));
  };

  /** Archives the running season's standings and titles, then resets ratings. */
  const handleEndSeason = async () => {
    const ranked = [...players]
      .filter((player) => player.wins + player.losses > 0)
      .sort((left, right) => right.elo - left.elo);
    const standings: SeasonStanding[] = ranked.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      rank: index + 1,
      elo: player.elo,
      wins: player.wins,
      losses: player.losses,
    }));
    const titles: SeasonTitle[] = league.titles.map((title) => ({
      key: title.key,
      label: title.label,
      emoji: title.emoji,
      holderId: title.holderId,
      holderName: title.holderName,
      valueLabel: title.valueLabel,
    }));

    const result = await poolService.startNewSeason({ current: currentSeason, standings, titles });
    setPlayers(result.players);
    setSeasons(result.seasons);
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
    if (sendingChallengeRef.current) return;
    sendingChallengeRef.current = true;
    let challenge;
    try {
      challenge = await poolService.createChallenge({ challenger: currentPlayer, opponent, stakes });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not send challenge.');
      return;
    } finally {
      sendingChallengeRef.current = false;
    }
    // Deliberately no optimistic insert here. Firestore's snapshot listener
    // fires on the local write before createChallenge resolves, so adding it
    // again put the same challenge on the board twice.
    setChallengeTarget(null);
    // Line the match up so the log view is already on the right pair.
    setSelectedPlayerAId(currentPlayer.id);
    setSelectedPlayerBId(opponent.id);
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
    }).catch((error) => console.warn('Challenge notification not delivered:', error));
  };

  const handleRespondToChallenge = async (challenge: Challenge, status: 'accepted' | 'declined') => {
    try {
      await poolService.respondToChallenge(challenge.id, status);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not update challenge.');
      return;
    }
    if (status === 'accepted') {
      // Hand straight over to the match rather than leaving them to find it.
      setAcceptedDuel(challenge);
    }
    await sendNotification({
      recipientPlayerId: challenge.challengerId,
      type: 'challenge_answered',
      title: status === 'accepted' ? 'Challenge accepted' : 'Challenge declined',
      body:
        status === 'accepted'
          ? `${challenge.opponentName} is up for it.`
          : `${challenge.opponentName} ducked it.`,
      challengeId: challenge.id,
    }).catch((error) => console.warn('Challenge reply notification not delivered:', error));
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
  // The one standing challenge to put in front of the user when they open up.
  const incomingChallenge = currentPlayer
    ? challenges.find(
        (challenge) =>
          challenge.status === 'pending' &&
          challenge.opponentId === currentPlayer.id &&
          !snoozedChallengeIds.includes(challenge.id)
      ) ?? null
    : null;
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

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#ef4444]/40 bg-[#161b22] p-6 text-center shadow-2xl">
          <EightBallIcon size={48} className="mx-auto" />
          <h1 className="mt-4 font-['Chivo'] text-xl font-black tracking-tight text-white">
            Can't reach the league
          </h1>
          <p className="mt-2 font-['Space_Grotesk'] text-sm leading-relaxed text-[#bbcabf]">
            The app loaded, but the database did not answer. Check the Firebase project settings and
            that Firestore is enabled.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-[#30363d] bg-[#10141a] p-3 text-left font-['JetBrains_Mono'] text-[11px] text-[#ffb4ab]">
            {loadError}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-xl bg-[#10b981] px-4 py-2.5 font-['Chivo'] text-sm font-bold text-[#002113]"
          >
            Try again
          </button>
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

        <main className="flex-1 overflow-x-hidden px-4 pt-3 pb-[var(--safe-bottom)]">
          {activeTab === 'leaderboard' && (
            <div className="anim-fade">
              <LeaderboardView
                players={players}
                matches={seasonMatches}
                league={league}
                season={currentSeason}
                currentPlayer={currentPlayer}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onChallenge={handleChallenge}
              />
            </div>
          )}

          {activeTab === 'arena' && (
            <div className="anim-fade">
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
            <div className="anim-fade">
              <LogMatchView
                players={players}
                recentMatches={seasonMatches}
                crown={league.crown}
                playerAId={selectedPlayerAId}
                playerBId={selectedPlayerBId}
                onChangePlayers={(playerAId, playerBId) => {
                  setSelectedPlayerAId(playerAId || undefined);
                  setSelectedPlayerBId(playerBId || undefined);
                }}
                isSubmitting={isLoggingMatch}
                onRecordMatch={handleRecordMatch}
              />
            </div>
          )}

          {activeTab === 'players' && (
            <div className="anim-fade">
              <PlayersView
                players={players}
                matches={seasonMatches}
                league={league}
                onAddPlayer={handleAddPlayer}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onChallengePlayer={handleChallenge}
              />
            </div>
          )}

          {activeTab === 'events' && (
            <div className="anim-fade">
              <EventsView
                matches={matches}
                players={players}
                season={currentSeason}
                seasons={seasons}
                onEditWinner={handleEditMatch}
                onDelete={handleDeleteMatch}
                onEndSeason={handleEndSeason}
              />
            </div>
          )}
        </main>

        <Navigation activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} arenaBadge={arenaBadge} />

        <PlayerDossierModal
          player={dossierPlayer}
          rank={dossierRank}
          allPlayers={players}
          matches={seasonMatches}
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

        {acceptedDuel && (
          <DuelAcceptedOverlay
            challenge={acceptedDuel}
            players={players}
            onComplete={() => {
              handlePlayChallenge(acceptedDuel);
              setAcceptedDuel(null);
            }}
          />
        )}

        {incomingChallenge && !acceptedDuel && (
          <IncomingChallengeModal
            challenge={incomingChallenge}
            players={players}
            onAccept={(challenge) => handleRespondToChallenge(challenge, 'accepted')}
            onDecline={(challenge) => handleRespondToChallenge(challenge, 'declined')}
            onDismiss={(challenge) =>
              setSnoozedChallengeIds((prev) => [...prev, challenge.id])
            }
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
