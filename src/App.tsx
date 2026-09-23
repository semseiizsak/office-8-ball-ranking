import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TabType, Player, MatchRecord, MatchModifier, BallPreference, Challenge, ChallengeStakes,
  Season, SeasonStanding, SeasonTitle,
} from './types';
import { poolService } from './services/poolService';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { LeaderboardView } from './components/LeaderboardView';
import { MatchLoggerSheet } from './components/MatchLoggerSheet';
import { ArenaView, deriveChallengeView, LiveMatchScreen } from './components/ArenaView';
import { PlayerDossierModal } from './components/PlayerDossierModal';
import { MatchSuccessModal } from './components/MatchSuccessModal';
import { IdentityPicker } from './components/IdentityPicker';
import { ProfileModal } from './components/ProfileModal';
import { EventsView } from './components/EventsView';
import { QuickMatchModal } from './components/QuickMatchModal';
import { ChallengeModal } from './components/ChallengeModal';
import { AddPlayerModal } from './components/AddPlayerModal';
import { IncomingChallengeModal } from './components/IncomingChallengeModal';
import { DuelAcceptedOverlay } from './components/DuelAcceptedOverlay';
import { DuckChallengeOverlay } from './components/DuckChallengeOverlay';
import { CalloutSentOverlay } from './components/CalloutSentOverlay';
import { ChallengeAcceptedOverlay } from './components/ChallengeAcceptedOverlay';
import { registerForPushNotifications, sendNotification, subscribeToSparkNotifications } from './services/notifications';
import { deriveLeagueInsights, hasLockOnDay, matchesInSeason, IMPLICIT_SEASON, DORMANT_AFTER_DAYS } from './utils/league';
import { previewStakes } from './utils/stakes';
import { EightBallIcon } from './components/EightBallIcon';

const LOCAL_PLAYER_KEY = 'office_8ball_current_player_id';
const LEADERBOARD_SNAPSHOT_KEY = 'office_8ball_leaderboard_snapshot_v1';
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
  /** The log sheet, opened over the arena rather than living in the tab bar. */
  const [isLoggerOpen, setIsLoggerOpen] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  /**
   * Synchronous lock on match submission.
   * State alone is not enough: taps that land in the same frame all read the
   * pre-update value and every one of them starts a transaction.
   */
  const loggingRef = useRef(false);
  /** Challenge currently playing its accept animation before opening the match. */
  const [acceptedDuel, setAcceptedDuel] = useState<Challenge | null>(null);
  /** The live match on screen — opened by a tap, or automatically for either
   * player the instant their own match goes live, wherever they are in the app. */
  const [activeLiveChallengeId, setActiveLiveChallengeId] = useState<string | null>(null);
  const [declinedDuel, setDeclinedDuel] = useState<Challenge | null>(null);
  const [sentCallout, setSentCallout] = useState<{ opponent: Player; winDelta: number; crownBounty: number } | null>(null);
  const [acceptedCallout, setAcceptedCallout] = useState<Challenge | null>(null);
  const [showChallengeInbox, setShowChallengeInbox] = useState(false);
  const [leaderboardChanges, setLeaderboardChanges] = useState<Record<string, 'reordered' | 'woke'>>({});
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
          await poolService.reconcileChallengesWithMatches();
        if (cancelled) return;
        setPlayers(loadedPlayers);
        setMatches(loadedMatches);
        setChallenges(loadedChallenges);
        setSeasons(loadedSeasons);
        const savedPlayerId = localStorage.getItem(LOCAL_PLAYER_KEY);
        setCurrentPlayer(loadedPlayers.find((player) => player.id === savedPlayerId) ?? null);

        const previousSnapshot = JSON.parse(
          localStorage.getItem(LEADERBOARD_SNAPSHOT_KEY) ?? '{}'
        ) as Record<string, { rank: number; lastPlayedAt: number | null }>;
        const isDormantAt = (lastPlayedAt: number | null) =>
          lastPlayedAt === null || Date.now() - lastPlayedAt >= DORMANT_AFTER_DAYS * 86_400_000;
        const nextRanks = new Map(
          [...loadedPlayers]
            .filter((player) => !isDormantAt(player.lastPlayedAt))
            .sort((left, right) => right.elo - left.elo)
            .map((player, index) => [player.id, index + 1])
        );
        const changes: Record<string, 'reordered' | 'woke'> = {};
        for (const player of loadedPlayers) {
          const previous = previousSnapshot[player.id];
          if (!previous) continue;
          const wasDormant =
            previous.lastPlayedAt === null ||
            Date.now() - previous.lastPlayedAt >= DORMANT_AFTER_DAYS * 86_400_000;
          const isActiveAgain =
            player.lastPlayedAt !== null &&
            Date.now() - player.lastPlayedAt < DORMANT_AFTER_DAYS * 86_400_000;
          if (wasDormant && isActiveAgain) changes[player.id] = 'woke';
          else if (previous.rank !== nextRanks.get(player.id)) changes[player.id] = 'reordered';
        }
        setLeaderboardChanges(changes);
        localStorage.setItem(
          LEADERBOARD_SNAPSHOT_KEY,
          JSON.stringify(
            loadedPlayers.reduce<Record<string, { rank: number; lastPlayedAt: number | null }>>(
              (snapshot, player) => {
                snapshot[player.id] = {
                  rank: nextRanks.get(player.id) ?? 0,
                  lastPlayedAt: player.lastPlayedAt,
                };
                return snapshot;
              },
              {}
            )
          )
        );
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

  /**
   * Pulls both players into the live screen the instant their match starts,
   * not just whoever tapped the button — the whole point of starting is that
   * play begins right now, wherever either of them happens to be in the app.
   * Guarded against firing on the initial snapshot: every already-live match
   * would otherwise look like a fresh transition the moment the app loads.
   */
  const seededLiveStatusesRef = useRef(false);
  const previousChallengeStatusesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!currentPlayer) return;
    if (!seededLiveStatusesRef.current) {
      previousChallengeStatusesRef.current = new Map(challenges.map((c) => [c.id, c.status]));
      seededLiveStatusesRef.current = true;
      return;
    }
    for (const challenge of challenges) {
      const wasLive = previousChallengeStatusesRef.current.get(challenge.id) === 'live';
      const isMine =
        challenge.challengerId === currentPlayer.id || challenge.opponentId === currentPlayer.id;
      if (isMine && challenge.status === 'live' && !wasLive) {
        setActiveLiveChallengeId(challenge.id);
      }
    }
    previousChallengeStatusesRef.current = new Map(challenges.map((c) => [c.id, c.status]));
  }, [challenges, currentPlayer]);

  // Reactions and comments on a match should land for everyone watching the
  // feed, not just the person who posted them.
  useEffect(() => {
    if (!currentPlayer) return;
    return poolService.subscribeToMatches(setMatches);
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
      setIsLoggerOpen(false);

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

  const handleReactToMatch = async (matchId: string, emoji: string | null) => {
    if (!currentPlayer) return;
    await poolService.setMatchReaction(matchId, currentPlayer.id, emoji);
  };

  const handleSubmitComment = async (
    matchId: string,
    params: { text: string; imageDataUrl?: string | null }
  ) => {
    if (!currentPlayer) return;
    await poolService.addMatchComment({
      matchId,
      authorId: currentPlayer.id,
      authorName: currentPlayer.name,
      ...params,
    });
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

  /**
   * Opens the log sheet. Logging is a task, so it comes up over the arena and
   * closes again, rather than being a place you navigate to and out of.
   */
  const openMatchLogger = (options?: { playerAId?: string; playerBId?: string; challengeId?: string }) => {
    if (options) {
      if (options.playerAId) setSelectedPlayerAId(options.playerAId);
      if (options.playerBId) setSelectedPlayerBId(options.playerBId);
      setActiveChallengeId(options.challengeId);
    }
    setActiveTab('arena');
    setIsLoggerOpen(true);
  };

  const handleQuickMatchComplete = (opponent: Player) => {
    setShowQuickMatch(false);
    openMatchLogger({ playerAId: currentPlayer?.id, playerBId: opponent.id, challengeId: undefined });
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
    setSentCallout({
      opponent,
      winDelta: stakes.challengerWinDelta,
      crownBounty: stakes.crownBounty,
    });
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

    // Accepting is the handshake; the clash plays when the match is called on.
    if (status === 'declined') {
      setDeclinedDuel(challenge);
    } else {
      setAcceptedCallout(challenge);
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

  /**
   * Calls a match on. The duel plays and the card goes live; the logger stays
   * shut, because the match is only starting.
   */
  const handleStartChallenge = async (challenge: Challenge) => {
    try {
      await poolService.startChallenge(challenge.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not start the match. Please try again.');
      return;
    }
    setAcceptedDuel(challenge);
  };

  const handleCancelChallenge = async (challenge: Challenge) => {
    try {
      await poolService.cancelChallenge(challenge.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not cancel. Please try again.');
    }
  };

  const handleCancelLiveMatch = async (challengeId: string) => {
    try {
      await poolService.revertLiveChallenge(challengeId);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not cancel the match. Please try again.');
    }
  };

  const handleCheer = async (challengeId: string, emoji: string) => {
    if (!currentPlayer) return;
    await poolService.sendCheer({
      challengeId,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      emoji,
    });
  };

  const handlePredict = async (challenge: Challenge, predictedWinnerId: string, isLock: boolean) => {
    if (!currentPlayer) return;
    const alreadyVoted = challenge.predictions.some((p) => p.predictorId === currentPlayer.id);
    if (alreadyVoted) return;
    await poolService.addPrediction({
      challengeId: challenge.id,
      predictorId: currentPlayer.id,
      predictorName: currentPlayer.name,
      predictedWinnerId,
      isLock,
    });
  };

  const handlePlayChallenge = (challenge: Challenge) => {
    openMatchLogger({
      playerAId: challenge.challengerId,
      playerBId: challenge.opponentId,
      challengeId: challenge.id,
    });
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
  const outgoingChallenge = currentPlayer
    ? challenges.find(
        (challenge) =>
          challenge.status === 'pending' &&
          challenge.challengerId === currentPlayer.id &&
          !snoozedChallengeIds.includes(challenge.id)
      ) ?? null
    : null;
  const challengeInbox = incomingChallenge ?? outgoingChallenge;
  const arenaBadge = currentPlayer
    ? challenges.filter(
        (challenge) =>
          challenge.status === 'pending' &&
          (challenge.opponentId === currentPlayer.id || challenge.challengerId === currentPlayer.id)
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
          challengeBadge={arenaBadge}
          onOpenChallengeInbox={() => setShowChallengeInbox(true)}
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
                leaderboardChanges={leaderboardChanges}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onChallenge={handleChallenge}
                onAddPlayer={() => setShowAddPlayer(true)}
              />
            </div>
          )}

          {activeTab === 'arena' && (
            <div className="anim-fade">
              <ArenaView
                players={players}
                challenges={challenges.filter(
                  (challenge) =>
                    challenge.status === 'pending' ||
                    challenge.status === 'accepted' ||
                    challenge.status === 'live' ||
                    challenge.status === 'played'
                )}
                currentPlayer={currentPlayer}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onIssueChallenge={() => setChallengeTarget({})}
                onRespond={handleRespondToChallenge}
                onCancel={handleCancelChallenge}
                onPredict={handlePredict}
                onPlayChallenge={handlePlayChallenge}
                onStartChallenge={handleStartChallenge}
                onLogMatch={() => openMatchLogger()}
                nerve={league.nerve}
                onOpenLiveMatch={setActiveLiveChallengeId}
              />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="anim-fade">
              <EventsView
                matches={matches}
                players={players}
                season={currentSeason}
                seasons={seasons}
                currentPlayer={currentPlayer}
                onEditWinner={handleEditMatch}
                onDelete={handleDeleteMatch}
                onEndSeason={handleEndSeason}
                onReact={handleReactToMatch}
                onOpenComments={poolService.subscribeToMatchComments}
                onSubmitComment={handleSubmitComment}
                onDeleteComment={(matchId, commentId) => poolService.deleteMatchComment(matchId, commentId)}
              />
            </div>
          )}
        </main>

        <Navigation activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} arenaBadge={arenaBadge} />

        {isLoggerOpen && (
          <MatchLoggerSheet
            players={players}
            recentMatches={seasonMatches}
            crown={league.crown}
            playerAId={selectedPlayerAId}
            playerBId={selectedPlayerBId}
            isSubmitting={isLoggingMatch}
            onChangePlayers={(playerAId, playerBId) => {
              setSelectedPlayerAId(playerAId || undefined);
              setSelectedPlayerBId(playerBId || undefined);
            }}
            onRecordMatch={handleRecordMatch}
            onClose={() => setIsLoggerOpen(false)}
          />
        )}

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
              setActiveTab('arena');
              setAcceptedDuel(null);
            }}
          />
        )}

        {activeLiveChallengeId && (() => {
          const liveChallenge = challenges.find(
            (challenge) => challenge.id === activeLiveChallengeId && challenge.status === 'live'
          );
          if (!liveChallenge || !currentPlayer) return null;
          const view = deriveChallengeView(liveChallenge, players, currentPlayer);
          return (
            <LiveMatchScreen
              challenge={liveChallenge}
              players={players}
              challenger={view.challenger}
              opponent={view.opponent}
              isPlayer={view.isPlayer}
              myCall={view.myCall}
              forChallenger={view.forChallenger}
              forOpponent={view.forOpponent}
              total={view.total}
              challengerShare={view.challengerShare}
              challengerVoters={view.challengerVoters}
              opponentVoters={view.opponentVoters}
              lockUsedToday={hasLockOnDay(challenges, currentPlayer.id, Date.now())}
              onPredict={(predictedWinnerId, isLock) => void handlePredict(liveChallenge, predictedWinnerId, isLock)}
              onSelectPlayer={(player) => setDossierPlayer(player)}
              onPlayChallenge={() => handlePlayChallenge(liveChallenge)}
              onCancelLive={() => {
                setActiveLiveChallengeId(null);
                void handleCancelLiveMatch(liveChallenge.id);
              }}
              onCheer={(emoji) => void handleCheer(liveChallenge.id, emoji)}
              onSubscribeCheers={poolService.subscribeToCheers}
              onClose={() => setActiveLiveChallengeId(null)}
            />
          );
        })()}

        {showChallengeInbox && challengeInbox && !acceptedDuel && !declinedDuel && (
          <IncomingChallengeModal
            challenge={challengeInbox}
            players={players}
            variant={incomingChallenge ? 'incoming' : 'outgoing'}
            onAccept={incomingChallenge ? (challenge) => handleRespondToChallenge(challenge, 'accepted') : undefined}
            onDecline={incomingChallenge ? (challenge) => handleRespondToChallenge(challenge, 'declined') : undefined}
            onCancel={outgoingChallenge ? (challenge) => handleCancelChallenge(challenge) : undefined}
            onDismiss={(challenge) => {
              setSnoozedChallengeIds((prev) => [...prev, challenge.id]);
              setShowChallengeInbox(false);
            }}
          />
        )}

        {declinedDuel && <DuckChallengeOverlay onComplete={() => setDeclinedDuel(null)} />}

        {sentCallout && (
          <CalloutSentOverlay
            opponent={sentCallout.opponent}
            winDelta={sentCallout.winDelta}
            crownBounty={sentCallout.crownBounty}
            onComplete={() => setSentCallout(null)}
          />
        )}

        {acceptedCallout && !acceptedDuel && (
          <ChallengeAcceptedOverlay
            challenge={acceptedCallout}
            players={players}
            onComplete={() => setAcceptedCallout(null)}
          />
        )}

        {showAddPlayer && (
          <AddPlayerModal onAdd={handleAddPlayer} onClose={() => setShowAddPlayer(false)} />
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
