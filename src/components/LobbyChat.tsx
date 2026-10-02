import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { LobbyMessage, Player } from '../types';
import { PlayerAvatar } from './ui';

const clockOf = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

type LobbySubscribe = (onChange: (messages: LobbyMessage[]) => void) => () => void;

/** Follows the live office chat for as long as the view using it is mounted. */
const useLobby = (subscribe: LobbySubscribe) => {
  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  useEffect(() => subscribe(setMessages), [subscribe]);
  return messages;
};

const MessageLine: React.FC<{ message: LobbyMessage; author?: Player; big?: boolean }> = ({ message, author, big }) => {
  if (message.kind === 'system') {
    return (
      <p className={`card-drop justify-self-center rounded-full bg-surface-alt px-3 py-1 text-center font-semibold text-white/70 ${big ? 'text-lg' : 'text-xs'}`}>
        {message.text}
      </p>
    );
  }
  return (
    <div className={`card-drop grid grid-cols-[auto_1fr] items-start ${big ? 'gap-4' : 'gap-2.5'}`}>
      <PlayerAvatar player={author ?? { id: message.authorId, name: message.authorName, avatarUrl: '' }} size={big ? 52 : 28} />
      <p className={`min-w-0 [overflow-wrap:anywhere] ${big ? 'text-2xl leading-snug' : 'text-[13px] leading-snug'}`}>
        <b className="font-extrabold">{message.authorName.split(' ')[0]}</b>
        <span className={`ml-2 font-semibold tabular-nums text-white/40 ${big ? 'text-base' : 'text-[11px]'}`}>{clockOf(message.createdAt)}</span>
        <br />
        {message.text}
      </p>
    </div>
  );
};

/**
 * The office chat on the Ranks tab: everybody's in the same room, and the app
 * only chimes in for the handful of things worth everyone's attention.
 */
export const LobbyChat: React.FC<{
  subscribe: LobbySubscribe;
  players: Player[];
  currentPlayer: Player;
  onSend: (text: string) => Promise<void>;
}> = ({ subscribe, players, currentPlayer, onSend }) => {
  const messages = useLobby(subscribe);
  const byId = new Map(players.map((player) => [player.id, player]));
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Only follows new lines while you are already at the bottom, so scrolling
  // back to read something is not yanked away by the next message.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && stickToBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      await onSend(text);
      setDraft('');
      stickToBottom.current = true;
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="mt-2 grid gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base">Office chat</h3>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white/55">
          <span className="live-dot h-[7px] w-[7px]" />
          Live
        </span>
      </div>
      <div className="grid gap-2 rounded-2xl bg-card p-2">
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
          }}
          aria-live="polite"
          data-no-pull
          className="no-scrollbar grid h-[300px] content-start gap-3 overflow-y-auto overscroll-contain rounded-xl bg-elev p-3"
        >
          {messages.length === 0 ? (
            <p className="self-center pt-24 text-center text-xs text-white/55">Quiet in here. Say something.</p>
          ) : (
            messages.map((message) => <MessageLine key={message.id} message={message} author={byId.get(message.authorId)} />)
          )}
        </div>
        <form onSubmit={send} className="flex items-center gap-2">
          <PlayerAvatar player={currentPlayer} size={32} className="ml-1" />
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={280}
            placeholder="Message the office"
            aria-label="Message the office"
            enterKeyHint="send"
            className="selectable h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-white outline-none placeholder:text-white/55 focus-visible:shadow-[inset_0_0_0_2px_#fff]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            aria-label="Send"
            className="press grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-bg disabled:opacity-40"
          >
            <SendHorizontal className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
        </form>
      </div>
    </section>
  );
};

/**
 * What the wall tablet falls back to when nobody has touched it for a while:
 * the office chat, big enough to read from across the room. Any tap goes
 * straight back to starting a game.
 */
export const KioskLobby: React.FC<{
  subscribe: LobbySubscribe;
  players: Player[];
  now: number;
  onDismiss: () => void;
}> = ({ subscribe, players, now, onDismiss }) => {
  const messages = useLobby(subscribe);
  const byId = new Map(players.map((player) => [player.id, player]));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onDismiss}
      onKeyDown={onDismiss}
      aria-label="Back to start a game"
      className="anim-fade cursor-pointer fixed inset-0 z-[54] flex flex-col bg-bg px-6 pb-[calc(var(--safe-bottom)+1.5rem)] pt-[calc(var(--safe-top)+1.5rem)] text-left text-white"
    >
      <span className="flex w-full items-end justify-between gap-4">
        <span className="grid gap-1">
          <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.14em] text-white/55">
            <span className="live-dot h-[9px] w-[9px]" />
            Live
          </span>
          <span className="font-display text-5xl font-extrabold uppercase leading-none tracking-[-0.02em]">Office chat</span>
        </span>
        <span className="font-display text-4xl font-extrabold tabular-nums text-white/70">{clockOf(now)}</span>
      </span>

      {/* Newest at the bottom; anything that no longer fits simply drops off the top. */}
      <span className="mt-6 flex min-h-0 w-full flex-1 flex-col justify-end gap-5 overflow-hidden">
        {messages.length === 0 ? (
          <span className="self-center pb-[20vh] text-2xl font-semibold text-white/55">Quiet in here. Say something from your phone.</span>
        ) : (
          messages.slice(-20).map((message) => <MessageLine key={message.id} message={message} author={byId.get(message.authorId)} big />)
        )}
      </span>

      <span className="mt-6 flex h-[60px] w-full flex-none items-center justify-center gap-2.5 rounded-full bg-live text-base font-extrabold uppercase tracking-[0.06em]">
        <span className="live-dot h-[10px] w-[10px]" />
        Tap anywhere to start a game
      </span>
    </div>
  );
};
