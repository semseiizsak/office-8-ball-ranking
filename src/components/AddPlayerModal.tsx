import React, { useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { BallPreference, Player } from '../types';
import { BallPicker, Sheet, fieldClass, labelClass } from './ui';

interface AddPlayerModalProps {
  onAdd: (params: { name: string; department?: string; title?: string; ballPreference: BallPreference; ball?: number }) => Promise<Player>;
  onClose: () => void;
}

/** Enrolling somebody new: a name, a team and a ball. Everyone starts on 1000. */
export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({ onAdd, onClose }) => {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [ball, setBall] = useState(9);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const submit = async () => {
    if (!name.trim()) {
      setError('Add a name first.');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      await onAdd({ name: name.trim(), department: department.trim() || undefined, ball, ballPreference: ball > 8 ? 'stripes' : 'solids' });
      onClose();
    } catch {
      setError('Could not add that player. Try again.');
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet
      title="Enrol a player"
      onClose={onClose}
      closeDisabled={isSubmitting}
      footer={
        <button type="button" onClick={submit} disabled={isSubmitting} className="press flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg disabled:opacity-50">
          <UserPlus className="h-[18px] w-[18px]" strokeWidth={2.25} />
          {isSubmitting ? 'Enrolling' : 'Enrol'}
        </button>
      }
    >
      <label className={labelClass}>
        Name
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="First name" aria-invalid={Boolean(error && !name.trim())} className={fieldClass} />
      </label>
      <label className={labelClass}>
        Team
        <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="e.g. Marketing" className={fieldClass} />
      </label>
      <div className={labelClass}>
        Pick a ball
        <BallPicker value={ball} onChange={setBall} />
      </div>
      {error && <p role="alert" className="text-sm font-bold">{error}</p>}
      <p className="text-sm text-white/70">Everyone starts on 1000. The ladder counts them from their first match.</p>
    </Sheet>
  );
};
