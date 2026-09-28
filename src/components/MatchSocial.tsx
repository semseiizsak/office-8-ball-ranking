import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { MatchComment, Player } from '../types';
import { readGif, readImage } from '../utils/image';
import { PlayerAvatar } from './ui';

/** Small, fixed, and a little pointed — a poll would be more work for less fun. */
const REACTIONS = ['🔥', '💀', '😭', '👏', '💰'];

const timeAgo = (value: number): string => {
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const CommentAvatar: React.FC<{ player?: Player; id: string; name: string }> = ({ player, id, name }) => (
  <PlayerAvatar player={player ?? { id, name, avatarUrl: '' }} size={28} />
);

export const ReactionBar: React.FC<{
  reactions: Record<string, string>;
  myReaction?: string;
  onReact: (emoji: string) => void;
}> = ({ reactions, myReaction, onReact }) => {
  const counts = new Map<string, number>();
  for (const emoji of Object.values(reactions) as string[]) {
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const mine = myReaction === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            aria-pressed={mine}
            aria-label={`React ${emoji}`}
            className={`press flex h-9 min-w-[44px] items-center justify-center gap-1 rounded-full px-2.5 text-sm transition-colors ${
              mine ? 'bg-white text-bg' : 'bg-surface-alt text-white hover:bg-[#2C2C2C]'
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && (
              <span className="text-xs font-bold tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const CommentsThread: React.FC<{
  matchId: string;
  currentPlayer: Player;
  players: Player[];
  onOpen: (matchId: string, onChange: (comments: MatchComment[]) => void) => () => void;
  onSubmit: (params: { text: string; imageDataUrl?: string | null }) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}> = ({ matchId, currentPlayer, players, onOpen, onSubmit, onDelete }) => {
  const [comments, setComments] = useState<MatchComment[] | null>(null);
  const [text, setText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const byId = new Map(players.map((player) => [player.id, player]));

  useEffect(() => {
    setComments(null);
    return onOpen(matchId, setComments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const handlePickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setPendingAttachment(await readImage(file, 640, 0.78));
      setError('');
    } catch {
      setError('That image could not be loaded.');
    }
  };

  const handlePickGif = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setPendingAttachment(await readGif(file));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That gif could not be loaded.');
    }
  };

  const canSend = text.trim().length > 0 || Boolean(pendingAttachment);

  const send = async () => {
    if (!canSend || isSending) return;
    setIsSending(true);
    setError('');
    try {
      await onSubmit({ text: text.trim(), imageDataUrl: pendingAttachment });
      setText('');
      setPendingAttachment(null);
    } catch {
      setError('Could not post that. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="anim-fade mt-3 grid gap-3 border-t border-white/10 pt-3">
      {comments === null ? (
        <p className="text-center font-sans text-xs text-white/55">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-center font-sans text-xs text-white/55">No comments yet. Say something.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const author = byId.get(comment.authorId);
            return (
              <div key={comment.id} className="flex gap-2">
                <CommentAvatar player={author} id={comment.authorId} name={comment.authorName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate font-display text-xs font-bold text-white">
                      {comment.authorName}
                    </span>
                    <span className="shrink-0 font-sans tabular-nums text-[10px] text-white/55">
                      {timeAgo(comment.createdAt)}
                    </span>
                    {comment.authorId === currentPlayer.id && (
                      <button
                        type="button"
                        onClick={() => onDelete(comment.id)}
                        className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/55 hover:text-white"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {comment.text && (
                    <p className="mt-0.5 break-words font-sans text-xs text-white/70">
                      {comment.text}
                    </p>
                  )}
                  {comment.imageDataUrl && (
                    <img
                      src={comment.imageDataUrl}
                      alt=""
                      className="mt-1.5 max-h-56 w-auto max-w-full rounded-xl border border-white/10 object-cover"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-center text-[11px] text-[#FF6B7D]">{error}</p>}

      {pendingAttachment && (
        <div className="relative inline-block">
          <img src={pendingAttachment} alt="" className="max-h-28 rounded-xl border border-white/10 object-cover" />
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-bg"
            aria-label="Remove attachment"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && send()}
          placeholder="Add a comment…"
          aria-label="Comment"
          className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-white outline-none placeholder:text-white/55 focus-visible:shadow-[inset_0_0_0_2px_#fff]"
        />
        <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePickImage} className="sr-only" />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          title="Add a photo"
          aria-label="Add a photo"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-alt text-white"
        >
          <ImageIcon className="h-[18px] w-[18px]" />
        </button>
        <input ref={gifInputRef} type="file" accept="image/gif" onChange={handlePickGif} className="sr-only" />
        <button
          type="button"
          onClick={() => gifInputRef.current?.click()}
          title="Add a gif"
          aria-label="Add a gif"
          className="press grid h-11 shrink-0 place-items-center rounded-full bg-surface-alt px-3 text-[11px] font-black text-white"
        >
          GIF
        </button>
        <button
          type="button"
          disabled={!canSend || isSending}
          onClick={send}
          title="Post"
          aria-label="Post"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-bg disabled:opacity-40"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
};

export const CommentsToggle: React.FC<{ count: number; open: boolean; onToggle: () => void }> = ({
  count,
  open,
  onToggle,
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    className="flex h-9 items-center gap-1.5 rounded-full px-2 text-xs font-bold tabular-nums text-white/55 hover:text-white"
  >
    <MessageCircle className="h-4 w-4" />
    {count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : open ? 'Hide comments' : 'Comment'}
  </button>
);
