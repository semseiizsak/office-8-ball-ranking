// Match event hooks. Feature modules add ONE line to the array below; api.recordMatch runs them
// inside the same write, before save(). A hook must be synchronous and only mutate `d`.
import { progressAfterMatch } from '@/lib/badges';
import { chatAfterMatch } from '@/lib/chat-store';
import { coinsAfterMatch } from '@/lib/coins';
import { cupMatchHook } from '@/lib/cup';
import type { DB } from '@/lib/engine';
import { seasonsAfterMatch } from '@/lib/seasons';

export type MatchHook = (d: DB, matchId: string) => void;

export const afterMatchRecorded: MatchHook[] = [
  (d, id) => cupMatchHook(d, id), // lazy: hooks and cup import each other through api
  // add hooks here, e.g. awardBadgesForMatch,
  chatAfterMatch,
  (d, id) => progressAfterMatch(d, id), // badges, XP and wall of shame; lazy: badges imports api
  (d, id) => seasonsAfterMatch(d, id), // lazy: hooks and seasons import each other through api
  (d, id) => coinsAfterMatch(d, id), // lazy: coins imports api
];

export function runMatchHooks(d: DB, matchId: string) {
  for (const h of afterMatchRecorded) {
    try { h(d, matchId); } catch { /* a feature must never block saving a match */ }
  }
}
