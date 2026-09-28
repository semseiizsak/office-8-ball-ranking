import React, { useRef, useState } from 'react';
import { Sparkles, UserPlus, X } from 'lucide-react';
import { BallPreference, Player } from '../types';

interface AddPlayerModalProps {
  onAdd: (params: {
    name: string;
    department?: string;
    title?: string;
    ballPreference: BallPreference;
  }) => Promise<Player>;
  onClose: () => void;
}

/**
 * Enrolling somebody was the only thing the roster tab did that the ladder did
 * not, so it lives here now and the tab is gone.
 */
export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({ onAdd, onClose }) => {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [ballPreference, setBallPreference] = useState<BallPreference>('solids');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      await onAdd({
        name: name.trim(),
        department: department.trim() || undefined,
        ballPreference,
      });
      onClose();
    } catch {
      setError('Could not add that player. Try again.');
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="anim-sheet w-full max-w-md rounded-t-2xl border border-white/10 bg-[#0A0A0A] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-white">
            <UserPlus className="h-4 w-4 text-white" />
            Enroll contender
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/55 hover:bg-[#171717] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 py-4">
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-white/55">
              Player full name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Roland Varga"
              className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 font-sans text-xs text-white placeholder:text-white/55 focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-white/55">
              Department / role (optional)
            </label>
            <input
              type="text"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="e.g. Product Engineering"
              className="w-full rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5 font-sans text-xs text-white placeholder:text-white/55 focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium text-white/55">
              Ball preference
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['solids', 'stripes'] as const).map((preference) => (
                <button
                  key={preference}
                  type="button"
                  onClick={() => setBallPreference(preference)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 font-display text-xs font-bold capitalize transition-all ${
                    ballPreference === preference
                      ? preference === 'solids'
                        ? 'border-white bg-white/20 text-white'
                        : 'border-[#F2B705] bg-white/20 text-[#F2B705]'
                      : 'border-white/10 bg-[#171717] text-white/55'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      preference === 'solids' ? 'bg-[#F2B705]' : 'bg-[#7D97F0]'
                    }`}
                  />
                  {preference}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-white/40 bg-white/10 p-3 text-xs text-[#FF6B7D]">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-display text-sm font-bold text-[#0A0A0A] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isSubmitting ? 'Adding...' : 'Add contender (1000 Elo)'}
        </button>
      </form>
    </div>
  );
};
