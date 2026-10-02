import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Challenge, ChallengeStakes, MatchRecord, Player, Season } from './types';
import { poolService } from './services/poolService';
import { notifyMany } from './services/notifications';
import { deriveLeagueInsights, matchesInSeason, IMPLICIT_SEASON } from './utils/league';
import { hardRefresh } from './utils/refresh';
import { Ball } from './components/ui';
import { LeaderboardView } from './components/LeaderboardView';
import { KioskStartMatchSheet } from './components/KioskStartMatchSheet';
import { AddPlayerModal } from './components/AddPlayerModal';
import { DuelAcceptedOverlay } from './components/DuelAcceptedOverlay';

/** How long to wait for the first load before telling the wall it is not coming. */
const LOAD_TIMEOUT_MS = 15_000;
/** Nobody reloads a wall-mounted tablet — pull a fresh build on its own schedule. */
const AUTO_REFRESH_MS = 6 * 3_600_000;
/** How soon to retry on its own after a failed load, since no one is standing here to tap it. */
const RETRY_AFTER_MS = 30_000;

/**
 * The tablet on the wall: nobody is "signed in" to it, so there is no profile,
 * no identity, no tabs — just the standings everyone can see, and the one
 * button that puts a match on the table. Every other screen in the app still
 * reacts to the challenge this creates exactly like it would from a phone.
 */
export default function KioskApp() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const [showStartMatch, setShowStartMatch] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [acceptedDuel, setAcceptedDuel] = useState<Challenge | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const withTimeout = <T,>(work: Promise<T>): Promise<T> =>
      Promise.race([
        work,
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('Timed out reaching the league database.')), LOAD_TIMEOUT_MS)
        ),
      ]);

    const liveFeeds: Array<() => void> = [];
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

    (async () => {
      try {
        const [loadedPlayers, , , loadedSeasons] = await withTimeout(
          Promise.all([
            poolService.getPlayers(),
            firstFromServer(poolService.subscribeToMatches, setMatches),
            firstFromServer(poolService.subscribeToChallenges, setChallenges),
            poolService.getSeasons(),
          ])
        );
        if (cancelled) return;
        setPlayers(loadedPlayers);
        setSeasons(loadedSeasons);
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Kiosk load failed:', error);
        setLoadError(error instanceof Error ? error.message : 'Could not reach the league database.');
        setIsLoading(false);
        window.setTimeout(() => !cancelled && hardRefresh(), RETRY_AFTER_MS);
      }
    })();

    return () => {
      cancelled = true;
      liveFeeds.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  // A wall display has nobody to notice the clock stopped.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Pulls a new deploy on its own — this tablet runs unattended.
  useEffect(() => {
    const timer = window.setInterval(() => void hardRefresh(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Keeps the screen awake where the browser supports it; re-requested
  // whenever the tab regains visibility, since a lock is dropped when it hides.
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    const request = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
        wakeLockRef.current = (await nav.wakeLock?.request('screen')) ?? null;
      } catch (error) {
        console.warn('Wake lock not held:', error);
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  const currentSeason = useMemo(() => seasons.find((season) => season.endedAt === null) ?? IMPLICIT_SEASON, [seasons]);
  const seasonMatches = useMemo(() => matchesInSeason(matches, currentSeason), [matches, currentSeason]);
  const league = useMemo(
    () => deriveLeagueInsights(players, seasonMatches, challenges, clock, currentSeason.startingElo),
    [players, seasonMatches, challenges, currentSeason, clock]
  );

  const handleAddPlayer = async (params: Parameters<typeof poolService.addPlayer>[0]) => {
    const newPlayer = await poolService.addPlayer(params);
    setPlayers((prev) => [...prev, newPlayer]);
    return newPlayer;
  };

  const handleStartMatch = async (challenger: Player, opponent: Player, stakes: ChallengeStakes) => {
    const challenge = await poolService.startInstantMatch({ challenger, opponent, stakes });
    setShowStartMatch(false);
    setAcceptedDuel(challenge);
    const room = players
      .filter((player) => player.id !== challenger.id && player.id !== opponent.id)
      .map((player) => player.id);
    await notifyMany(room, {
      type: 'match_live',
      title: `${challenger.name.split(' ')[0]} vs ${opponent.name.split(' ')[0]} — on the table now`,
      body: 'Started from the kiosk. Calls are open for the next four minutes.',
      challengeId: challenge.id,
    }).catch((error) => console.warn('Live match ping not delivered:', error));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await hardRefresh();
  };

  if (isLoading) {
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
          <p className="text-sm text-white/70">The kiosk loaded, but the database did not answer. It will try again on its own shortly.</p>
          <pre className="w-full overflow-x-auto rounded-xl bg-surface p-3 text-left text-[11px] tabular-nums text-white/70">{loadError}</pre>
          <button type="button" onClick={() => void hardRefresh()} className="press h-12 w-full rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
            Try again now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-bg text-white">
      <div className="relative flex min-h-screen w-full max-w-md flex-col bg-bg">
        <header className="sticky top-0 z-40 w-full bg-bg px-4 pb-3 pt-[calc(var(--safe-top)+0.9rem)]">
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate font-display text-[28px] font-extrabold uppercase leading-none tracking-[-0.02em] text-white min-[440px]:text-[32px]">
              Office 8-Ball
            </h1>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh"
              title="Refresh"
              className="press flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface-alt text-white transition-colors hover:bg-[#2C2C2C]"
            >
              <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={2.25} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-3 pt-1 pb-[calc(var(--safe-bottom)+1rem)]">
          <button
            type="button"
            onClick={() => setShowStartMatch(true)}
            className="press mb-3 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-live text-sm font-extrabold uppercase tracking-[0.06em] text-white"
          >
            <span className="live-dot h-[9px] w-[9px]" />
            Start a game
          </button>

          <LeaderboardView
            players={players}
            matches={seasonMatches}
            league={league}
            season={currentSeason}
            currentPlayer={null}
            now={clock}
            leaderboardChanges={{}}
            onSelectPlayer={() => undefined}
            onChallenge={() => setShowStartMatch(true)}
            onAddPlayer={() => setShowAddPlayer(true)}
          />
        </main>

        {showStartMatch && (
          <KioskStartMatchSheet
            players={players}
            crown={league.crown}
            matches={seasonMatches}
            onStart={handleStartMatch}
            onClose={() => setShowStartMatch(false)}
          />
        )}

        {showAddPlayer && <AddPlayerModal onAdd={handleAddPlayer} onClose={() => setShowAddPlayer(false)} />}

        {acceptedDuel && (
          <DuelAcceptedOverlay challenge={acceptedDuel} players={players} onComplete={() => setAcceptedDuel(null)} />
        )}
      </div>
    </div>
  );
}
