import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Challenge, ChatMessage, Cheer, MatchComment, MatchRecord, Player } from '../types';
import { buildBadgeContext, describeUnlock, unlockKeys } from '../utils/achievements';
import { ballColor, playerBall } from '../utils/balls';
import { Payout, stakeOf } from '../utils/chips';
import { DailyPairing, dayKeyOf } from '../utils/daily';
import { shamed } from '../utils/shame';
import { Tournament, allGames, resolveCup } from '../utils/tournament';
import { CommentsThread, ReactionBar } from './MatchSocial';
import { Ball, CallSplit, CountUp, PlayerAvatar, Sheet } from './ui';

const first = (name: string) => name.split(' ')[0];
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export interface MatchDetailProps {
  match: MatchRecord;
  players: Player[];
  /** Every match ever, for badges and the rating lines. */
  allMatches: MatchRecord[];
  /** The match's own season, for the ladder as it stood. */
  seasonMatches: MatchRecord[];
  startingElo: Record<string, number>;
  challenges: Challenge[];
  payouts: Map<string, Payout[]>;
  dailies: DailyPairing[];
  tournaments: Tournament[];
  currentPlayer: Player;
  editable: boolean;
  onEditWinner: (matchId: string, winnerId: string) => Promise<void>;
  onDelete: (matchId: string) => Promise<void>;
  onReact: (matchId: string, emoji: string | null) => Promise<void>;
  onOpenComments: (matchId: string, onChange: (comments: MatchComment[]) => void) => () => void;
  onSubmitComment: (matchId: string, params: { text: string; imageDataUrl?: string | null }) => Promise<void>;
  onDeleteComment: (matchId: string, commentId: string) => Promise<void>;
  subscribeChat: (challengeId: string, onChange: (messages: ChatMessage[]) => void) => () => void;
  subscribeCheers: (challengeId: string, onChange: (cheers: Cheer[]) => void) => () => void;
  onClose: () => void;
}

/** Latest rating per player after the given matches, best first. */
function ladderAfter(matches: MatchRecord[], startingElo: Record<string, number>) {
  const elo = new Map<string, number>();
  for (const match of [...matches].sort((a, b) => a.timestamp - b.timestamp)) {
    elo.set(match.playerAId, match.playerAEloAfter);
    elo.set(match.playerBId, match.playerBEloAfter);
  }
  const rank = (id: string) => {
    const mine = elo.get(id) ?? startingElo[id] ?? 1000;
    return [...elo].filter(([other, value]) => other !== id && value > mine).length + 1;
  };
  return { elo, rank };
}

/**
 * Both players' ratings across the matches around this one, with this match
 * marked. Each line only moves when that player actually played.
 */
const EloLines: React.FC<{ match: MatchRecord; allMatches: MatchRecord[]; a: Player | null; b: Player | null }> = ({ match, allMatches, a, b }) => {
  const W = 320, H = 150, L = 8, R = 44, T = 14, B = 18;
  const ids = [match.winnerId, match.loserId];
  const around = allMatches
    .filter((entry) => ids.some((id) => entry.playerAId === id || entry.playerBId === id))
    .sort((x, y) => x.timestamp - y.timestamp);
  const at = around.findIndex((entry) => entry.id === match.id);
  const window = around.slice(Math.max(0, at - 6), at + 4);
  const here = window.findIndex((entry) => entry.id === match.id);
  const series = ids.map((id) => {
    const firstOwn = window.find((entry) => entry.playerAId === id || entry.playerBId === id)!;
    let value = firstOwn.playerAId === id ? firstOwn.playerAEloBefore : firstOwn.playerBEloBefore;
    return [value, ...window.map((entry) => {
      if (entry.playerAId === id) value = entry.playerAEloAfter;
      else if (entry.playerBId === id) value = entry.playerBEloAfter;
      return value;
    })];
  });
  const all = series.flat();
  const lo = Math.min(...all) - 8;
  const hi = Math.max(...all) + 8;
  const steps = window.length;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, steps);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const colours = [a, b].map((player) => (player ? ballColor(playerBall(player)).c : '#fff'));
  const path = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Both ratings around this match">
      <rect x={x(here)} y={T - 8} width={x(here + 1) - x(here)} height={H - T - B + 16} rx="6" fill="rgba(255,255,255,.07)" />
      <text x={(x(here) + x(here + 1)) / 2} y={H - 2} textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9" fontWeight="800">THIS MATCH</text>
      {series.map((values, index) => (
        <React.Fragment key={index}>
          <path d={path(values)} fill="none" stroke={index === 0 ? '#fff' : 'rgba(255,255,255,.45)'} strokeWidth={index === 0 ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-line" style={{ animationDelay: `${300 + index * 250}ms`, animationDuration: '900ms' }} />
          <circle cx={x(here + 1)} cy={y(values[here + 1])} r="5" fill={colours[index]} stroke="#fff" strokeWidth="1.5" className="anim-pop" style={{ animationDelay: `${900 + index * 200}ms` }} />
          <text x={x(steps) + 6} y={y(values[values.length - 1]) + 3.5} fill={index === 0 ? '#fff' : 'rgba(255,255,255,.55)'} fontSize="10" fontWeight="800">
            {values[values.length - 1]}
          </text>
        </React.Fragment>
      ))}
    </svg>
  );
};

/**
 * Everything about one match on a single sheet: who, how, what it did to the
 * ratings and the ladder, what it unlocked, how the office called it, and the
 * live chat, reactions and comments around it.
 */
export const MatchDetailSheet: React.FC<MatchDetailProps> = (props) => {
  const { match, players, allMatches, seasonMatches, startingElo, challenges, payouts, dailies, tournaments, currentPlayer, editable } = props;
  const byId = new Map(players.map((p) => [p.id, p]));
  const winnerIsA = match.winnerId === match.playerAId;
  const winnerName = winnerIsA ? match.playerAName : match.playerBName;
  const loserName = winnerIsA ? match.playerBName : match.playerAName;
  const winner = byId.get(match.winnerId) ?? null;
  const loser = byId.get(match.loserId) ?? null;
  const eloOf = (id: string, after: boolean) =>
    id === match.playerAId ? (after ? match.playerAEloAfter : match.playerAEloBefore) : after ? match.playerBEloAfter : match.playerBEloBefore;

  const challenge = challenges.find((entry) => entry.matchId === match.id) ?? null;
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [cheers, setCheers] = useState<Cheer[]>([]);
  useEffect(() => {
    if (!challenge) return;
    const offChat = props.subscribeChat(challenge.id, setChat);
    const offCheers = props.subscribeCheers(challenge.id, setCheers);
    return () => {
      offChat();
      offCheers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id]);

  // The ladder just before and just after.
  const ranks = useMemo(() => {
    const before = ladderAfter(seasonMatches.filter((entry) => entry.timestamp < match.timestamp), startingElo);
    const after = ladderAfter(seasonMatches.filter((entry) => entry.timestamp <= match.timestamp), startingElo);
    return Object.fromEntries([match.winnerId, match.loserId].map((id) => [id, { before: before.rank(id), after: after.rank(id) }]));
  }, [match, seasonMatches, startingElo]);

  // Head to head up to and including this one.
  const h2h = useMemo(() => {
    const between = allMatches.filter(
      (entry) => entry.timestamp <= match.timestamp && [entry.playerAId, entry.playerBId].includes(match.winnerId) && [entry.playerAId, entry.playerBId].includes(match.loserId)
    );
    return { w: between.filter((entry) => entry.winnerId === match.winnerId).length, l: between.filter((entry) => entry.winnerId === match.loserId).length };
  }, [match, allMatches]);

  // What this result unlocked for each of them.
  const unlocks = useMemo(() => {
    const before = allMatches.filter((entry) => entry.timestamp < match.timestamp);
    const upTo = allMatches.filter((entry) => entry.timestamp <= match.timestamp);
    return Object.fromEntries(
      [match.winnerId, match.loserId].map((id) => {
        const player = byId.get(id);
        if (!player) return [id, []];
        const start = startingElo[id] ?? 1000;
        const had = unlockKeys(buildBadgeContext(player, before, challenges, start));
        const got = [...unlockKeys(buildBadgeContext(player, upTo, challenges, start))].filter((key) => !had.has(key));
        return [id, got.map(describeUnlock).filter(Boolean)];
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, allMatches, challenges, startingElo]);

  // Anything special about the fixture itself.
  const tags = useMemo(() => {
    const out: string[] = [];
    if (match.isUpset) out.push('😱 Upset');
    if (match.bountyCollected > 0) out.push(`👑 ${match.bountyCollected} bounty collected`);
    if (match.modifiers.tableRun) out.push('🏃 Ran the table');
    if (match.modifiers.eightOnBreak) out.push('💥 8 on the break');
    if (match.modifiers.scratchOnEight) out.push('❌ Scratched the 8');
    const daily = dailies.find((entry) => entry.day === dayKeyOf(match.timestamp));
    if (daily?.pairs.some(([x, y]) => [x, y].includes(match.winnerId) && [x, y].includes(match.loserId))) out.push('📅 Match of the day');
    for (const cup of tournaments) {
      const state = resolveCup(cup, allMatches, Date.now());
      const game = state && allGames(state).find((entry) => entry.matchId === match.id);
      if (game) out.push(`🏆 Weekly cup ${game.label.toLowerCase()}`);
    }
    return out;
  }, [match, dailies, tournaments, allMatches]);

  const cheerCounts = [...cheers.reduce((acc, cheer) => acc.set(cheer.emoji, (acc.get(cheer.emoji) ?? 0) + 1), new Map<string, number>())].sort((x, y) => y[1] - x[1]);
  const matchPayouts = challenge ? payouts.get(challenge.id) ?? [] : [];
  const duration = challenge?.startedAt ? Math.round((match.timestamp - challenge.startedAt) / 60_000) : null;

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  let section = 0;
  const block = (title: string, children: React.ReactNode, aside?: React.ReactNode) => (
    <section className="anim-sheet grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 overflow-hidden rounded-2xl bg-card p-3.5" style={{ animationDelay: `${250 + section++ * 90}ms` }}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex-none text-base">{title}</h3>
        {aside && <span className="min-w-0 truncate text-xs font-semibold text-white/55">{aside}</span>}
      </div>
      {children}
    </section>
  );

  const side = (id: string, player: Player | null, name: string, won: boolean, from: 'left' | 'right') => {
    const before = eloOf(id, false);
    const after = eloOf(id, true);
    return (
      <div className={`grid min-w-0 justify-items-center gap-1.5 text-center ${from === 'left' ? 'duel-in-left' : 'duel-in-right'}`}>
        <span className="relative">
          <PlayerAvatar player={player ?? { id, name, avatarUrl: '' }} size={76} />
          {won && <span className="anim-pop absolute -right-1 -top-2 text-2xl" style={{ animationDelay: '700ms' }}>👑</span>}
        </span>
        <b className={`max-w-full truncate font-display text-lg font-extrabold uppercase leading-none ${won ? '' : 'text-white/55'}`}>{shamed(first(name), player ?? undefined)}</b>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] ${won ? 'bg-felt text-white' : 'bg-surface-alt'}`}>{won ? 'Won' : 'Lost'}</span>
        <span className="text-xs font-semibold tabular-nums text-white/70">
          <CountUp from={before} to={after} delay={500} /> Elo
        </span>
        <b className={`text-sm tabular-nums ${won ? '' : 'text-white/55'}`}>
          {after >= before ? '+' : '−'}
          <CountUp to={Math.abs(after - before)} delay={500} />
        </b>
      </div>
    );
  };

  return (
    <Sheet title="Match" label="Match details" onClose={props.onClose} z={60}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 pb-6">
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-2xl bg-card px-3 py-5">
          <span
            aria-hidden="true"
            className="accept-close-left absolute inset-0 opacity-25"
            style={{ background: winner ? ballColor(playerBall(winner)).c : '#fff', clipPath: 'polygon(0 0, 58% 0, 42% 100%, 0 100%)' }}
          />
          <span className="relative">{side(match.winnerId, winner, winnerName, true, 'left')}</span>
          <span className="relative grid justify-items-center gap-2">
            <span className="accept-stamp grid h-14 w-14 place-items-center rounded-full bg-bg font-display text-xl font-extrabold shadow-[0_0_0_2px_#fff]">VS</span>
            {match.winnerBall && (
              <span className="emo-spin grid justify-items-center gap-1" style={{ animationDelay: '800ms' }}>
                <Ball n={match.winnerBall === 'solids' ? 1 : 9} size={30} />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/70">on {match.winnerBall}</span>
              </span>
            )}
          </span>
          <span className="relative">{side(match.loserId, loser, loserName, false, 'right')}</span>
        </div>

        <div className="anim-fade flex flex-wrap justify-center gap-1.5 text-xs font-semibold text-white/70" style={{ animationDelay: '200ms' }}>
          <span>{new Date(match.timestamp).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}, {clock(match.timestamp)}</span>
          {duration !== null && duration > 0 && <span>, {duration} min at the table</span>}
        </div>

        {tags.length > 0 && (
          <div className="stagger flex flex-wrap justify-center gap-1.5">
            {tags.map((tag, index) => (
              <span key={tag} className="rounded-full bg-surface-alt px-3 py-1.5 text-xs font-bold" style={{ ['--i' as string]: index + 4 }}>{tag}</span>
            ))}
          </div>
        )}

        {block('Rating', <EloLines match={match} allMatches={allMatches} a={winner} b={loser} />, `${first(winnerName)} white, ${first(loserName)} grey`)}

        {block(
          'Ladder',
          <div className="grid gap-1">
            {[[match.winnerId, winnerName], [match.loserId, loserName]].map(([id, name]) => {
              const move = ranks[id];
              const delta = move.before - move.after;
              return (
                <div key={id} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerAvatar player={byId.get(id) ?? null} size={26} />
                    <b className="truncate text-sm">{first(name)}</b>
                  </span>
                  <span className="text-sm font-black tabular-nums">
                    #{move.before} <span className="text-white/55">to</span> #{move.after}
                    {delta !== 0 && <span className={`ml-2 text-xs ${delta > 0 ? '' : 'text-white/55'}`}>{delta > 0 ? `▲ ${delta}` : `▼ ${-delta}`}</span>}
                  </span>
                </div>
              );
            })}
          </div>,
          `Head to head ${h2h.w} to ${h2h.l}`
        )}

        {block(
          'Unlocked',
          (unlocks[match.winnerId]?.length ?? 0) + (unlocks[match.loserId]?.length ?? 0) === 0 ? (
            <p className="text-sm text-white/55">Nothing new this time.</p>
          ) : (
            <div className="grid gap-1.5">
              {[match.winnerId, match.loserId].flatMap((id) =>
                (unlocks[id] ?? []).map((unlock, index) => (
                  <div key={`${id}-${unlock!.key}`} className="anim-pop flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5" style={{ animationDelay: `${600 + index * 120}ms` }}>
                    <span className="emo-spin text-2xl" style={{ animationDelay: `${650 + index * 120}ms` }}>{unlock!.e}</span>
                    <span className="grid min-w-0 flex-1">
                      <b className="truncate text-sm">{unlock!.name}</b>
                      <span className="truncate text-xs text-white/55">{unlock!.label}. {unlock!.desc}</span>
                    </span>
                    <PlayerAvatar player={byId.get(id) ?? null} size={24} />
                  </div>
                ))
              )}
            </div>
          )
        )}

        {challenge && challenge.predictions.length > 0 &&
          block(
            'The calls',
            <div className="grid gap-2">
              <CallSplit
                left={{ player: winner ?? { id: match.winnerId }, count: challenge.predictions.filter((p) => p.predictedWinnerId === match.winnerId).length }}
                right={{ player: loser ?? { id: match.loserId }, count: challenge.predictions.filter((p) => p.predictedWinnerId === match.loserId).length }}
                mineId={challenge.predictions.find((p) => p.predictorId === currentPlayer.id)?.predictedWinnerId}
              />
              <div className="stagger-rows grid gap-0.5">
                {challenge.predictions.map((prediction, index) => {
                  const payout = matchPayouts.find((entry) => entry.playerId === prediction.predictorId);
                  const net = payout ? payout.paid + payout.jackpot - payout.staked : 0;
                  const right = prediction.predictedWinnerId === match.winnerId;
                  return (
                    <div key={prediction.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2" style={{ ['--j' as string]: index }}>
                      <span className="flex min-w-0 items-center gap-2">
                        <PlayerAvatar player={byId.get(prediction.predictorId) ?? null} size={24} />
                        <span className="truncate text-sm">
                          <b>{first(prediction.predictorName)}</b> <span className="text-white/55">on</span> {first(byId.get(prediction.predictedWinnerId)?.name ?? '?')}
                          {prediction.ball && <span className="text-white/55"> with {prediction.ball}</span>}
                        </span>
                      </span>
                      <span className={`flex-none text-sm font-black tabular-nums ${right ? '' : 'text-white/55'}`}>
                        {right ? '✓' : '✗'} {stakeOf(prediction) > 0 || payout ? `${net >= 0 ? '+' : '−'}${Math.abs(net)}` : ''}
                        {payout && payout.jackpot > 0 && <span className="ml-1">💎</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>,
            `${challenge.predictions.reduce((sum, p) => sum + stakeOf(p), 0)} coins in the pot`
          )}

        {challenge &&
          block(
            'Live chat',
            chat.length === 0 && cheers.length === 0 ? (
              <p className="text-sm text-white/55">Nobody said a word.</p>
            ) : (
              <div className="grid gap-2">
                {cheerCounts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cheerCounts.map(([emoji, count], index) => (
                      <span key={emoji} className="anim-pop rounded-full bg-surface px-2.5 py-1 text-sm font-bold tabular-nums" style={{ animationDelay: `${index * 60}ms` }}>
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                )}
                <div className="stagger-rows grid max-h-72 gap-1 overflow-y-auto">
                  {chat.map((message, index) => (
                    <div key={message.id} className="flex items-start gap-2 text-sm" style={{ ['--j' as string]: Math.min(index, 20) }}>
                      <PlayerAvatar player={byId.get(message.authorId) ?? null} size={22} />
                      <span className="min-w-0">
                        <b>{first(message.authorName)}</b> <span className="text-[11px] text-white/55">{clock(message.createdAt)}</span>
                        <span className="block break-words text-white/85">{message.text}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            chat.length > 0 ? `${chat.length} message${chat.length === 1 ? '' : 's'}` : undefined
          )}

        {block(
          'Reactions and comments',
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <ReactionBar
              reactions={match.reactions ?? {}}
              myReaction={match.reactions?.[currentPlayer.id]}
              onReact={(emoji) => void props.onReact(match.id, match.reactions?.[currentPlayer.id] === emoji ? null : emoji)}
            />
            <CommentsThread
              matchId={match.id}
              currentPlayer={currentPlayer}
              players={players}
              onOpen={props.onOpenComments}
              onSubmit={(params) => props.onSubmitComment(match.id, params)}
              onDelete={(commentId) => props.onDeleteComment(match.id, commentId)}
            />
          </div>
        )}

        {editable &&
          (editing ? (
            <div className="flex items-center gap-2">
              {[match.winnerId, match.loserId].map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={busy || id === match.winnerId}
                  onClick={() => act(() => props.onEditWinner(match.id, id))}
                  className="press h-11 flex-1 rounded-full bg-surface-alt text-xs font-extrabold uppercase tracking-[0.06em] disabled:opacity-40"
                >
                  {first(byId.get(id)?.name ?? '?')} won
                </button>
              ))}
              <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="press grid h-11 w-11 place-items-center rounded-full bg-surface-alt"><X className="h-5 w-5" /></button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setEditing(true)} disabled={busy} className="press flex h-10 items-center gap-2 rounded-full bg-surface-alt px-4 text-xs font-extrabold uppercase tracking-[0.06em]">
                <Pencil className="h-4 w-4" /> Fix the result
              </button>
              {confirmingDelete ? (
                <>
                  <button type="button" onClick={() => act(() => props.onDelete(match.id))} disabled={busy} className="press flex h-10 items-center gap-2 rounded-full bg-live px-4 text-xs font-extrabold uppercase tracking-[0.06em] text-white">
                    <Trash2 className="h-4 w-4" /> Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} aria-label="Keep it" className="press grid h-10 w-10 place-items-center rounded-full bg-surface-alt"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className="press flex h-10 items-center gap-2 rounded-full bg-surface-alt px-4 text-xs font-extrabold uppercase tracking-[0.06em]">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
              {busy && <Check className="h-5 w-5 self-center opacity-50" />}
            </div>
          ))}
      </div>
    </Sheet>
  );
};
