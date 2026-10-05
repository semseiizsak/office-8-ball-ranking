import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TabType, Player, MatchRecord, MatchModifier, BallPreference, Challenge, ChallengeStakes,
  Season, SeasonStanding, SeasonTitle,
} from './types';
import { poolService } from './services/poolService';

/** Cups from this week on give every player in the field a pack when they finish. */
const CUP_PACKS_FROM = '2026-09-28';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { LeaderboardView } from './components/LeaderboardView';
import { LobbyChat } from './components/LobbyChat';
import { PullToRefresh } from './components/PullToRefresh';
import { MatchLoggerSheet } from './components/MatchLoggerSheet';
import { ArenaView, deriveChallengeView, LiveMatchScreen, RichestList } from './components/ArenaView';
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
import { Card, Collector, Pack, PackKind, ShopTier, Trade, cardStats, earnedPackReason, photoIdOf, specialAwards, weekKeyOf } from './utils/cards';
import { CollectionView } from './components/cards/CollectionView';
import { OfflineReview } from './components/OfflineReview';
import {
  OfflineMatch,
  isDatabaseDown,
  loadOutbox,
  planSync,
  queueMatch,
  saveOutbox,
} from './utils/outbox';
import { WeekAwards, awardsArchive, latestReleasedMonday } from './utils/awards';
import { WeeklyAwardsScene } from './components/WeeklyAwardsScene';
import { SeasonWrapScene } from './components/SeasonWrapScene';
import { SeasonLookSheet } from './components/SeasonLookSheet';
import { CupView } from './components/CupView';
import { Tournament, allGames, deriveCups, mondayOf, resolveCup, weekTournament } from './utils/tournament';
import { SHAME_STREAK } from './utils/shame';
import { FightPoster, posterReason } from './components/FightPoster';
import { DailyPairing, dayKeyOf, deriveDaily, drawPairing, todaysDaily } from './utils/daily';
import { deriveLeagueInsights, matchesInSeason, IMPLICIT_SEASON, DORMANT_AFTER_DAYS, VOTE_WINDOW_MS } from './utils/league';
import { buildMatchRecap, MatchRecap } from './utils/recap';
import { SEASON_ALREADY_CLOSED } from './services/firebase';
import { previewStakes } from './utils/stakes';
import { Ball, Sheet } from './components/ui';
import { MessageCircle } from 'lucide-react';
import { BADGE, buildBadgeContext, describeUnlock, unlockKeys } from './utils/achievements';
import { rewardFor } from './utils/rewards';
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
  /** Player cards: every card, every pack, the collectors and the trades. */
  const [cards, setCards] = useState<Card[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  /** Profile photos as they were printed on cards, by photo id. */
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  /** Until both have arrived, nobody can tell what has already been paid out. */
  const [cardsSeen, setCardsSeen] = useState({ cards: false, packs: false, photos: false });
  const cardsLoading = !cardsSeen.cards || !cardsSeen.packs || !cardsSeen.photos;
  /** The weekly cups, one document per week. */
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  /** Coarse clock so a season countdown moves and its deadline can fire while the app is open. */
  const [clock, setClock] = useState(() => Date.now());
  /** Set by the kiosk's join QR (`?join=1`) so a brand-new phone lands straight on "add yourself". */
  const joinMode = useMemo(() => new URLSearchParams(window.location.search).get('join') === '1', []);
  const closingSeasonRef = useRef(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Results logged while the database could not take them, kept on this phone. */
  const [outbox, setOutbox] = useState<OfflineMatch[]>(() => loadOutbox());
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  // The office chat opens from the header on Ranks; the badge counts lines
  // from others since it was last opened, read only while Ranks is showing.
  const [showChat, setShowChat] = useState(false);
  const [lobbyLines, setLobbyLines] = useState<Array<{ authorId: string; createdAt: number }>>([]);
  const [chatReadAt, setChatReadAt] = useState(() => {
    try {
      return Number(localStorage.getItem('lobbyReadAt') ?? 0);
    } catch {
      return 0;
    }
  });
  const markChatRead = () => {
    const at = Date.now();
    setChatReadAt(at);
    try {
      localStorage.setItem('lobbyReadAt', String(at));
    } catch {
      // Private mode: the badge just resets next visit.
    }
  };
  const openChat = () => {
    setShowChat(true);
    markChatRead();
  };
  const closeChat = () => {
    setShowChat(false);
    markChatRead();
  };
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
  /** The season wrap on screen, if any. */
  const [wrapSeason, setWrapSeason] = useState<Season | null>(null);

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
    for (const collector of collectors) if (collector.duplicateChips) addBonus(merged, collector.id, collector.duplicateChips);
    for (const collector of collectors) if (collector.spentChips) addBonus(merged, collector.id, -collector.spentChips);
    return merged;
  }, [league.chips, dailyRecords, cupRecords, players, collectors]);

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

    const liveFeeds: Array<() => void> = [];
    /** Opens a live feed and resolves with its first answer from the server, not the cache. */
    const firstFromServer = <T,>(
      subscribe: (onChange: (items: T[], fromServer: boolean) => void, onError: (error: Error) => void) => () => void,
      set: (items: T[]) => void
    ) =>
      new Promise<T[]>((resolve, reject) => {
        liveFeeds.push(
          subscribe((items, fromServer) => {
            if (cancelled) return;
            set(items);
            if (fromServer) resolve(items);
          }, reject)
        );
      });

    async function loadData() {
      try {
        // Matches and challenges arrive through the live feeds the app keeps
        // open anyway. Reading them once up front and then again through the
        // feeds paid for every document twice on every open.
        const [loadedPlayers, loadedMatches, loadedChallenges, loadedSeasons] = await withTimeout(
          Promise.all([
            poolService.getPlayers(),
            firstFromServer(poolService.subscribeToMatches, setMatches),
            firstFromServer(poolService.subscribeToChallenges, setChallenges),
            poolService.getSeasons(),
          ])
        );
        void poolService
          .reconcileChallengesWithMatches(loadedChallenges, loadedMatches)
          .catch((error) => console.warn('Challenges not reconciled:', error));
        if (cancelled) return;
        setPlayers(loadedPlayers);
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
        const code = (error as { code?: string } | null)?.code;
        setLoadError(
          code === 'resource-exhausted'
            ? 'Firestore: quota exceeded.'
            : code
            ? `Firestore: ${code.replace(/-/g, ' ')}.`
            : error instanceof Error
            ? error.message.slice(0, 120)
            : 'Could not reach the league database.'
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
      liveFeeds.forEach((stop) => stop());
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 650);
    return () => window.clearTimeout(timer);
  }, []);

  // The arena and the match feed stay live through the feeds opened at load.

  // Your packs, the collectors (chips) and the trades are small and feed the
  // nav badges, so they stay live.
  useEffect(() => {
    if (!currentPlayer) return;
    const off = [
      poolService.subscribeToPacks(currentPlayer.id, (next) => {
        setPacks(next);
        setCardsSeen((seen) => ({ ...seen, packs: true }));
      }),
      poolService.subscribeToCollectors(setCollectors),
      poolService.subscribeToTrades(setTrades),
    ];
    return () => off.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id]);

  // Every card in the office and every photo printed on them are the heavy
  // part: thousands of documents and the images themselves. Every phone used
  // to follow them all the time, so each pack opened anywhere was paid for by
  // every open phone. Now only a phone looking at the cards listens.
  const watchingCards = !!currentPlayer && activeTab === 'collection';
  useEffect(() => {
    if (!watchingCards) return;
    const off = [
      poolService.subscribeToCards((next) => {
        setCards(next);
        setCardsSeen((seen) => ({ ...seen, cards: true }));
      }),
      poolService.subscribeToPhotos((next) => {
        setPhotos(next);
        setCardsSeen((seen) => ({ ...seen, photos: true }));
      }),
    ];
    return () => off.forEach((stop) => stop());
  }, [watchingCards]);

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
      .drawTournament(thisCup.week, Object.fromEntries(players.map((player) => [player.id, player.elo])))
      .then((cup) => {
        upsertCup(cup);
        // Only the phone that actually made the draw tells the field.
        if (cup.field && cup.field.length > 0 && cup.drawnAt && !thisCup.drawnAt) {
          void notifyMany(cup.field.filter((id) => id !== currentPlayer.id), {
            type: 'tournament',
            title: '🏆 The weekly cup is drawn',
            body: `${cup.field.length} in, seeded by Elo. Check who you got.`,
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
  // Packs for the week: the free one, the earned one once it is earned, and
  // the champion's. Each is one document, so asking twice never makes two.
  const cardWeek = weekKeyOf(clock);
  const earned = useMemo(() => {
    if (!currentPlayer) return null;
    const monday = mondayOf(clock).getTime();
    const start = currentSeason.startingElo[currentPlayer.id] ?? 1000;
    const before = unlockKeys(buildBadgeContext(currentPlayer, matches.filter((m) => m.timestamp < monday), challenges, start));
    const now = unlockKeys(buildBadgeContext(currentPlayer, matches, challenges, start));
    const newTierThisWeek = [...now].some((key) => key.startsWith('t:') && !before.has(key));
    const dailyDaysPlayed = (dailyRecords.get(currentPlayer.id)?.history ?? []).filter((entry) => entry.played).map((entry) => entry.day);
    return earnedPackReason({ playerId: currentPlayer.id, matches, now: clock, newTierThisWeek, dailyDaysPlayed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, matches, challenges, dailyRecords, cardWeek]);
  const champion = !!currentPlayer && cupState?.champion === currentPlayer.id;
  useEffect(() => {
    if (!currentPlayer || isLoading || !cardsSeen.packs) return;
    // Only ask the database for a pack this phone does not already see.
    const make = (kind: PackKind, reason?: string, slot = 1) =>
      packs.some((pack) => pack.id === poolService.packIdOf(currentPlayer.id, cardWeek, kind, slot))
        ? undefined
        : poolService.ensurePack(currentPlayer.id, cardWeek, kind, reason, slot).catch((error) => console.warn('Pack not created:', error));
    void make('weekly');
    if (earned) void make('earned', earned.reason);
    // The cup champion gets three packs.
    if (champion) for (const slot of [1, 2, 3]) void make('champion', 'Weekly cup champion', slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsSeen.packs, cardWeek, earned?.reason, champion]);

  // What a card of each player says right now.
  const cardStatsById = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, cardStats(player, seasonMatches, challenges)])),
    [players, seasonMatches, challenges]
  );

  // Closed seasons the current player finished first in.
  const seasonTitles = useMemo(
    () => (currentPlayer ? seasons.filter((season) => season.endedAt !== null && season.standings.find((row) => row.rank === 1)?.playerId === currentPlayer.id) : []),
    [seasons, currentPlayer?.id]
  );
  // The season champion gets five reward packs; ids are the season, so never twice.
  useEffect(() => {
    if (!currentPlayer || isLoading || !cardsSeen.packs) return;
    for (const season of seasonTitles) {
      for (const i of [1, 2, 3, 4, 5]) {
        const key = `season-${season.id}-${i}`;
        if (packs.some((pack) => pack.id === `${currentPlayer.id}_reward_${key.replace(/[^a-z0-9]/gi, '-')}`)) continue;
        void poolService.ensureRewardPack(currentPlayer.id, key, `${season.name} champion`, 'epic').catch((error) => console.warn('Season packs not given:', error));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsSeen.packs, seasonTitles]);

  // One reward pack for everyone who played a closed season, and for everyone
  // in the field of a finished cup (from the week this started, so earlier
  // cups do not pay out all at once). Ids are the event, so never twice.
  const packsAsked = useRef(new Set<string>());
  useEffect(() => {
    if (!currentPlayer || isLoading || !cardsSeen.packs) return;
    const give = (key: string, label: string) => {
      const id = `${currentPlayer.id}_reward_${key.replace(/[^a-z0-9]/gi, '-')}`;
      // Asked once per open: the clock ticks before the new pack shows up.
      if (packsAsked.current.has(id) || packs.some((pack) => pack.id === id)) return;
      packsAsked.current.add(id);
      void poolService.ensureRewardPack(currentPlayer.id, key, label).catch((error) => console.warn('Pack not given:', error));
    };
    for (const season of seasons) {
      if (season.endedAt !== null && season.standings.some((row) => row.playerId === currentPlayer.id)) give(`season-${season.id}-played`, `${season.name} is over`);
    }
    for (const cup of tournaments) {
      if (cup.week < CUP_PACKS_FROM || !cup.field?.includes(currentPlayer.id)) continue;
      const state = resolveCup(cup, matches, clock);
      if (state && (state.champion || state.unfinished)) give(`cup-${cup.week}-played`, 'Played the weekly cup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsSeen.packs, seasons, tournaments, matches.length, clock]);

  // Special editions the current player has earned and not yet received.
  useEffect(() => {
    if (!currentPlayer || isLoading || cardsLoading) return;
    const cupTitles = tournaments
      .map((cup) => ({ week: cup.week, state: resolveCup(cup, matches, clock) }))
      .filter((entry) => entry.state?.champion === currentPlayer.id)
      .map((entry) => ({ week: entry.week }));
    const due = specialAwards({
      playerId: currentPlayer.id,
      matches: seasonMatches,
      crownHolderId: league.crown.holderId,
      crownSince: league.crown.heldSince,
      cupTitles,
      seasonTitles: seasonTitles.map((season) => ({ seasonId: season.id, name: season.name })),
      seasonStartedAt: currentSeason.startedAt,
      weeklyAwards: awardRecords.get(currentPlayer.id) ?? [],
    }).filter((award) => !cards.some((card) => card.id === award.id));
    for (const award of due) {
      // A season champion card is printed as of the season it was won in: its stats and its photo.
      const won = award.type === 'season' ? seasonTitles.find((season) => award.id === `season-${currentPlayer.id}-${season.id}`) : undefined;
      const wonPhoto = won && cards.find((card) => card.playerId === currentPlayer.id && card.seasonId === won.id && card.photoId && card.photoId !== 'none')?.photoId;
      void poolService
        .grantSpecial({
          award,
          stats: won ? cardStats(currentPlayer, matchesInSeason(matches, won), challenges) : cardStatsById[currentPlayer.id],
          season: won?.name ?? currentSeason.name,
          seasonId: won?.id ?? currentSeason.id,
          photo: wonPhoto ? { id: wonPhoto } : photoShots[currentPlayer.id],
        })
        .catch((error) => console.warn('Special card not granted:', error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsLoading, seasonMatches.length, league.crown.holderId, awardRecords, tournaments.length, cards.length, seasonTitles]);

  // Each player's photo right now, as it would be printed on a new card.
  // The current season always tracks a player's live photo — change it, and
  // every card from this season updates to match. A closed season's cards
  // keep whatever photo they were printed with; only this season is live.
  const photoShots = useMemo(() => {
    // `data` rides along only when the photo store does not have it yet, so a
    // photo is written once, never again per card.
    const out: Record<string, { id: string; data?: string }> = {};
    for (const player of players) {
      if (!player.avatarUrl) continue;
      const id = photoIdOf(player.avatarUrl);
      out[player.id] = photos.has(id) ? { id } : { id, data: player.avatarUrl };
    }
    return out;
  }, [players, photos]);

  // Cards pulled this season with a photo other than the player's current one
  // get backfilled to match — the mechanism that keeps the current season live.
  useEffect(() => {
    if (!currentPlayer || isLoading || cardsLoading || photos.size === 0) return;
    const off = cards.filter(
      (card) =>
        (card.seasonId || currentSeason.id) === currentSeason.id &&
        card.photoId &&
        card.photoId !== 'none' &&
        photoShots[card.playerId] &&
        card.photoId !== photoShots[card.playerId].id
    );
    if (off.length === 0) return;
    void poolService
      .backfillCards(off.map((card) => ({ cardId: card.id, photo: photoShots[card.playerId] })))
      .catch((error) => console.warn('Season photos not restored:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsLoading, photos.size, cards.length]);
  // Cards carry their season and the photo from when they were pulled.
  const cardsShown = useMemo(
    () => cards.map((card) => ({ ...card, seasonId: card.seasonId || currentSeason.id, photo: card.photoId ? photos.get(card.photoId) : undefined })),
    [cards, photos, currentSeason.id]
  );
  // Cards from before photos and seasons were stored get them once, as they are now.
  useEffect(() => {
    if (!currentPlayer || isLoading || cardsLoading) return;
    const stale = cards.filter((card) => !card.seasonId || !card.photoId);
    if (stale.length === 0) return;
    void poolService
      .backfillCards(stale.map((card) => ({ cardId: card.id, seasonId: card.seasonId ? undefined : currentSeason.id, photo: card.photoId ? undefined : photoShots[card.playerId] ?? 'none' })))
      .catch((error) => console.warn('Cards not backfilled:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsLoading, cards.length]);

  // Unlock rewards: a pack for most unlocks, a themed card for the special ones.
  // Every open phone pays out for everyone, including what was earned before
  // rewards existed; ids are the unlock, so nothing is ever paid twice.
  const allUnlocks = useMemo(
    () =>
      players.map((player) => {
        const start = currentSeason.startingElo[player.id] ?? 1000;
        const context = buildBadgeContext(player, matches, challenges, start, undefined, dailyRecords.get(player.id), cupRecords.get(player.id), awardRecords.get(player.id));
        return { player, keys: [...unlockKeys(context)] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, matches, challenges, dailyRecords, cupRecords, awardRecords]
  );
  const paidOut = useRef(new Set<string>());
  useEffect(() => {
    if (!currentPlayer || isLoading || cardsLoading) return;
    const packIds = new Set(packs.map((pack) => pack.id));
    const cardIds = new Set(cards.map((card) => card.id));
    // Only this player's own rewards: their packs are the ones this phone can see.
    for (const { player, keys } of allUnlocks.filter((entry) => entry.player.id === currentPlayer.id)) {
      for (const key of keys) {
        const slug = key.replace(/[^a-z0-9]/gi, '-');
        const reward = rewardFor(key, BADGE[key]?.secret);
        const id = reward.kind === 'pack' ? `${player.id}_reward_${slug}` : `ach-${player.id}-${slug}`;
        if (paidOut.current.has(id) || packIds.has(id) || cardIds.has(id)) continue;
        paidOut.current.add(id);
        const name = describeUnlock(key)?.name ?? key;
        if (reward.kind === 'pack') {
          void poolService.ensureRewardPack(player.id, key, `${reward.label} for ${name}`, reward.minRarity).catch((error) => console.warn('Reward pack not given:', error));
        } else {
          void poolService
            .grantSpecial({
              award: { id, type: reward.type, playerId: player.id, note: name },
              stats: cardStatsById[player.id],
              season: currentSeason.name,
              seasonId: currentSeason.id,
              photo: photoShots[player.id],
            })
            .catch((error) => console.warn('Themed card not given:', error));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, cardsLoading, allUnlocks, packs.length, cards.length]);

  useEffect(() => {
    if (activeTab !== 'leaderboard' || !currentPlayer) return;
    return poolService.subscribeToLobby(setLobbyLines);
  }, [activeTab, currentPlayer?.id]);
  const chatUnread = lobbyLines.filter((line) => line.createdAt > chatReadAt && line.authorId !== currentPlayer?.id).length;

  const firstName = (id: string) => players.find((player) => player.id === id)?.name.split(' ')[0] ?? 'Someone';
  const others = () => players.map((player) => player.id).filter((id) => id !== currentPlayer?.id);

  const handleOpenPack = async (packId: string): Promise<Card[]> => {
    if (!currentPlayer) return [];
    // A pack bought from an older season prints that season's set: its
    // players, at the rating they finished on, with that season's numbers.
    const bought = packs.find((pack) => pack.id === packId);
    const oldSeason = bought?.seasonId && bought.seasonId !== currentSeason.id ? seasons.find((entry) => entry.id === bought.seasonId) : undefined;
    let playerIds = players.map((player) => player.id);
    let stats = cardStatsById;
    if (oldSeason) {
      const games = matchesInSeason(matches, oldSeason);
      const finished = new Map(oldSeason.standings.map((row) => [row.playerId, row.elo]));
      const played = new Set(games.flatMap((match) => [match.playerAId, match.playerBId]));
      const roster = players.filter((player) => played.has(player.id) || finished.has(player.id));
      if (roster.length > 0) playerIds = roster.map((player) => player.id);
      stats = Object.fromEntries(roster.map((player) => [player.id, cardStats({ ...player, elo: finished.get(player.id) ?? player.elo }, games, challenges)]));
    }
    const opened = await poolService.openPack({
      packId,
      ownerId: currentPlayer.id,
      playerIds,
      stats,
      season: oldSeason?.name ?? currentSeason.name,
      seasonId: oldSeason?.id ?? currentSeason.id,
      photos: photoShots,
    });
    // A legendary or mythic stops the room.
    const big = opened.find((card) => card.rarity === 'mythic') ?? opened.find((card) => card.rarity === 'legendary');
    if (big) {
      void notifyMany(others(), {
        type: 'cards',
        title: big.rarity === 'mythic' ? `🌌 ${firstName(currentPlayer.id)} pulled a MYTHIC` : `✨ ${firstName(currentPlayer.id)} pulled a legendary`,
        body: `${firstName(big.playerId)}, No ${big.serial}. Go and see it in Collection.`,
      });
    }
    return opened;
  };

  const handleBuyPack = async (tier: ShopTier, seasonId: string) => {
    if (!currentPlayer) return;
    const season = seasons.find((entry) => entry.id === seasonId) ?? currentSeason;
    await poolService.buyPack({
      ownerId: currentPlayer.id,
      tier,
      seasonId: season.id,
      seasonName: season.name,
      balance: chips.records.get(currentPlayer.id)?.chips ?? 0,
      knownSpent: collectors.find((entry) => entry.id === currentPlayer.id)?.spentChips ?? 0,
    });
  };

  const handleCashIn = async (cardId: string) => {
    if (!currentPlayer) return 0;
    return poolService.cashInCard(cardId, currentPlayer.id);
  };

  const handleOfferTrade = async (toId: string, give: string[], want: string[], note?: string) => {
    if (!currentPlayer) return;
    await poolService.createTrade({ fromId: currentPlayer.id, toId, give, want, note });
    void notifyMany([toId], {
      type: 'cards',
      title: want.length ? `🔁 ${firstName(currentPlayer.id)} wants to trade cards` : `🎁 ${firstName(currentPlayer.id)} sent you a card`,
      body: want.length ? `${give.length} for ${want.length}. Open Collection to answer.` : 'Open Collection to accept it.',
    });
  };

  const handleRespondTrade = async (tradeId: string, answer: 'accept' | 'decline' | 'cancel') => {
    if (!currentPlayer) return;
    const trade = await poolService.respondTrade(tradeId, currentPlayer.id, answer);
    if (answer === 'cancel') return;
    void notifyMany([trade.fromId], {
      type: 'cards',
      title: answer === 'accept' ? `🤝 ${firstName(currentPlayer.id)} accepted your trade` : `${firstName(currentPlayer.id)} turned your trade down`,
      body: answer === 'accept' ? 'The cards have swapped hands.' : 'Maybe sweeten the offer.',
    });
  };

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

  const handleClaimWalkover = async (gameKey: string) => {
    if (!currentPlayer || !thisCup) return;
    try {
      const cup = await poolService.claimWalkover(thisCup.week, gameKey, currentPlayer.id);
      upsertCup(cup);
      const game = cupState ? allGames(cupState).find((entry) => entry.key === gameKey) : undefined;
      const opponent = game ? (game.a === currentPlayer.id ? game.b : game.a) : null;
      if (opponent) {
        void notifyMany([opponent], {
          type: 'tournament',
          title: `✋ ${currentPlayer.name.split(' ')[0]} is ready for your cup game`,
          body: 'Play before the deadline, or they go through on a walkover.',
        });
      }
    } catch (error) {
      console.warn('Could not claim the walkover:', error);
    }
  };

  // When a season closes, everyone sees its wrap once, on their first open after.
  const lastEnded = useMemo(
    () => seasons.filter((entry) => entry.endedAt !== null).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0] ?? null,
    [seasons]
  );
  useEffect(() => {
    if (!currentPlayer || isLoading || !lastEnded?.endedAt || Date.now() - lastEnded.endedAt > 21 * 86_400_000) return;
    const SEEN = 'office_8ball_wrap_seen';
    try {
      if (localStorage.getItem(SEEN) === lastEnded.id) return;
      localStorage.setItem(SEEN, lastEnded.id);
    } catch {
      // Private mode: show it, worst case twice.
    }
    setWrapSeason(lastEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer?.id, isLoading, lastEnded?.id]);

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

  const updateOutbox = (change: (entries: OfflineMatch[]) => OfflineMatch[]) =>
    setOutbox((entries) => {
      const next = change(entries);
      saveOutbox(next);
      return next;
    });

  const queueOffline = (entry: { winnerId: string | null; loserId: string | null; winnerName: string; loserName: string }) =>
    updateOutbox((entries) => queueMatch(entries, { ...entry, loggedById: localStorage.getItem(LOCAL_PLAYER_KEY) }));

  const removeOffline = (id: string) => updateOutbox((entries) => entries.filter((entry) => entry.id !== id));


  // Hand queued results to the league once it answers again. One attempt per
  // load; anything unresolved waits for someone to say who was meant.
  const syncingRef = useRef(false);
  const syncOutbox = async (entries: OfflineMatch[]) => {
    if (syncingRef.current || entries.length === 0) return;
    syncingRef.current = true;
    try {
      const result = await poolService.syncOfflineMatches(entries, currentSeason);
      const done = new Set(result.settled);
      updateOutbox((current) => current.filter((entry) => !done.has(entry.id)));
      setPlayers(result.players);
      setMatches(result.matches);
      const added = result.settled.length - result.duplicates.length;
      const parts = [
        added > 0 ? `${added} offline game${added === 1 ? '' : 's'} added to the league` : '',
        result.duplicates.length > 0 ? `${result.duplicates.length} already logged elsewhere` : '',
        result.unresolved.length > 0 ? `${result.unresolved.length} need a player picked` : '',
      ].filter(Boolean);
      if (parts.length > 0) setSyncNotice(`${parts.join(' · ')}.`);
    } catch (error) {
      console.warn('Offline games not synced yet:', error);
      if (!isDatabaseDown(error)) setSyncNotice('Offline games could not be added yet. They are still saved on this phone.');
    } finally {
      syncingRef.current = false;
    }
  };
  useEffect(() => {
    if (isLoading || loadError || outbox.length === 0) return;
    // A sync reads the whole league, so only go when something can actually
    // be settled; games waiting on a name pick wait without costing anything.
    const plan = planSync(outbox, players, matches);
    if (plan.ready.length === 0 && plan.duplicates.length === 0) return;
    void syncOutbox(outbox);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, loadError, outbox.length]);

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
            body: 'Trophy in the cabinet and coins in the stack.',
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
      if (isDatabaseDown(err)) {
        // The database is out, not the result. Keep it on this phone.
        const winner = players.find((player) => player.id === winnerId);
        const loserId = winnerId === playerAId ? playerBId : playerAId;
        const loser = players.find((player) => player.id === loserId);
        queueOffline({ winnerId, loserId, winnerName: winner?.name ?? '?', loserName: loser?.name ?? '?' });
        setIsLoggerOpen(false);
        setSyncNotice(
          `The league database is out for today. ${winner?.name.split(' ')[0] ?? 'The'} beat ${loser?.name.split(' ')[0] ?? 'result'} is saved on this phone and goes in when it's back.`
        );
      } else {
        alert('Failed to log match. Please try again.');
      }
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

  // A new season opens with picking the look for it: photo, ball and sponsor,
  // fixed on every new card until the season ends.
  const needsSeasonLook = !!currentPlayer && !isLoading && currentPlayer.lockedSeason !== currentSeason.id;
  const handleSeasonLook = async (look: { avatarUrl: string; ball: number; sponsor: string }) => {
    if (!currentPlayer) return;
    const photoChanged = look.avatarUrl !== currentPlayer.avatarUrl;
    await poolService.lockSeasonLook(currentPlayer.id, currentSeason.id, {
      ball: look.ball,
      sponsor: look.sponsor,
      ...(photoChanged ? { avatarUrl: look.avatarUrl } : {}),
    });
    const updated: Player = {
      ...currentPlayer,
      ball: look.ball,
      ballPreference: look.ball > 8 ? 'stripes' : 'solids',
      sponsor: look.sponsor || undefined,
      ...(photoChanged ? { avatarUrl: look.avatarUrl, avatarChangedAt: Date.now() } : {}),
      lockedSeason: currentSeason.id,
      nextBall: undefined,
      nextSponsor: undefined,
    };
    setCurrentPlayer(updated);
    setPlayers((prev) => prev.map((player) => (player.id === updated.id ? updated : player)));
  };

  const handleSaveProfile = async (
    updates: Pick<Player, 'name' | 'department' | 'title' | 'avatarUrl' | 'ballPreference' | 'ball' | 'sponsor' | 'avatarChangedAt' | 'nextBall' | 'nextSponsor'>
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
      !!cupState && allGames(cupState).some((game) => !game.winnerId && game.a && game.b && [game.a, game.b].includes(currentPlayer.id)));
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
          <p className="text-sm text-white/70">The app loaded, but the database did not answer. Try again in a moment.</p>
          <pre className="w-full overflow-x-auto rounded-xl bg-surface p-3 text-left text-[11px] tabular-nums text-white/70">{loadError}</pre>
          <button type="button" onClick={() => window.location.reload()} className="press h-12 w-full rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!currentPlayer) {
    return <IdentityPicker players={players} onSelect={handleSelectPlayer} onAdd={handleAddPlayer} startInAddMode={joinMode} />;
  }

  return (
    <div className="flex min-h-screen justify-center bg-bg text-white">
      <div className="relative flex min-h-screen w-full max-w-md flex-col bg-bg">
        <PullToRefresh />
        <Header
          activeTab={activeTab}
          currentUser={currentPlayer}
          matchesCount={matches.length}
          onOpenProfile={() => setDossierPlayer(currentPlayer)}
          onQuickMatch={() => setShowQuickMatch(true)}
          activityBadge={activityBadge}
          onOpenActivity={openActivity}
          tabAction={
            activeTab === 'leaderboard' ? (
              <button
                type="button"
                onClick={openChat}
                aria-label={chatUnread > 0 ? `Office chat, ${chatUnread} new` : 'Office chat'}
                className="press relative flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-white transition-colors hover:bg-[#2C2C2C]"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
                {chatUnread > 0 && (
                  <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-live px-1 text-[10px] font-black tabular-nums text-white">
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                )}
              </button>
            ) : null
          }
        />
        {showChat && (
          <Sheet title="Office chat" onClose={closeChat}>
            <LobbyChat
              subscribe={poolService.subscribeToLobby}
              players={players}
              currentPlayer={currentPlayer}
              onSend={(text) => poolService.sendLobbyMessage({ authorId: currentPlayer.id, authorName: currentPlayer.name, text })}
              inSheet
            />
          </Sheet>
        )}

        <main className="flex-1 overflow-x-hidden px-3 pt-1 pb-[var(--safe-bottom)]">
          {syncNotice && (
            <div role="status" className="anim-rise mb-2 flex items-start gap-3 rounded-xl bg-surface-alt px-3 py-2.5 text-sm">
              <span className="flex-1">{syncNotice}</span>
              <button type="button" onClick={() => setSyncNotice(null)} className="text-xs font-extrabold uppercase tracking-[0.08em] text-white/60">
                OK
              </button>
            </div>
          )}
          {outbox.length > 0 && (
            <OfflineReview
              entries={outbox}
              players={players}
              onFix={(id, winnerId, loserId) => {
                const name = (pid: string) => players.find((player) => player.id === pid)?.name ?? '';
                updateOutbox((entries) =>
                  entries.map((entry) =>
                    entry.id === id ? { ...entry, winnerId, loserId, winnerName: name(winnerId), loserName: name(loserId) } : entry
                  )
                );
                // A fixed entry is synced straight away rather than on the next load.
                window.setTimeout(() => void syncOutbox(loadOutbox()), 0);
              }}
              onRemove={removeOffline}
            />
          )}
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
                coinsLadder={<RichestList players={players} chips={chips} currentPlayer={currentPlayer} onSelectPlayer={(player) => setDossierPlayer(player)} />}
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
                onShowHistory={() => setActiveTab('history')}
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
                onClaimWalkover={handleClaimWalkover}
                onPlay={(opponentId) => setChallengeTarget({ opponentId, mode: 'instant' })}
                onSelectPlayer={(player) => setDossierPlayer(player)}
              />
            </div>
          )}

          {activeTab === 'collection' && (
            <div className="anim-fade">
              <CollectionView
                players={players}
                currentPlayer={currentPlayer}
                cards={cardsShown}
                packs={packs}
                seasons={[...seasons.filter((entry) => entry.id !== currentSeason.id), currentSeason].map((entry) => ({ id: entry.id, name: entry.name }))}
                currentSeasonId={currentSeason.id}
                collectors={collectors}
                trades={trades}
                matches={matches}
                now={clock}
                earned={earned}
                onOpenPack={handleOpenPack}
                coins={chips.records.get(currentPlayer.id)?.chips ?? 0}
                closedSeasons={seasons.filter((entry) => entry.endedAt !== null).map((entry) => ({ id: entry.id, name: entry.name }))}
                onBuyPack={handleBuyPack}
                onCashIn={handleCashIn}
                onOfferTrade={handleOfferTrade}
                onRespondTrade={handleRespondTrade}
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
                onOpenWrap={setWrapSeason}
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

        <Navigation activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} arenaBadge={arenaBadge}
          cupBadge={cupBadge}
          collectionBadge={
            packs.some((pack) => pack.ownerId === currentPlayer.id && !pack.openedAt && (pack.kind === 'reward' || pack.kind === 'bought' || pack.week === cardWeek)) ||
            trades.some((trade) => trade.toId === currentPlayer.id && trade.status === 'pending')
          }
        />

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

        {needsSeasonLook && currentPlayer && (
          <SeasonLookSheet player={currentPlayer} seasonName={currentSeason.name} onConfirm={handleSeasonLook} />
        )}

        <ProfileModal
          player={showProfile ? currentPlayer : null}
          onClose={() => setShowProfile(false)}
          onSwitchPlayer={handleSwitchPlayer}
          onSave={handleSaveProfile}
          seasonName={currentSeason.name}
          locked={currentPlayer?.lockedSeason === currentSeason.id}
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

        {wrapSeason && currentPlayer && (
          <SeasonWrapScene season={wrapSeason} matches={matches} players={players} currentPlayer={currentPlayer} onClose={() => setWrapSeason(null)} />
        )}
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
