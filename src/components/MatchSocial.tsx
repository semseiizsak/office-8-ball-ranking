import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { MatchComment, Player } from '../types';
import { readGif, readImage } from '../utils/image';

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

const CommentAvatar: React.FC<{ player?: Player; name: string }> = ({ player, name }) =>
  player?.avatarUrl ? (
    <img
      src={player.avatarUrl}
      alt={name}
      referrerPolicy="no-referrer"
      className="h-7 w-7 shrink-0 rounded-full border border-[#30363d] object-cover"
    />
  ) : (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#30363d] bg-[#262a31] font-['Chivo'] text-[11px] font-bold text-[#4edea3]">
      {name.charAt(0).toUpperCase()}
    </div>
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
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-all active:scale-95 ${
              mine
                ? 'border-[#4edea3] bg-[#10b981]/15'
                : count > 0
                ? 'border-[#30363d] bg-[#1c2026] hover:border-[#4edea3]/50'
                : 'border-[#30363d]/60 bg-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && (
              <span className={`font-['JetBrains_Mono'] font-bold ${mine ? 'text-[#4edea3]' : 'text-[#86948a]'}`}>
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
    <div className="mt-3 space-y-3 border-t border-[#30363d] pt-3">
      {comments === null ? (
        <p className="text-center font-['Space_Grotesk'] text-xs text-[#86948a]">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-center font-['Space_Grotesk'] text-xs text-[#86948a]">No comments yet. Say something.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const author = byId.get(comment.authorId);
            return (
              <div key={comment.id} className="flex gap-2">
                <CommentAvatar player={author} name={comment.authorName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate font-['Chivo'] text-xs font-bold text-white">
                      {comment.authorName}
                    </span>
                    <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-[#86948a]">
                      {timeAgo(comment.createdAt)}
                    </span>
                    {comment.authorId === currentPlayer.id && (
                      <button
                        type="button"
                        onClick={() => onDelete(comment.id)}
                        className="ml-auto shrink-0 text-[#86948a] hover:text-[#ffb4ab]"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {comment.text && (
                    <p className="mt-0.5 break-words font-['Space_Grotesk'] text-xs text-[#bbcabf]">
                      {comment.text}
                    </p>
                  )}
                  {comment.imageDataUrl && (
                    <img
                      src={comment.imageDataUrl}
                      alt=""
                      className="mt-1.5 max-h-56 w-auto max-w-full rounded-xl border border-[#30363d] object-cover"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-center text-[11px] text-[#ffb4ab]">{error}</p>}

      {pendingAttachment && (
        <div className="relative inline-block">
          <img src={pendingAttachment} alt="" className="max-h-28 rounded-xl border border-[#30363d] object-cover" />
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#ef4444] text-white"
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
          className="min-w-0 flex-1 rounded-full border border-[#30363d] bg-[#10141a] px-3.5 py-2 text-xs text-white outline-none focus:border-[#10b981]"
        />
        <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePickImage} className="sr-only" />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          title="Add a photo"
          className="shrink-0 rounded-full border border-[#30363d] p-2 text-[#86948a] hover:border-[#10b981] hover:text-[#4edea3]"
        >
          <ImageIcon className="h-4 w-4" />
        </button>
        <input ref={gifInputRef} type="file" accept="image/gif" onChange={handlePickGif} className="sr-only" />
        <button
          type="button"
          onClick={() => gifInputRef.current?.click()}
          title="Add a gif"
          className="shrink-0 rounded-full border border-[#30363d] px-2 py-1.5 font-['JetBrains_Mono'] text-[10px] font-black text-[#86948a] hover:border-[#10b981] hover:text-[#4edea3]"
        >
          GIF
        </button>
        <button
          type="button"
          disabled={!canSend || isSending}
          onClick={send}
          title="Post"
          className="shrink-0 rounded-full bg-[#10b981] p-2 text-[#002113] disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
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
    className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] font-bold text-[#86948a] hover:text-white"
  >
    <MessageCircle className="h-3.5 w-3.5" />
    {count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : open ? 'Hide comments' : 'Comment'}
  </button>
);
