import React, { useEffect, useRef, useState } from 'react';
import { LEDGER_EMOJI, LedgerEntry } from '../utils/ledger';
import { dayKeyOf } from '../utils/daily';
import { Coin, Sheet } from './ui';

const signed = (amount: number) => (amount > 0 ? `+${amount}` : `−${Math.abs(amount)}`);

const dayLabel = (at: number, now: number) => {
  if (at === 0) return 'Earlier';
  const key = dayKeyOf(at);
  if (key === dayKeyOf(now)) return 'Today';
  if (key === dayKeyOf(now - 86_400_000)) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};

const timeOf = (at: number) => (at === 0 ? '' : new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

/** Every coin in and out of your stack, newest first, a day at a time. */
export const CoinLedgerSheet: React.FC<{ entries: LedgerEntry[]; balance: number; onClose: () => void }> = ({ entries, balance, onClose }) => {
  const now = Date.now();
  const days: Array<{ label: string; total: number; entries: LedgerEntry[] }> = [];
  for (const entry of entries) {
    const label = dayLabel(entry.at, now);
    const last = days[days.length - 1];
    if (last && last.label === label) {
      last.entries.push(entry);
      last.total += entry.amount;
    } else days.push({ label, total: entry.amount, entries: [entry] });
  }
  const weekAgo = now - 7 * 86_400_000;
  const week = entries.filter((entry) => entry.at >= weekAgo);
  const weekIn = week.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const weekOut = week.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0);

  return (
    <Sheet title="Your coins" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1 rounded-2xl bg-card p-3">
          <span className="flex items-center gap-1.5 font-display text-[22px] font-extrabold leading-none tabular-nums">
            <Coin size={18} />
            {balance}
          </span>
          <span className="text-[11px] font-semibold text-white/55">Now</span>
        </div>
        <div className="grid gap-1 rounded-2xl bg-card p-3">
          <span className="font-display text-[22px] font-extrabold leading-none tabular-nums">+{weekIn}</span>
          <span className="text-[11px] font-semibold text-white/55">In, last 7 days</span>
        </div>
        <div className="grid gap-1 rounded-2xl bg-card p-3">
          <span className="font-display text-[22px] font-extrabold leading-none tabular-nums text-white/70">−{weekOut}</span>
          <span className="text-[11px] font-semibold text-white/55">Out, last 7 days</span>
        </div>
      </div>

      {days.length === 0 && <p className="rounded-2xl bg-card p-4 text-sm font-semibold text-white/55">Nothing yet. Play a match or call one.</p>}

      {days.map((day) => (
        <section key={day.label} className="grid gap-1.5">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-sm font-extrabold">{day.label}</span>
            <span className="text-xs font-black tabular-nums text-white/55">{signed(day.total)}</span>
          </div>
          <div className="grid overflow-hidden rounded-2xl bg-card">
            {day.entries.map((entry, index) => (
              <div key={entry.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${index > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-alt text-base">{LEDGER_EMOJI[entry.kind]}</span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-[13px] font-extrabold">{entry.title}</span>
                  {entry.detail && <span className="truncate text-[11px] font-semibold text-white/55">{entry.detail}</span>}
                </span>
                <span className="grid flex-none justify-items-end">
                  <span className={`text-sm font-black tabular-nums ${entry.amount > 0 ? 'text-white' : 'text-white/55'}`}>{signed(entry.amount)}</span>
                  <span className="text-[10px] font-semibold tabular-nums text-white/40">{timeOf(entry.at)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
};

/**
 * The little "+40 Beat Dave" that rises off the coin count when the stack
 * moves while you are looking. Nothing on first load: only what is new.
 */
export const CoinPop: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
  const seen = useRef<Set<string> | null>(null);
  const [pop, setPop] = useState<{ key: number; amount: number; label: string } | null>(null);

  useEffect(() => {
    const ids = new Set(entries.map((entry) => entry.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const fresh = entries.filter((entry) => !seen.current!.has(entry.id));
    seen.current = ids;
    if (fresh.length === 0) return;
    const amount = fresh.reduce((sum, entry) => sum + entry.amount, 0);
    if (amount === 0) return;
    const biggest = [...fresh].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    setPop({ key: Date.now(), amount, label: fresh.length === 1 ? biggest.title : `${biggest.title} and more` });
  }, [entries]);

  useEffect(() => {
    if (!pop) return;
    const timer = window.setTimeout(() => setPop(null), 2400);
    return () => window.clearTimeout(timer);
  }, [pop]);

  if (!pop) return null;
  return (
    <span key={pop.key} className="coin-pop pointer-events-none absolute bottom-full right-2 mb-1.5 flex items-center gap-1.5 whitespace-nowrap">
      <span className={`rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${pop.amount > 0 ? 'bg-felt text-white' : 'bg-surface-alt text-white'}`}>{signed(pop.amount)}</span>
      <span className="rounded-full bg-elev px-2.5 py-1 text-[11px] font-bold text-white/80">{pop.label}</span>
    </span>
  );
};
