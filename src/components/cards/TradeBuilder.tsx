import React, { useState } from 'react';
import { Player } from '../../types';
import { Card, RARITIES } from '../../utils/cards';
import { PlayerAvatar, Sheet, fieldClass, labelClass } from '../ui';
import { PlayerCard } from './PlayerCard';

const byRarity = (a: Card, b: Card) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || a.createdAt - b.createdAt;

/** A grid of cards to tick. */
const Picker: React.FC<{ cards: Card[]; picked: string[]; byId: Map<string, Player>; onToggle: (id: string) => void; empty: string }> = ({ cards, picked, byId, onToggle, empty }) =>
  cards.length === 0 ? (
    <p className="rounded-xl bg-surface p-3 text-sm font-semibold text-white/55">{empty}</p>
  ) : (
    <div className="grid grid-cols-5 gap-2">
      {cards.map((card) => {
        const on = picked.includes(card.id);
        return (
          <button
            key={card.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(card.id)}
            className={`press relative rounded-lg p-0.5 transition-[box-shadow,opacity] duration-200 ease-[var(--ease)] ${on ? 'shadow-[0_0_0_2px_#fff]' : 'opacity-70'}`}
          >
            <PlayerCard card={card} player={byId.get(card.playerId)} other={card.otherId ? byId.get(card.otherId) : null} size="mini" />
          </button>
        );
      })}
    </div>
  );

/**
 * Building an offer: who with, what you give, what you want back. Asking for
 * nothing makes it a gift. Errors from the service show inline.
 */
export const TradeBuilder: React.FC<{
  me: Player;
  players: Player[];
  cards: Card[];
  initial: { toId?: string; give?: string[]; want?: string[]; gift?: boolean };
  onSend: (toId: string, give: string[], want: string[], note?: string) => Promise<void>;
  onClose: () => void;
}> = ({ me, players, cards, initial, onSend, onClose }) => {
  const others = players.filter((player) => player.id !== me.id);
  const byId = new Map(players.map((player) => [player.id, player]));
  const [toId, setToId] = useState(initial.toId ?? '');
  const [give, setGive] = useState<string[]>(initial.give ?? []);
  const [want, setWant] = useState<string[]>(initial.want ?? []);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const mine = cards.filter((card) => card.ownerId === me.id).sort(byRarity);
  const theirs = cards.filter((card) => card.ownerId === toId).sort(byRarity);
  const toggle = (list: string[], set: (next: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const ready = !!toId && give.length + want.length > 0 && !sending;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    setError('');
    try {
      await onSend(toId, give, want, note.trim() || undefined);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The offer did not go through.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      title={initial.gift ? 'Give a card' : 'Trade'}
      onClose={onClose}
      z={60}
      footer={
        <div className="grid gap-2">
          {error && <p role="alert" className="rounded-xl bg-live p-3 text-sm font-semibold text-white">{error}</p>}
          <button type="button" disabled={!ready} onClick={send} className="press h-12 w-full rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg disabled:opacity-40">
            {sending ? 'Sending' : want.length === 0 ? 'Send as a gift' : 'Send offer'}
          </button>
        </div>
      }
    >
      <div className={labelClass}>
        With
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {others.map((player) => (
            <button
              key={player.id}
              type="button"
              aria-pressed={toId === player.id}
              onClick={() => {
                setToId(player.id);
                setWant([]);
              }}
              className={`press grid flex-none justify-items-center gap-1 rounded-2xl p-2 normal-case tracking-normal ${toId === player.id ? 'bg-white text-bg' : 'bg-surface text-white'}`}
            >
              <PlayerAvatar player={player} size={40} />
              <span className="max-w-[56px] truncate text-xs font-bold">{player.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={labelClass}>
        You give {give.length > 0 && <span className="text-white">{give.length}</span>}
        <Picker cards={mine} picked={give} byId={byId} onToggle={(id) => toggle(give, setGive, id)} empty="No cards yet." />
      </div>
      {!initial.gift && (
        <div className={labelClass}>
          You want {want.length > 0 && <span className="text-white">{want.length}</span>}
          {toId ? (
            <Picker cards={theirs} picked={want} byId={byId} onToggle={(id) => toggle(want, setWant, id)} empty="They have no cards yet." />
          ) : (
            <p className="rounded-xl bg-surface p-3 text-sm font-semibold normal-case tracking-normal text-white/55">Pick who to trade with first.</p>
          )}
        </div>
      )}
      <label className={labelClass}>
        Note
        <input value={note} maxLength={140} onChange={(event) => setNote(event.target.value)} placeholder="Optional" className={fieldClass} />
      </label>
    </Sheet>
  );
};
