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
import {
  LeagueNotification,
  markInboxRead,
  notifyMany,
  registerForPushNotifications,
  sendEarnedNotifications,
  sendNotification,
  subscribeToInbox,
} from './services/notifications';
import { earnedNotifications } from './utils/earned';
import { ActivitySheet, ActivityToast } from './components/ActivitySheet';
import { GRANTS, addBonus, leftToday } from './utils/chips';
import { WeekAwards, awardsArchive, latestReleasedMonday } from './utils/awards';
import { WeeklyAwardsScene } from './components/WeeklyAwardsScene';
import { CupView } from './components/CupView';
import { FINAL_ROUND, Tournament, deriveCups, resolveCup, roundName, weekTournament } from './utils/tournament';
import { SHAME_STREAK } from './utils/shame';
import { FightPoster, posterReason } from './components/FightPoster';
import { DailyPairing, dayKeyOf, deriveDaily, drawPairing, todaysDaily } from './utils/daily';
import { deriveLeagueInsights, matchesInSeason, IMPLICIT_SEASON, DORMANT_AFTER_DAYS, VOTE_WINDOW_MS } from './utils/league';
import { buildMatchRecap, MatchRecap } from './utils/recap';
import { SEASON_ALREADY_CLOSED } from './services/firebase';
import { previewStakes } from './utils/stakes';
import { Ball } from './components/ui';
import { buildBadgeContext, describeUnlock, unlockKeys } from './utils/achievements';
import { BadgePop } from './components/BadgePop';

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
  /** The match-of-the-day pairings, one document per day. */
  const [dailies, setDailies] = useState<DailyPairing[]>([]);
  /** The weekly cups, one document per week. */
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  /** Coarse clock so a season countdown moves and its deadline can fire while the app is open. */
  const [clock, setClock] = useState(() => Date.now());
  const closingSeasonRef = useRef(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<{ opponentId?: string; mode?: 'challenge' | 'instant' } | null>(null);
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
  const [showActivity, setShowActivity] = useState(false);
  const [inbox, setInbox] = useState<LeagueNotification[]>([]);
  const [toast, setToast] = useState<LeagueNotification | null>(null);
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
    recap?: MatchRecap;
    unlockRows?: Array<[string, React.ReactNode]>;
  } | null>(null);
  /** Badges and tiers the current player just unlocked, shown one at a time. */
  const [unlockQueue, setUnlockQueue] = useState<string[]>([]);
  /** The fight poster on screen, if any. */
  const [posterId, setPosterId] = useState<string | null>(null);
  /** The weekly awards on screen, if any. */
  const [awardsShown, setAwardsShown] = useState<WeekAwards | null>(null);

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

  // Matches of the day: who played theirs, streaks, and the chips it paid.
  const dailyRecords = useMemo(() => deriveDaily(dailies, matches, clock), [dailies, matches, clock]);
  const cupRecords = useMemo(() => deriveCups(tournaments, matches, clock), [tournaments, matches, clock]);
  const thisCup = useMemo(() => {
    const week = weekTournament(clock).week;
    return tournaments.find((entry) => entry.week === week) ?? null;
  }, [tournaments, clock]);
  const cupState = useMemo(() => (thisCup ? resolveCup(thisCup, matches, clock) : null), [thisCup, matches, clock]);
  const chips = useMemo(() => {
    const merged = { ...league.chips, records: new Map([...league.chips.records].map(([id, record]) => [id, { ...record }])) };
    for (const [id, record] of dailyRecords) if (record.bonus) addBonus(merged, id, record.bonus);
    for (const [id, record] of cupRecords) if (record.bonus) addBonus(merged, id, record.bonus);
    for (const grant of GRANTS) for (const player of players) addBonus(merged, player.id, grant.amount);
    return merged;
  }, [league.chips, dailyRecords, cupRecords, players]);

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
        poolService.getDailies().then((loaded) => !cancelled && setDailies(loaded)).catch((error) => console.warn('Daily pairings not loaded:', error));
        poolService.getTournaments().then((loaded) => !cancelled && setTournaments(loaded)).catch((error) => console.warn('Cups not loaded:', error));
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
    return subscribeToInbox(currentPlayer.id, (items, arrived) => {
      setInbox(items);
      const latest = arrived[0];
      if (!latest) return;
      // Eyes on the app: land it in the app. Eyes elsewhere: the phone can say it.
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setToast(latest);
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(latest.title, { body: latest.body });
      }
    });
  }, [currentPlayer]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openActivity = () => {
    setToast(null);
    setShowActivity(true);
  };

  const closeActivity = () => {
    setShowActivity(false);
    // Seen is seen. Reading a note does not need a tap per line.
    void markInboxRead(inbox.filter((item) => !item.read).map((item) => item.id)).catch(() => undefined);
  };

  const handleSelectActivity = (item: LeagueNotification) => {
    closeActivity();
    if (item.challengeId) {
      const challenge = challenges.find((entry) => entry.id === item.challengeId);
      if (challenge && (challenge.status === 'live' || challenge.status === 'accepted')) {
        setActiveTab('arena');
        return;
      }
      if (challenge && challenge.status === 'pending') {
        setShowChallengeInbox(true);
        return;
      }
    }
    setActiveTab(item.type === 'prediction_result' || item.type === 'match_live' ? 'arena' : 'leaderboard');
  };

  // You are almost always one of the two people in a match you are logging.
  // Defaulting to the top of the table instead made a stray tap credit a result
  // to the leaders.
  useEffect(() => {
    if (currentPlayer && !selectedPlayerAId) setSelectedPlayerAId(currentPlayer.id);
  }, [currentPlayer, selectedPlayerAId]);

  // A big match going live puts its poster up by itself, once per phone.
  useEffect(() => {
    if (!currentPlayer || posterId) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem('office_8ball_posters_seen') ?? '[]');
    } catch {
      seen = [];
    }
    const big = challenges.find(
      (challenge) => challenge.status === 'live' && !seen.includes(challenge.id) && posterReason(challenge, players, seasonMatches, league.crown)
    );
    if (!big) return;
    try {
      localStorage.setItem('office_8ball_posters_seen', JSON.stringify([...seen, big.id].slice(-50)));
    } catch {
      // Remembering is a nicety; worst case the poster shows twice.
    }
    setPosterId(big.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges, currentPlayer]);

  // The day's pairing is drawn by whichever phone opens the app first that day.
  const today = dayKeyOf(clock);
  useEffect(() => {
    if (!currentPlayer || players.length < 2 || dailies.some((daily) => daily.day === today)) return;
    const active = players.filter((player) => !league.insights.get(player.id)?.isDormant).map((player) => player.id);
    if (active.length < 2) return;
    let cancelled = false;
    poolService
      .ensureDaily(drawPairing(today, active))
      .then((daily) => !cancelled && setDailies((prev) => [...prev.filter((entry) => entry.day !== daily.day), daily]))
      .catch((error) => console.warn('Daily pairing not created:', error));
    return () => {
      cancelled = true;
    };
    // league changes with every match; the pairing only needs the roster once a day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer, players.length, today, dailies.length]);

  // The week's cup: created on a weekday's first open, drawn on the first open after noon Monday.
  const upsertCup = (cup: Tournament) => setTournaments((prev) => [...prev.filter((entry) => entry.week !== cup.week), cup]);
  const cupWeek = weekTournament(clock);
  const cupDue = !!thisCup && thisCup.field === null && clock >= thisCup.closesAt;
  useEffect(() => {
    if (!currentPlayer || isLoading) return;
    const weekday = new Date(clock).getDay();
    if (!thisCup && weekday >= 1 && weekday <= 5) {
      poolService.ensureTournament(cupWeek).then(upsertCup).catch((error) => console.warn('Cup not created:', error));
      return;
    }
    if (!cupDue || !thisCup) return;
    poolService
      .drawTournament(thisCup.week)
      .then((cup) => {
        upsertCup(cup);
        // Only the phone that actually made the draw tells the field.
        if (cup.field && cup.field.length > 0 && cup.drawnAt && !thisCup.drawnAt) {
          void notifyMany(cup.field.filter((id) => id !== currentPlayer.id), {
            type: 'tournament',
            title: '🏆 The weekly cup is drawn',
            body: `${cup.field.length} in. Round 1 until Tuesday 17:00. Check who you got.`,
          });
        }
      })
      .catch((error) => console.warn('Cup not drawn:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cupWeek.week, !!thisCup, cupDue]);

  // Friday's awards: every finished week, and the latest one shown once on its own.
  const awards = useMemo(
    () => awardsArchive(players, matches, challenges, chips, clock),
    // The clock only matters when a Friday rolls over, so key it by the week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, matches, challenges, chips, dayKeyOf(latestReleasedMonday(clock).getTime())]
  );
  const awardRecords = useMemo(() => {
    const out = new Map<string, Array<{ week: string; key: string }>>();
    for (const week of awards) for (const award of week.awards) out.set(award.playerId, [...(out.get(award.playerId) ?? []), { week: week.week, key: award.key }]);
    return out;
  }, [awards]);
  const latestAwards = awards[0]?.week === dayKeyOf(latestReleasedMonday(clock).getTime()) ? awards[0] : null;
  useEffect(() => {
    if (!currentPlayer || isLoading || !latestAwards) return;
    const SEEN = 'office_8ball_awards_seen';
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN);
    } catch {
      // Private mode: show it, worst case twice.
    }
    if (seen === latestAwards.week) return;
    try {
      localStorage.setItem(SEEN, latestAwards.week);
    } catch {
      // As above.
    }
    setAwardsShown(latestAwards);
    // The first phone to open after the release tells the office, if it is still fresh news.
    if (Date.now() - latestAwards.releasedAt < 3 * 86_400_000) {
      poolService
        .claimAwardsAnnouncement(latestAwards.week)
        .then((claimed) => {
          if (!claimed) return;
          const lead = latestAwards.awards[0];
          const name = players.find((player) => player.id === lead.playerId)?.name.split(' ')[0] ?? '';
          void notifyMany(players.map((player) => player.id).filter((id) => id !== currentPlayer.id), {
            type: 'weekly_awards',
            title: '🎖️ The weekly awards are out',
            body: `${lead.e} ${lead.title}: ${name}, and ${latestAwards.awards.length - 1} more. Open the app to see who got what.`,
          });
        })
        .catch((error) => console.warn('Awards not announced:', error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, latestAwards?.week]);

  // When a round is over, the first phone to notice pairs the next one and tells the players.
  const nextKey = cupState?.next ? `${thisCup?.week}:${cupState.next[0].round}` : null;
  useEffect(() => {
    if (!thisCup || !cupState?.next || !currentPlayer) return;
    const next = cupState.next;
    poolService
      .advanceTournament(thisCup.week, next)
      .then(({ tournament, stored }) => {
        upsertCup(tournament);
        if (!stored) return;
        const final = next[0].round === FINAL_ROUND;
        const name = (id: string) => players.find((player) => player.id === id)?.name.split(' ')[0] ?? '?';
        void notifyMany(next.flatMap((pairing) => [pairing.a, pairing.b]).filter((id) => id && id !== currentPlayer.id), {
          type: 'tournament',
          title: final ? `🏆 Cup final: ${name(next[0].a)} vs ${name(next[0].b)}` : `🏆 Cup ${roundName(next[0].round)} is paired`,
          body: final ? 'Friday 17:00 is the deadline. Winner takes the cup.' : 'Check who you got. Thursday 12:00 is the deadline.',
        });
      })
      .catch((error) => console.warn('Cup round not paired:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextKey]);

  const handleJoinCup = async () => {
    if (!currentPlayer || !thisCup) return;
    try {
      upsertCup(await poolService.joinTournament(thisCup.week, currentPlayer.id));
    } catch (error) {
      console.warn('Could not join the cup:', error);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshPlayers = async () => {
    setPlayers(await poolService.getPlayers());
  };

  const handleRecordMatch = async (
    playerAId: string,
    playerBId: string,
    winnerId: string,
    modifiers: MatchModifier,
    winnerBall?: 'solids' | 'stripes'
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
        winnerBall,
      });

      // Everything the payoff screen needs is derivable from before and after.
      const matchesAfter = [result.match, ...matches];
      const leagueAfter = deriveLeagueInsights(
        result.players,
        matchesInSeason(matchesAfter, currentSeason),
        challenges,
        Date.now(),
        currentSeason.startingElo
      );
      const recap = buildMatchRecap({
        match: result.match,
        playersBefore: players,
        playersAfter: result.players,
        matchesAfter,
        challenge: challenges.find((challenge) => challenge.id === activeChallengeId) ?? null,
        leagueBefore: league,
        leagueAfter,
      });

      // What the result unlocked, for both players: badges and achievement tiers.
      const unlockRows: Array<[string, React.ReactNode]> = [];
      const myUnlocks: string[] = [];
      for (const id of [result.match.winnerId, result.match.loserId]) {
        const before = players.find((player) => player.id === id);
        const after = result.players.find((player) => player.id === id);
        if (!before || !after) continue;
        const start = currentSeason.startingElo[id] ?? 1000;
        const dailyBefore = deriveDaily(dailies, matches, Date.now()).get(id);
        const dailyAfter = deriveDaily(dailies, matchesAfter, Date.now()).get(id);
        const cupsBefore = deriveCups(tournaments, matches, Date.now()).get(id);
        const cupsAfter = deriveCups(tournaments, matchesAfter, Date.now()).get(id);
        const had = unlockKeys(buildBadgeContext(before, matches, challenges, start, undefined, dailyBefore, cupsBefore));
        const fresh = [...unlockKeys(buildBadgeContext(after, matchesAfter, challenges, start, undefined, dailyAfter, cupsAfter))].filter((key) => !had.has(key));
        for (const key of fresh) {
          const unlock = describeUnlock(key);
          if (!unlock) continue;
          unlockRows.push([unlock.label, `${unlock.e} ${unlock.name}  ${after.name.split(' ')[0]}`]);
          if (id === currentPlayer?.id) myUnlocks.push(key);
        }
      }

      // The cup final just went in: the whole office hears who lifted it.
      if (thisCup && !cupState?.champion) {
        const champion = resolveCup(thisCup, matchesAfter, Date.now())?.champion;
        const winner = champion ? result.players.find((player) => player.id === champion) : null;
        if (winner) {
          void notifyMany(result.players.map((player) => player.id).filter((id) => id !== currentPlayer?.id), {
            type: 'tournament',
            title: `🏆 ${winner.name.split(' ')[0]} wins the weekly cup`,
            body: 'Trophy in the cabinet and chips in the stack.',
          });
        }
      }

      // Three losses in a row: the office hears about it, once, on the third.
      const loserAfter = result.players.find((player) => player.id === result.match.loserId);
      if (loserAfter && loserAfter.currentStreak === -SHAME_STREAK) {
        void notifyMany(
          result.players.map((player) => player.id).filter((id) => id !== currentPlayer?.id),
          {
            type: 'shame',
            title: `🤡 ${loserAfter.name.split(' ')[0]} is on the wall of shame`,
            body: `${SHAME_STREAK} losses in a row. One win takes the clown off.`,
          }
        ).catch((error) => console.warn('Shame not delivered:', error));
      }

      setPlayers(result.players);
      setMatches((prev) => [result.match, ...prev]);
      setMatchResult({ ...result, recap, unlockRows });
      if (myUnlocks.length) setUnlockQueue((prev) => [...prev, ...myUnlocks]);
      setIsLoggerOpen(false);

      // Told only to the people the result happened to. Best effort: a
      // missed message is not a reason to fail the log.
      void sendEarnedNotifications(
        earnedNotifications({
          match: result.match,
          recap,
          players: result.players,
          challenge: challenges.find((challenge) => challenge.id === activeChallengeId) ?? null,
          crownChangedHands: result.crownChangedHands,
          loggedBy: currentPlayer.id,
        }),
        result.match.id
      ).catch((error) => console.warn('Result notifications not delivered:', error));

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
    ball?: number;
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
    updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference' | 'ball'>
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

  const handleScheduleSeasonEnd = async (endsAt: number | null) => {
    setSeasons(await poolService.scheduleSeasonEnd(currentSeason, endsAt));
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
    }
    // Only a logger opened from a specific challenge settles that challenge.
    setActiveChallengeId(options?.challengeId);
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

  /**
   * The game is starting now. One tap creates the live match, plays the clash,
   * pings the room that calls are open, and leaves the result to be logged from
   * the same card when it is over.
   */
  const handleStartInstantMatch = async (opponent: Player, stakes: ChallengeStakes) => {
    if (!currentPlayer || sendingChallengeRef.current) return;
    sendingChallengeRef.current = true;
    let challenge: Challenge;
    try {
      challenge = await poolService.startInstantMatch({ challenger: currentPlayer, opponent, stakes });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not start the match.');
      return;
    } finally {
      sendingChallengeRef.current = false;
    }
    setChallengeTarget(null);
    setSelectedPlayerAId(currentPlayer.id);
    setSelectedPlayerBId(opponent.id);
    setActiveChallengeId(challenge.id);
    setActiveTab('arena');
    setAcceptedDuel(challenge);

    const room = players
      .filter((player) => player.id !== currentPlayer.id && player.id !== opponent.id)
      .map((player) => player.id);
    await notifyMany(room, {
      type: 'match_live',
      title: `${currentPlayer.name.split(' ')[0]} vs ${opponent.name.split(' ')[0]} — on the table now`,
      body: `Calls are open for the next ${Math.round(VOTE_WINDOW_MS / 60_000)} minutes.`,
      challengeId: challenge.id,
    }).catch((error) => console.warn('Live match ping not delivered:', error));
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

  const handleSendChatMessage = async (challengeId: string, text: string) => {
    if (!currentPlayer) return;
    await poolService.sendChatMessage({
      challengeId,
      authorId: currentPlayer.id,
      authorName: currentPlayer.name,
      text,
    });
  };

  const handlePredict = async (challenge: Challenge, predictedWinnerId: string, stake: number, ball?: 'solids' | 'stripes') => {
    if (!currentPlayer) return;
    const alreadyVoted = challenge.predictions.some((p) => p.predictorId === currentPlayer.id);
    if (alreadyVoted) return;
    await poolService.addPrediction({
      challengeId: challenge.id,
      predictorId: currentPlayer.id,
      predictorName: currentPlayer.name,
      predictedWinnerId,
      stake,
      ball,
    }).catch((error) => alert(error instanceof Error ? error.message : 'Could not place that call.'));
  };

  const handlePlayChallenge = (challenge: Challenge) => {
    openMatchLogger({
      playerAId: challenge.challengerId,
      playerBId: challenge.opponentId,
      challengeId: challenge.id,
    });
  };

  useEffect(() => {
    if (!currentSeason.endsAt || clock < currentSeason.endsAt) return;
    if (closingSeasonRef.current || players.length === 0) return;
    closingSeasonRef.current = true;
    handleEndSeason()
      .catch((error: unknown) => {
        // Another client got there first. Just pick up the season it opened.
        if (error instanceof Error && error.message === SEASON_ALREADY_CLOSED) return;
        console.error('Timed season close failed:', error);
      })
      .then(async () => setSeasons(await poolService.getSeasons()))
      .finally(() => {
        closingSeasonRef.current = false;
      });
    // handleEndSeason reads the latest league state via closure; re-running on
    // every player change would only re-check the same deadline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, currentSeason.endsAt, currentSeason.id]);

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
  // The cup tab gets a dot when there is something to do there.
  const cupBadge =
    !!currentPlayer &&
    !!thisCup &&
    ((clock >= thisCup.opensAt && clock < thisCup.closesAt && !thisCup.entrants.some((entry) => entry.id === currentPlayer.id)) ||
      !!cupState && [...(cupState.rounds[cupState.current] ?? []), ...(cupState.current === FINAL_ROUND && cupState.final ? [cupState.final] : [])].some((game) => !game.winnerId && !game.bye && [game.a, game.b].includes(currentPlayer.id)));
  const arenaBadge = currentPlayer
    ? challenges.filter(
        (challenge) =>
          challenge.status === 'pending' &&
          (challenge.opponentId === currentPlayer.id || challenge.challengerId === currentPlayer.id)
      ).length
    : 0;
  const unreadCount = inbox.filter((item) => !item.read).length;
  const activityBadge = unreadCount + (incomingChallenge ? 1 : 0);

  if (showSplash || isLoading) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg p-6 text-center select-none">
        <div className="grid justify-items-center gap-5">
          <span className="anim-pop [&>span]:animate-spin [&>span]:[animation-duration:1.4s]">
            <Ball n={8} size={88} />
          </span>
          <p className="anim-fade text-xs font-extrabold uppercase tracking-[0.14em] text-white/55">Racking up</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="grid w-full max-w-md justify-items-center gap-3 rounded-2xl bg-card p-6 text-center">
          <Ball n={8} size={64} />
          <h1 className="text-2xl">Can't reach the league</h1>
          <p className="text-sm text-white/70">The app loaded, but the database did not answer. Check the Firebase project settings and that Firestore is enabled.</p>
          <pre className="w-full overflow-x-auto rounded-xl bg-surface p-3 text-left text-[11px] tabular-nums text-white/70">{loadError}</pre>
          <button type="button" onClick={() => window.location.reload()} className="press h-12 w-full rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
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
    <div className="flex min-h-screen justify-center bg-bg text-white">
      <div className="relative flex min-h-screen w-full max-w-md flex-col bg-bg">
        <Header
          activeTab={activeTab}
          currentUser={currentPlayer}
          matchesCount={matches.length}
          onOpenProfile={() => setDossierPlayer(currentPlayer)}
          onQuickMatch={() => setShowQuickMatch(true)}
          activityBadge={activityBadge}
          onOpenActivity={openActivity}
        />

        <main className="flex-1 overflow-x-hidden px-3 pt-1 pb-[var(--safe-bottom)]">
          {activeTab === 'leaderboard' && (
            <div className="anim-fade">
              <LeaderboardView
                players={players}
                matches={seasonMatches}
                league={league}
                season={currentSeason}
                currentPlayer={currentPlayer}
                now={clock}
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
                challenges={challenges}
                currentPlayer={currentPlayer}
                onSelectPlayer={(player) => setDossierPlayer(player)}
                onIssueChallenge={() => setChallengeTarget({})}
                onRespond={handleRespondToChallenge}
                onCancel={handleCancelChallenge}
                onPredict={handlePredict}
                onPlayChallenge={handlePlayChallenge}
                onStartChallenge={handleStartChallenge}
                onLogMatch={() => openMatchLogger()}
                onInstantMatch={() => setChallengeTarget({ mode: 'instant' })}
                chips={chips}
                daily={(() => {
                  const mine = todaysDaily(dailies, currentPlayer.id, clock);
                  if (!mine) return null;
                  const record = dailyRecords.get(currentPlayer.id);
                  const result = record?.history.find((entry) => entry.day === today);
                  return {
                    bye: mine.bye,
                    opponent: mine.opponentId ? players.find((player) => player.id === mine.opponentId) ?? null : null,
                    played: !!result?.played,
                    won: !!result?.won,
                    streak: record?.streak ?? 0,
                  };
                })()}
                onPlayDaily={(opponentId) => setChallengeTarget({ opponentId, mode: 'instant' })}
                onOpenLiveMatch={setActiveLiveChallengeId}
              />
            </div>
          )}

          {activeTab === 'cup' && (
            <div className="anim-fade">
              <CupView
                tournaments={tournaments}
                current={thisCup}
                currentState={cupState}
                records={cupRecords}
                matches={matches}
                players={players}
                currentPlayer={currentPlayer}
                now={clock}
                onJoin={handleJoinCup}
                onPlay={(opponentId) => setChallengeTarget({ opponentId, mode: 'instant' })}
                onSelectPlayer={(player) => setDossierPlayer(player)}
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
                onScheduleSeasonEnd={handleScheduleSeasonEnd}
                now={clock}
                onReact={handleReactToMatch}
                onOpenComments={poolService.subscribeToMatchComments}
                onSubmitComment={handleSubmitComment}
                onDeleteComment={(matchId, commentId) => poolService.deleteMatchComment(matchId, commentId)}
                awards={awards}
                onOpenAwards={setAwardsShown}
                detail={{
                  challenges,
                  payouts: chips.payouts,
                  dailies,
                  tournaments,
                  subscribeChat: poolService.subscribeToChatMessages,
                  subscribeCheers: poolService.subscribeToCheers,
                }}
              />
            </div>
          )}
        </main>

        <Navigation activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} arenaBadge={arenaBadge} cupBadge={cupBadge} />

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
          allMatches={matches}
          challenges={challenges}
          dailyRecords={dailyRecords}
          cupRecords={cupRecords}
          awardRecords={awardRecords}
          startingElo={currentSeason.startingElo}
          currentPlayerId={currentPlayer.id}
          onSelectPlayer={(player) => setDossierPlayer(player)}
          onEditProfile={() => {
            setDossierPlayer(null);
            setShowProfile(true);
          }}
        />

        <MatchSuccessModal
          result={matchResult}
          winner={matchResult ? players.find((player) => player.id === matchResult.match.winnerId) ?? null : null}
          extraRows={matchResult?.unlockRows}
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
              chipsLeft={leftToday(challenges, currentPlayer.id, Date.now())}
              pot={league.chips.pools.get(liveChallenge.id) ?? 0}
              onPredict={(predictedWinnerId, stake, ball) => void handlePredict(liveChallenge, predictedWinnerId, stake, ball)}
              onSelectPlayer={(player) => setDossierPlayer(player)}
              onPlayChallenge={() => handlePlayChallenge(liveChallenge)}
              onCancelLive={() => {
                setActiveLiveChallengeId(null);
                void handleCancelLiveMatch(liveChallenge.id);
              }}
              onCheer={(emoji) => void handleCheer(liveChallenge.id, emoji)}
              onSubscribeCheers={poolService.subscribeToCheers}
              onSendChatMessage={handleSendChatMessage}
              onSubscribeChat={poolService.subscribeToChatMessages}
              onClose={() => setActiveLiveChallengeId(null)}
              onPoster={() => setPosterId(liveChallenge.id)}
            />
          );
        })()}

        {awardsShown && <WeeklyAwardsScene week={awardsShown} players={players} onClose={() => setAwardsShown(null)} />}

        {posterId && !acceptedDuel && (() => {
          const challenge = challenges.find((entry) => entry.id === posterId);
          if (!challenge) return null;
          return (
            <FightPoster
              challenge={challenge}
              players={players}
              matches={seasonMatches}
              crown={league.crown}
              pot={chips.pools.get(challenge.id) ?? 0}
              onClose={() => setPosterId(null)}
            />
          );
        })()}

        {!matchResult && unlockQueue.length > 0 && (
          <BadgePop key={unlockQueue[0]} unlockKey={unlockQueue[0]} onDone={() => setUnlockQueue((prev) => prev.slice(1))} />
        )}

        {showActivity && (
          <ActivitySheet
            items={inbox}
            pendingChallenge={incomingChallenge}
            now={clock}
            onOpenChallenge={() => {
              closeActivity();
              setShowChallengeInbox(true);
            }}
            onSelect={handleSelectActivity}
            onClose={closeActivity}
          />
        )}

        {toast && !showActivity && (
          <ActivityToast item={toast} onOpen={openActivity} onDismiss={() => setToast(null)} />
        )}

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
            mode={challengeTarget.mode ?? 'challenge'}
            matches={seasonMatches}
            onSend={challengeTarget.mode === 'instant' ? handleStartInstantMatch : handleSendChallenge}
            onClose={() => setChallengeTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
