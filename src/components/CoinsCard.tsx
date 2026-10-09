import React, { useMemo, useState } from 'react';
import { Challenge, Player, Season } from '../types';
import { LedgerEntry, LedgerKind, ledgerWindow } from '../utils/ledger';
import { LedgerDays, LedgerRow, signed } from './CoinLedger';
import { Coin, Sheet } from './ui';

/**
 * The coins card on a profile: the stack over time, where it came from and
 * went, how the calls are going, and where it ranks in the office. Season by
 * season, or all time.
 */
interface CoinsCardProps {
  player: Player;
  players: Player[];
  seasons: Season[];
  challenges: Challenge[];
  /** Anyone's coin log, read off the same data as the balance. */
  ledgerFor: (playerId: string) => LedgerEntry[];
  /** Everyone's stack now, for the office ranking. */
  balances: Map<string, number>;
}

const SOURCES: Array<{ label: string; kinds: LedgerKind[] }> = [
  { label: 'Matches', kinds: ['match', 'daily'] },
  { label: 'Calls', kinds: ['payout', 'call'] },
  { label: 'Jackpot', kinds: ['jackpot'] },
  { label: 'Cup and weekly', kinds: ['cup', 'task'] },
  { label: 'Pack shop', kinds: ['shop'] },
  { label: 'Cards and gifts', kinds: ['cards', 'set', 'grant'] },
];

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const first = (name: string) => name.split(' ')[0];
const shortDate = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The stack as a stepped line: it moves only when a coin does. */
const StackChart: React.FC<{ entries: LedgerEntry[]; opening: number; from: number; until: number; seasons: Season[] }> = ({ entries, opening, from, until, seasons }) => {
  const [hover, setHover] = useState<number | null>(null);
  const ordered = [...entries].reverse();
  const W = 340, H = 160, L = 4, R = 40, T = 16, B = 20;
  const values = [opening, ...ordered.map((entry) => entry.after)];
  const lo = Math.min(0, ...values), hi = Math.max(...values, 10);
  const pad = (hi - lo) * 0.08;
  const x = (at: number) => L + ((Math.max(from, Math.min(until, at)) - from) * (W - L - R)) / Math.max(1, until - from);
  const y = (value: number) => T + ((hi + pad - value) * (H - T - B)) / (hi - lo + 2 * pad);

  let path = `M${x(from).toFixed(1)} ${y(opening).toFixed(1)}`;
  for (const entry of ordered) path += ` H${x(entry.at).toFixed(1)} V${y(entry.after).toFixed(1)}`;
  path += ` H${x(until).toFixed(1)}`;
  const last = ordered.length ? ordered[ordered.length - 1].after : opening;

  const shown = hover === null ? null : ordered[hover];
  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = from + ((((event.clientX - box.left) / box.width) * W - L) / (W - L - R)) * (until - from);
    let index = -1;
    ordered.forEach((entry, i) => {
      if (entry.at <= at) index = i;
    });
    setHover(index >= 0 ? index : null);
  };
  const boundaries = seasons.filter((season) => season.startedAt > from && season.startedAt < until);

  return (
    <div className="grid gap-2">
      <div className="flex min-h-[38px] items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
        {shown ? (
          <>
            <span className="grid min-w-0">
              <span className="truncate text-[12px] font-extrabold">{shown.title}</span>
              <span className="truncate text-[10px] font-semibold text-white/55">{new Date(shown.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <span className="grid flex-none justify-items-end">
              <span className="text-[13px] font-black tabular-nums">{signed(shown.amount)}</span>
              <span className="text-[10px] font-semibold tabular-nums text-white/55">{Math.round(shown.before)} → {Math.round(shown.after)}</span>
            </span>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-white/55">Touch the line to see each move</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Coins from ${Math.round(opening)} to ${Math.round(last)}`}
        className="block h-auto w-full touch-none overflow-visible"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setHover(null)}
      >
        {lo < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.18)" />}
        <line x1={L} x2={W - R} y1={y(opening)} y2={y(opening)} stroke="rgba(255,255,255,.22)" strokeDasharray="3 4" />
        <text x={W - R + 6} y={y(opening) + 4} fill="rgba(255,255,255,.5)" fontSize="10" fontWeight="700">{Math.round(opening)}</text>
        <text x={W - R + 6} y={y(last) + 4} fill="#fff" fontSize="11" fontWeight="800">{Math.round(last)}</text>
        {boundaries.map((season) => (
          <g key={season.id}>
            <line x1={x(season.startedAt)} x2={x(season.startedAt)} y1={T - 6} y2={H - B} stroke="rgba(255,255,255,.22)" strokeDasharray="2 3" />
            <text x={x(season.startedAt) + 4} y={T - 2} fill="rgba(255,255,255,.5)" fontSize="9" fontWeight="700">S{season.number}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {ordered.map((entry) =>
          entry.kind === 'jackpot' && entry.amount > 0 ? (
            <circle key={entry.id} cx={x(entry.at)} cy={y(entry.after)} r="6" fill="var(--color-crown)" stroke="var(--color-card)" strokeWidth="2" />
          ) : entry.kind === 'payout' ? (
            <circle key={entry.id} cx={x(entry.at)} cy={y(entry.after)} r="4" fill="var(--color-felt)" stroke="var(--color-card)" strokeWidth="2" />
          ) : null
        )}
        {shown && (
          <>
            <line x1={x(shown.at)} x2={x(shown.at)} y1={T} y2={H - B} stroke="rgba(255,255,255,.4)" />
            <circle cx={x(shown.at)} cy={y(shown.after)} r="5" fill="#fff" stroke="var(--color-card)" strokeWidth="2" />
          </>
        )}
        <text x={L} y={H - 4} fill="rgba(255,255,255,.45)" fontSize="9" fontWeight="700">{shortDate(from)}</text>
        <text x={W - R} y={H - 4} textAnchor="end" fill="rgba(255,255,255,.45)" fontSize="9" fontWeight="700">{shortDate(until)}</text>
      </svg>
      <div className="flex items-center gap-4 px-1 text-[11px] font-semibold text-white/55">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-crown" />Jackpot</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-felt" />Call came in</span>
      </div>
    </div>
  );
};

/** Where it came from and where it went, as plain bars, biggest first. */
const Breakdown: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
  const rows = (sign: 1 | -1) =>
    SOURCES.map((source) => ({
      label: source.label,
      total: entries.filter((entry) => source.kinds.includes(entry.kind) && Math.sign(entry.amount) === sign).reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
    }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
  const ins = rows(1);
  const outs = rows(-1);
  const max = Math.max(1, ...ins.map((row) => row.total), ...outs.map((row) => row.total));
  const block = (title: string, list: typeof ins, sign: string) => (
    <div className="grid gap-2">
      <span className="text-[12px] font-extrabold text-white/70">{title}</span>
      {list.length === 0 && <span className="text-[12px] font-semibold text-white/40">Nothing</span>}
      {list.map((row) => (
        <div key={row.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-2.5">
          <span className="truncate text-[12px] font-semibold">{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-alt">
            <span className={`grow-x block h-full rounded-full ${sign === '+' ? 'bg-white' : 'bg-white/45'}`} style={{ width: `${(row.total / max) * 100}%` }} />
          </span>
          <span className="text-[12px] font-black tabular-nums">{sign === '+' ? '+' : '−'}{row.total}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="grid gap-4 rounded-2xl bg-card p-3.5">
      {block('Where it came from', ins, '+')}
      {block('Where it went', outs, '−')}
    </div>
  );
};

export const CoinsCard: React.FC<CoinsCardProps> = ({ player, players, seasons, challenges, ledgerFor, balances }) => {
  const ordered = useMemo(() => [...seasons].sort((a, b) => b.startedAt - a.startedAt), [seasons]);
  const running = ordered.find((season) => season.endedAt === null);
  const [scope, setScope] = useState<string>(running?.id ?? 'all');
  const [details, setDetails] = useState(false);
  const all = useMemo(() => ledgerFor(player.id), [ledgerFor, player.id]);
  const now = Date.now();

  const season = ordered.find((entry) => entry.id === scope) ?? null;
  const dated = all.filter((entry) => entry.at > 0);
  const from = season ? season.startedAt : dated.length ? dated[dated.length - 1].at - 3_600_000 : now - 86_400_000;
  const until = season?.endedAt ?? now;
  const { entries, opening } = season ? ledgerWindow(all, from, until + 1) : { entries: dated, opening: all.filter((entry) => entry.at === 0).reduce((sum, entry) => sum + entry.amount, 0) };
  const closing = entries.length ? entries[0].after : opening;
  const gained = entries.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const spent = entries.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0);

  // Calls in the window: hit rate, what they made, the best one, and who you read best.
  const calls = useMemo(() => {
    const mine = challenges.flatMap((challenge) =>
      challenge.predictions
        .filter((prediction) => prediction.predictorId === player.id && prediction.createdAt >= from && prediction.createdAt <= until)
        .map((prediction) => ({ challenge, prediction }))
    );
    const settled = mine.filter(({ challenge }) => challenge.status === 'played' && challenge.resolvedWinnerId);
    const right = settled.filter(({ challenge, prediction }) => challenge.resolvedWinnerId === prediction.predictedWinnerId);
    const profit = entries.filter((entry) => entry.kind === 'call' || entry.kind === 'payout' || entry.kind === 'jackpot').reduce((sum, entry) => sum + entry.amount, 0);
    const byChallenge = new Map<string, number>();
    for (const entry of entries) if (entry.challengeId) byChallenge.set(entry.challengeId, (byChallenge.get(entry.challengeId) ?? 0) + entry.amount);
    const best = [...byChallenge].sort((a, b) => b[1] - a[1])[0];
    const bestChallenge = best ? challenges.find((challenge) => challenge.id === best[0]) : undefined;
    const readOn = new Map<string, number>();
    for (const { prediction } of right) readOn.set(prediction.predictedWinnerId, (readOn.get(prediction.predictedWinnerId) ?? 0) + 1);
    const favourite = [...readOn].sort((a, b) => b[1] - a[1])[0];
    return { made: mine.length, settled: settled.length, right: right.length, profit, best: best && best[1] > 0 ? { amount: best[1], challenge: bestChallenge } : null, favourite };
  }, [challenges, player.id, from, until, entries]);

  // The office: where this stack ranks, and who won the most this week.
  const office = useMemo(() => {
    const table = players.map((entry) => ({ id: entry.id, coins: Math.round(balances.get(entry.id) ?? 0) })).sort((a, b) => b.coins - a.coins);
    const place = table.findIndex((entry) => entry.id === player.id);
    const above = place > 0 ? table[place - 1] : null;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const week = players
      .map((entry) => ({ id: entry.id, net: ledgerFor(entry.id).filter((item) => item.at >= weekAgo).reduce((sum, item) => sum + item.amount, 0) }))
      .sort((a, b) => b.net - a.net)[0];
    return { place: place + 1, of: table.length, above, week };
  }, [players, balances, player.id, ledgerFor]);

  const nameOf = (id: string) => first(players.find((entry) => entry.id === id)?.name ?? 'Someone');
  const scopes = [...ordered.map((entry) => ({ id: entry.id, label: entry.name })), { id: 'all', label: 'All time' }];

  const tabs = (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {scopes.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => setScope(entry.id)}
          className={`press h-8 flex-none rounded-full px-3 text-[12px] font-extrabold transition-colors ${scope === entry.id ? 'bg-white text-bg' : 'bg-surface-alt text-white/70'}`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );

  const callStats = (
    <div className="grid gap-2.5 rounded-2xl bg-card p-3.5">
      <span className="text-[12px] font-extrabold text-white/70">Calls</span>
      <div className="grid grid-cols-3 gap-2">
        {[
          [calls.settled ? `${Math.round((calls.right / calls.settled) * 100)}%` : '0%', `${calls.right} of ${calls.settled} right`],
          [signed(calls.profit), 'Made on calls'],
          [String(calls.made), 'Calls made'],
        ].map(([value, label]) => (
          <div key={label} className="grid gap-1 rounded-xl bg-surface p-2.5">
            <span className="font-display text-[20px] font-extrabold leading-none tabular-nums">{value}</span>
            <span className="text-[10px] font-semibold text-white/55">{label}</span>
          </div>
        ))}
      </div>
      {calls.best?.challenge && (
        <span className="text-[12px] font-semibold text-white/70">
          Best call: <b className="text-white">{signed(calls.best.amount)}</b> on {nameOf(calls.best.challenge.challengerId)} vs {nameOf(calls.best.challenge.opponentId)}
        </span>
      )}
      {calls.favourite && (
        <span className="text-[12px] font-semibold text-white/70">
          Reads <b className="text-white">{nameOf(calls.favourite[0])}</b> best, right {calls.favourite[1]} {calls.favourite[1] === 1 ? 'time' : 'times'}
        </span>
      )}
    </div>
  );

  const officeLine = (
    <div className="grid gap-1 rounded-2xl bg-card p-3.5 text-[12px] font-semibold text-white/70">
      <span>
        <b className="text-white">{ordinal(office.place)}</b> richest of {office.of}
        {office.above ? `, ${office.above.coins - Math.round(balances.get(player.id) ?? 0) + 1} to pass ${nameOf(office.above.id)}` : ', nobody above'}
      </span>
      {office.week && office.week.net > 0 && (
        <span>
          Biggest winner this week: <b className="text-white">{nameOf(office.week.id)}</b> {signed(office.week.net)}
        </span>
      )}
    </div>
  );

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base">Coins</h3>
        <button type="button" onClick={() => setDetails(true)} className="press text-xs font-extrabold text-white/70">
          All details ›
        </button>
      </div>
      <div className="grid gap-3 rounded-2xl bg-card p-3.5">
        {tabs}
        <div className="flex items-end justify-between gap-3">
          <span className="flex items-center gap-2 font-display text-[30px] font-extrabold leading-none tabular-nums">
            <Coin size={24} />
            {Math.round(closing)}
          </span>
          <span className="grid justify-items-end text-[11px] font-semibold tabular-nums text-white/55">
            <span>{Math.round(opening)} → {Math.round(closing)}</span>
            <span>
              <b className="text-white">+{gained}</b> in <b className="pl-1.5 text-white/80">−{spent}</b> out
            </span>
          </span>
        </div>
        <StackChart entries={entries} opening={opening} from={from} until={until} seasons={scope === 'all' ? seasons : []} />
      </div>
      {officeLine}
      {entries.length > 0 && (
        <div className="grid overflow-hidden rounded-2xl bg-card">
          {entries.slice(0, 4).map((entry, index) => (
            <LedgerRow key={entry.id} entry={entry} divided={index > 0} />
          ))}
          {entries.length > 4 && (
            <button type="button" onClick={() => setDetails(true)} className="press border-t border-white/5 px-3.5 py-2.5 text-left text-[12px] font-extrabold text-white/70">
              All {entries.length} moves ›
            </button>
          )}
        </div>
      )}

      {details && (
        <Sheet title={`Coins, ${scopes.find((entry) => entry.id === scope)?.label ?? ''}`} onClose={() => setDetails(false)} z={60}>
          {tabs}
          <Breakdown entries={entries} />
          {callStats}
          {officeLine}
          <LedgerDays entries={entries} />
        </Sheet>
      )}
    </section>
  );
};
