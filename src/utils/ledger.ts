import { Challenge, MatchRecord, Player } from '../types';
import { ChipsState, GRANTS, JACKPOT_ENTRY, costOf, hasJackpotEntry, isWalletCall } from './chips';
import { CHALLENGE_REWARD, MATCH_COINS, MATCH_COINS_FROM, STREAK_FROM, weekProgress } from './coins';
import { Collector, Pack, SET_REWARD_COINS } from './cards';
import { DAILY_PLAY_BONUS, DAILY_WIN_BONUS, DailyPairing, dayKeyOf } from './daily';
import { CHAMPION_CHIPS, FINALIST_CHIPS, Tournament, mondayOf, resolveCup } from './tournament';

/**
 * The coin log: every movement on one player's stack, when and why. Nothing
 * here is stored either. It is read off the same matches, calls, packs and
 * cups the balance is, entry by entry, so the log and the number agree.
 */
export type LedgerKind = 'call' | 'payout' | 'jackpot' | 'match' | 'daily' | 'cup' | 'task' | 'grant' | 'shop' | 'cards' | 'set';

export interface LedgerEntry {
  /** Stable across renders, so a fresh entry can be told from an old one. */
  id: string;
  at: number;
  amount: number;
  kind: LedgerKind;
  title: string;
  detail?: string;
  /** The challenge a call, payout or jackpot belongs to. */
  challengeId?: string;
  /** The stack either side of this entry, filled in once the log is in order. */
  before: number;
  after: number;
}

type Draft = Omit<LedgerEntry, 'before' | 'after'>;

export const LEDGER_EMOJI: Record<LedgerKind, string> = {
  call: '🔮',
  payout: '🔮',
  jackpot: '💎',
  match: '🎱',
  daily: '📅',
  cup: '🏆',
  task: '✅',
  grant: '🎁',
  shop: '🃏',
  cards: '♻️',
  set: '📚',
};

export function coinLedger(params: {
  playerId: string;
  players: Player[];
  matches: MatchRecord[];
  challenges: Challenge[];
  chips: ChipsState;
  dailies: DailyPairing[];
  tournaments: Tournament[];
  packs: Pack[];
  collector?: Collector;
  now: number;
}): LedgerEntry[] {
  const { playerId: me, players, matches, challenges, chips, now } = params;
  const out: Draft[] = [];
  const first = (id: string) => (players.find((player) => player.id === id)?.name ?? 'someone').split(' ')[0];
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const vs = (challenge: Challenge) => `${first(challenge.challengerId)} vs ${first(challenge.opponentId)}`;

  // Calls: paid the moment they are cast, back when the match settles.
  for (const challenge of challenges) {
    if (!['pending', 'accepted', 'live', 'played'].includes(challenge.status)) continue;
    challenge.predictions.forEach((prediction, index) => {
      if (prediction.predictorId !== me || costOf(prediction) <= 0) return;
      const entry = hasJackpotEntry(prediction) ? JACKPOT_ENTRY : 0;
      const stake = costOf(prediction) - entry;
      if (stake > 0) out.push({ id: `call:${challenge.id}:${index}`, at: prediction.createdAt, amount: -stake, kind: 'call', title: `Called ${first(prediction.predictedWinnerId)}`, detail: vs(challenge), challengeId: challenge.id });
      if (entry > 0) out.push({ id: `entry:${challenge.id}:${index}`, at: prediction.createdAt, amount: -entry, kind: 'jackpot', title: 'Jackpot entry', detail: vs(challenge), challengeId: challenge.id });
    });
  }
  for (const challenge of challenges) {
    const payout = chips.payouts.get(challenge.id)?.find((entry) => entry.playerId === me);
    if (!payout) continue;
    const match = challenge.matchId ? matchById.get(challenge.matchId) : undefined;
    const at = match?.timestamp ?? challenge.createdAt;
    const winnerId = challenge.resolvedWinnerId;
    const result = winnerId ? `${first(winnerId)} beat ${first(winnerId === challenge.challengerId ? challenge.opponentId : challenge.challengerId)}` : vs(challenge);
    if (payout.paid > 0) {
      const old = !challenge.predictions.some((prediction) => prediction.predictorId === me && isWalletCall(prediction));
      out.push({ id: `pay:${challenge.id}`, at, amount: payout.paid, kind: 'payout', title: 'Your call came in', detail: `${result}${old ? ', stake and winnings' : ', stake back'}`, challengeId: challenge.id });
    }
    if (payout.jackpot > 0) out.push({ id: `jackpot:${challenge.id}`, at, amount: payout.jackpot, kind: 'jackpot', title: 'Jackpot!', detail: `Winner, balls and pocket, ${result}`, challengeId: challenge.id });
  }

  // Every match pays both sides; runs count over every match ever played.
  const run = new Map<string, number>();
  for (const match of [...matches].sort((a, b) => a.timestamp - b.timestamp)) {
    const streak = (run.get(match.winnerId) ?? 0) + 1;
    run.set(match.winnerId, streak);
    run.set(match.loserId, 0);
    if (match.timestamp < MATCH_COINS_FROM) continue;
    if (match.winnerId === me) {
      const extras = [match.isUpset ? `upset +${MATCH_COINS.upset}` : '', streak >= STREAK_FROM ? `${streak} in a row +${MATCH_COINS.streak}` : ''].filter(Boolean);
      const amount = MATCH_COINS.play + MATCH_COINS.win + (match.isUpset ? MATCH_COINS.upset : 0) + (streak >= STREAK_FROM ? MATCH_COINS.streak : 0);
      out.push({ id: `match:${match.id}`, at: match.timestamp, amount, kind: 'match', title: `Beat ${first(match.loserId)}`, detail: ['Played and won', ...extras].join(', ') });
    } else if (match.loserId === me) {
      out.push({ id: `match:${match.id}`, at: match.timestamp, amount: MATCH_COINS.play, kind: 'match', title: `Lost to ${first(match.winnerId)}`, detail: 'For playing' });
    }
  }

  // Match of the day: paid when it is played, on that day.
  for (const daily of params.dailies) {
    const pair = daily.pairs.find(([a, b]) => a === me || b === me);
    if (!pair) continue;
    const them = pair[0] === me ? pair[1] : pair[0];
    const match = matches
      .filter((entry) => dayKeyOf(entry.timestamp) === daily.day && [entry.playerAId, entry.playerBId].includes(me) && [entry.playerAId, entry.playerBId].includes(them))
      .sort((a, b) => a.timestamp - b.timestamp)[0];
    if (!match) continue;
    const won = match.winnerId === me;
    out.push({ id: `daily:${daily.day}`, at: match.timestamp, amount: DAILY_PLAY_BONUS + (won ? DAILY_WIN_BONUS : 0), kind: 'daily', title: 'Match of the day', detail: `${won ? 'Won' : 'Played'} against ${first(them)}` });
  }

  // The weekly cup: the champion and a finalist who played the final.
  for (const tournament of params.tournaments) {
    const state = resolveCup(tournament, matches, now);
    if (!state) continue;
    const at = (state.final.matchId ? matchById.get(state.final.matchId)?.timestamp : undefined) ?? tournament.deadline;
    if (state.champion === me) out.push({ id: `cup:${tournament.week}`, at, amount: CHAMPION_CHIPS, kind: 'cup', title: 'Won the weekly cup', detail: `Week of ${tournament.week}` });
    if (state.runnerUp === me && state.final.matchId) out.push({ id: `cup:${tournament.week}`, at, amount: FINALIST_CHIPS, kind: 'cup', title: 'Weekly cup final', detail: `Runner up, week of ${tournament.week}` });
  }

  // Weekly tasks: paid at the moment the last step went in.
  for (let week = mondayOf(MATCH_COINS_FROM).getTime(); week <= now; week = mondayOf(week + 8 * 86_400_000).getTime()) {
    const done = weekProgress(me, week, matches, challenges).filter((task) => task.done);
    if (done.length === 0) continue;
    const end = week + 7 * 86_400_000;
    const moments = [
      ...matches.filter((match) => match.timestamp >= week && match.timestamp < end && (match.playerAId === me || match.playerBId === me)).map((match) => match.timestamp),
      ...challenges.flatMap((challenge) => challenge.predictions.filter((prediction) => prediction.predictorId === me && prediction.createdAt >= week && prediction.createdAt < end).map((prediction) => prediction.createdAt)),
    ].sort((a, b) => a - b);
    for (const task of done) {
      const at =
        moments.find((moment) =>
          weekProgress(
            me,
            week,
            matches.filter((match) => match.timestamp <= moment),
            challenges.map((challenge) => ({ ...challenge, predictions: challenge.predictions.filter((prediction) => prediction.createdAt <= moment) }))
          ).find((entry) => entry.id === task.id)?.done
        ) ?? Math.min(end, now);
      out.push({ id: `task:${dayKeyOf(week)}:${task.id}`, at, amount: CHALLENGE_REWARD, kind: 'task', title: 'Weekly challenge', detail: task.title });
    }
  }

  for (const grant of GRANTS) {
    out.push({ id: `grant:${grant.day}`, at: new Date(`${grant.day}T09:00:00`).getTime(), amount: grant.amount, kind: 'grant', title: 'Gift to everyone', detail: 'Welcome to coins' });
  }

  // Packs: bought, duplicates turned to coins on opening, set rewards.
  let packDuplicates = 0;
  for (const pack of params.packs) {
    if (pack.ownerId !== me) continue;
    if (pack.price) out.push({ id: `shop:${pack.id}`, at: pack.createdAt, amount: -pack.price, kind: 'shop', title: 'Pack shop', detail: pack.reason });
    if (pack.duplicateChips > 0 && pack.openedAt) {
      packDuplicates += pack.duplicateChips;
      out.push({ id: `dup:${pack.id}`, at: pack.openedAt, amount: pack.duplicateChips, kind: 'cards', title: 'Duplicates', detail: 'Turned to coins when the pack opened' });
    }
    if (pack.kind === 'reward' && pack.id.includes('_reward_set-')) out.push({ id: `set:${pack.id}`, at: pack.createdAt, amount: SET_REWARD_COINS, kind: 'set', title: 'Player set complete', detail: pack.reason });
  }

  // Cards cashed in: logged since the coin log, one lump for what came before.
  const collector = params.collector;
  if (collector) {
    const logged = collector.cashIns ?? [];
    for (const cashIn of logged) {
      out.push({ id: `cash:${cashIn.at}`, at: cashIn.at, amount: cashIn.coins, kind: 'cards', title: 'Cards cashed in', detail: `${cashIn.cards} ${cashIn.cards === 1 ? 'card' : 'cards'}` });
    }
    // The stored totals are the truth; anything the packs no longer show goes in one line.
    const shopEarlier = collector.spentChips - params.packs.filter((pack) => pack.ownerId === me).reduce((sum, pack) => sum + (pack.price ?? 0), 0);
    if (shopEarlier > 0) out.push({ id: 'shop:earlier', at: 0, amount: -shopEarlier, kind: 'shop', title: 'Pack shop', detail: 'Purchases not itemised, all together' });
    const setsEarlier = collector.rewardChips - out.filter((entry) => entry.kind === 'set').reduce((sum, entry) => sum + entry.amount, 0);
    if (setsEarlier > 0) out.push({ id: 'set:earlier', at: 0, amount: setsEarlier, kind: 'set', title: 'Player sets', detail: 'Earlier rewards, all together' });
    const earlier = collector.duplicateChips - packDuplicates - logged.reduce((sum, cashIn) => sum + cashIn.coins, 0);
    if (earlier > 0) out.push({ id: 'cash:earlier', at: 0, amount: earlier, kind: 'cards', title: 'Cards cashed in', detail: 'Before the coin log, all together' });
  }

  // Oldest first to run the balance, then newest first for reading.
  let balance = 0;
  return out
    .filter((entry) => entry.amount !== 0)
    .sort((a, b) => a.at - b.at || b.amount - a.amount)
    .map((entry) => {
      const before = balance;
      balance += entry.amount;
      return { ...entry, before, after: balance };
    })
    .reverse();
}

/** A won call or a jackpot: the moments worth a louder mark. */
export const isBigMoment = (entry: LedgerEntry) => (entry.kind === 'jackpot' && entry.amount > 0) || entry.kind === 'payout';

/** The slice of the log inside a window, and the stack it opened on. */
export function ledgerWindow(entries: LedgerEntry[], from: number, until: number) {
  const inside = entries.filter((entry) => entry.at >= from && entry.at < until);
  const prior = entries.find((entry) => entry.at < from);
  return { entries: inside, opening: prior ? prior.after : 0 };
}
