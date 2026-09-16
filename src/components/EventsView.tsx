import React, { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { MatchRecord, Player } from '../types';

interface EventsViewProps {
  matches: MatchRecord[];
  players: Player[];
  onEditWinner: (matchId: string, winnerId: string) => Promise<void>;
  onDelete: (matchId: string) => Promise<void>;
}

export const EventsView: React.FC<EventsViewProps> = ({ matches, players, onEditWinner, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const beginEdit = (match: MatchRecord) => {
    setEditingId(match.id);
    setWinnerId(match.winnerId);
    setError('');
  };

  const saveEdit = async (match: MatchRecord) => {
    if (!winnerId || winnerId === match.winnerId) {
      setEditingId(null);
      return;
    }
    try {
      setBusyId(match.id);
      await onEditWinner(match.id, winnerId);
      setEditingId(null);
    } catch {
      setError('Could not edit this event.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (match: MatchRecord) => {
    if (!window.confirm(`Delete ${match.playerAName} vs ${match.playerBName}? Ratings will be recalculated.`)) return;
    try {
      setBusyId(match.id);
      await onDelete(match.id);
    } catch {
      setError('Could not delete this event.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-20 pt-1">
      <div className="px-1">
        <h2 className="font-['Chivo'] text-2xl font-black text-white">Logged Events</h2>
        <p className="mt-0.5 text-xs text-[#86948a]">Review, correct, or remove recorded matches.</p>
      </div>
      {error && <p className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-xs text-[#ffb4ab]">{error}</p>}
      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#161b22] px-5 py-12 text-center">
          <p className="font-['Chivo'] text-sm font-bold text-white">No events logged yet</p>
          <p className="mt-1 text-xs text-[#86948a]">Completed matches will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => {
            const winnerIsA = match.winnerId === match.playerAId;
            const isEditing = editingId === match.id;
            const isBusy = busyId === match.id;
            return (
              <div key={match.id} className="rounded-2xl border border-[#30363d] bg-[#161b22] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#86948a]">
                      {new Date(match.timestamp).toLocaleString()}
                    </p>
                    <p className="mt-1 font-['Chivo'] text-sm font-bold text-white">
                      {match.playerAName} <span className="text-[#86948a]">vs</span> {match.playerBName}
                    </p>
                    <p className="mt-1 text-xs text-[#bbcabf]">
                      Winner: <span className="font-bold text-[#4edea3]">{winnerIsA ? match.playerAName : match.playerBName}</span> · {match.eloDelta} Elo exchanged
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => beginEdit(match)} disabled={isBusy} className="rounded-lg border border-[#30363d] p-2 text-[#86948a] hover:border-[#10b981] hover:text-[#4edea3]" title="Edit event">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => remove(match)} disabled={isBusy} className="rounded-lg border border-[#30363d] p-2 text-[#86948a] hover:border-[#ef4444] hover:text-[#ffb4ab]" title="Delete event">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[#30363d] pt-3">
                    <select value={winnerId} onChange={(event) => setWinnerId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#30363d] bg-[#10141a] px-2 py-2 text-xs text-white outline-none focus:border-[#10b981]">
                      {[match.playerAId, match.playerBId].map((playerId) => {
                        const player = players.find((entry) => entry.id === playerId);
                        return <option key={playerId} value={playerId}>{player?.name ?? (playerId === match.playerAId ? match.playerAName : match.playerBName)}</option>;
                      })}
                    </select>
                    <button type="button" onClick={() => saveEdit(match)} disabled={isBusy} className="rounded-lg bg-[#10b981] p-2 text-[#002113]" title="Save event"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-[#30363d] p-2 text-[#86948a]" title="Cancel edit"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
