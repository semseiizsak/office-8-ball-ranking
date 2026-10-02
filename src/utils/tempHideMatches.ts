import { MatchRecord, Player } from '../types';

/**
 * TEMPORARY, today only. Every Bálint match after the first stays fully in
 * Firestore with its real scores and results — this only keeps them off
 * the history feed and the leaderboard's recent-form dots. Nothing here
 * touches stored Elo, wins/losses, or the match documents themselves. Safe
 * to delete this file (and its call sites in EventsView/LeaderboardView)
 * once no longer needed.
 */
function getTemporarilyHiddenMatchIds(matches: MatchRecord[]): Set<string> {
  const balintMatches = matches
    .filter((match) => match.playerAName.toLowerCase() === 'bálint' || match.playerBName.toLowerCase() === 'bálint')
    .sort((a, b) => a.timestamp - b.timestamp);
  return new Set(balintMatches.slice(1).map((match) => match.id));
}

export function withoutTemporarilyHiddenMatches(matches: MatchRecord[]): MatchRecord[] {
  const hiddenIds = getTemporarilyHiddenMatchIds(matches);
  if (hiddenIds.size === 0) return matches;
  return matches.filter((match) => !hiddenIds.has(match.id));
}

/**
 * player.recentForm already bakes in every match ever played, hidden ones
 * included. Only the players actually touched by a hidden match get their
 * dots recomputed (from this season's visible matches); everyone else keeps
 * their real, unchanged recentForm untouched.
 */
export function displayRecentForm(player: Player, seasonMatches: MatchRecord[]): ('W' | 'L')[] {
  const hiddenIds = getTemporarilyHiddenMatchIds(seasonMatches);
  const isTouched = seasonMatches.some(
    (match) => hiddenIds.has(match.id) && (match.playerAId === player.id || match.playerBId === player.id)
  );
  if (!isTouched) return player.recentForm;

  return [...seasonMatches]
    .filter((match) => !hiddenIds.has(match.id) && (match.playerAId === player.id || match.playerBId === player.id))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, player.recentForm.length || 5)
    .map((match) => (match.winnerId === player.id ? 'W' : 'L'));
}
