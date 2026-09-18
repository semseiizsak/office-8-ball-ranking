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
        className="anim-sheet w-full max-w-md rounded-t-2xl border border-[#30363d] bg-[#10141a] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
          <h3 className="flex items-center gap-2 font-['Chivo'] text-base font-bold text-white">
            <UserPlus className="h-4 w-4 text-[#4edea3]" />
            Enroll contender
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#86948a] hover:bg-[#1c2026] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 py-4">
          <div>
            <label className="mb-1 block font-['Space_Grotesk'] text-[11px] font-medium text-[#86948a]">
              Player full name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Roland Varga"
              className="w-full rounded-xl border border-[#30363d] bg-[#1c2026] px-3 py-2.5 font-['Space_Grotesk'] text-xs text-white placeholder:text-[#86948a] focus:border-[#10b981] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-['Space_Grotesk'] text-[11px] font-medium text-[#86948a]">
              Department / role (optional)
            </label>
            <input
              type="text"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="e.g. Product Engineering"
              className="w-full rounded-xl border border-[#30363d] bg-[#1c2026] px-3 py-2.5 font-['Space_Grotesk'] text-xs text-white placeholder:text-[#86948a] focus:border-[#10b981] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-['Space_Grotesk'] text-[11px] font-medium text-[#86948a]">
              Ball preference
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['solids', 'stripes'] as const).map((preference) => (
                <button
                  key={preference}
                  type="button"
                  onClick={() => setBallPreference(preference)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 font-['Chivo'] text-xs font-bold capitalize transition-all ${
                    ballPreference === preference
                      ? preference === 'solids'
                        ? 'border-[#10b981] bg-[#10b981]/20 text-[#4edea3]'
                        : 'border-[#ffb95f] bg-[#ffb95f]/20 text-[#ffb95f]'
                      : 'border-[#30363d] bg-[#1c2026] text-[#86948a]'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      preference === 'solids' ? 'bg-[#d97706]' : 'bg-[#38bdf8]'
                    }`}
                  />
                  {preference}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 p-3 text-xs text-[#ffb4ab]">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10b981] px-4 py-3 font-['Chivo'] text-sm font-bold text-[#002113] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isSubmitting ? 'Adding...' : 'Add contender (1000 Elo)'}
        </button>
      </form>
    </div>
  );
};
