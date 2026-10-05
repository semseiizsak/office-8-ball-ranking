import React, { useEffect, useState } from 'react';
import { LobbyMessage, MatchRecord, Player, Season } from '../types';
import { Tournament } from '../utils/tournament';
import { KioskChatFeed } from './LobbyChat';
import { IdleBanner } from './screensaver/IdleBanner';
import { CupStandingsPage, FormPage, RecentResultsPage, SeasonRacePage } from './screensaver/IdlePages';

/** How long the chat stays up before a full-screen page takes a turn. */
const CHAT_SECONDS = 120;
/** How long each full-screen page stays. */
const PAGE_SECONDS = 60;
const PAGE_COUNT = 4;

/**
 * What the wall tablet shows when nobody has touched it for a while. Mostly
 * the office chat, big enough to read across the room, under a strip of
 * rotating news about the league. Every two minutes one full-screen page
 * takes over for a minute: the cup, the season race, form, the latest
 * results, in turn. Any tap goes back to starting a game.
 */
export const KioskScreensaver: React.FC<{
  players: Player[];
  /** Every match, for the cups. */
  matches: MatchRecord[];
  seasonMatches: MatchRecord[];
  season: Season;
  tournaments: Tournament[];
  now: number;
  subscribeToChat: (onChange: (messages: LobbyMessage[]) => void) => () => void;
  /** Open straight on one page, for previewing (?screensaver=1&page=0..3). */
  startPage?: number;
  onDismiss: () => void;
}> = ({ players, matches, seasonMatches, season, tournaments, now, subscribeToChat, startPage, onDismiss }) => {
  const [mode, setMode] = useState<'chat' | 'page'>(startPage === undefined ? 'chat' : 'page');
  const [pageIndex, setPageIndex] = useState(startPage ?? 0);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        if (mode === 'page') setPageIndex((index) => (index + 1) % PAGE_COUNT);
        setMode(mode === 'chat' ? 'page' : 'chat');
      },
      (mode === 'chat' ? CHAT_SECONDS : PAGE_SECONDS) * 1000
    );
    return () => window.clearTimeout(timer);
  }, [mode]);

  const page = [
    <CupStandingsPage key="cup" players={players} matches={matches} tournaments={tournaments} now={now} />,
    <SeasonRacePage key="race" players={players} seasonMatches={seasonMatches} season={season} now={now} />,
    <FormPage key="form" players={players} seasonMatches={seasonMatches} now={now} />,
    <RecentResultsPage key="results" players={players} matches={matches} now={now} />,
  ][pageIndex];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Screensaver: tap to start a game"
      onClick={onDismiss}
      onKeyDown={onDismiss}
      className="anim-fade fixed inset-0 z-[70] flex cursor-pointer flex-col overflow-hidden bg-bg px-6 pb-[calc(var(--safe-bottom)+1.25rem)] pt-[calc(var(--safe-top)+1.25rem)] text-white"
    >
      {mode === 'chat' ? (
        <div key="chat" className="anim-fade flex min-h-0 flex-1 flex-col">
          <div className="h-[132px] flex-none">
            <IdleBanner players={players} matches={matches} seasonMatches={seasonMatches} season={season} tournaments={tournaments} now={now} />
          </div>
          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <KioskChatFeed subscribe={subscribeToChat} players={players} />
          </div>
        </div>
      ) : (
        <div key={`page-${pageIndex}`} className="flex min-h-0 flex-1 flex-col">
          {page}
          <span className="mt-4 block h-1.5 w-full flex-none overflow-hidden rounded-full bg-surface-alt">
            <span className="idle-progress block h-full w-full origin-left rounded-full bg-white" style={{ animationDuration: `${PAGE_SECONDS}s` }} />
          </span>
        </div>
      )}
      <span className="mt-5 flex h-[60px] w-full flex-none items-center justify-center gap-2.5 rounded-full bg-live text-base font-extrabold uppercase tracking-[0.06em]">
        <span className="live-dot h-[10px] w-[10px]" />
        Tap anywhere to start a game
      </span>
    </div>
  );
};
