import React from 'react';
import { POCKETS, Pocket } from '../types';

const POSITION: Record<Pocket, { left: string; top: string }> = {
  tl: { left: '0%', top: '0%' },
  tm: { left: '50%', top: '0%' },
  tr: { left: '100%', top: '0%' },
  bl: { left: '0%', top: '100%' },
  bm: { left: '50%', top: '100%' },
  br: { left: '100%', top: '100%' },
};

export const POCKET_LABEL: Record<Pocket, string> = {
  tl: 'top left',
  tm: 'top middle',
  tr: 'top right',
  bl: 'bottom left',
  bm: 'bottom middle',
  br: 'bottom right',
};

/**
 * The table seen from above, with the six pockets as buttons. Tap one to pick
 * the pocket the last ball drops in.
 */
export const PocketTable: React.FC<{
  value?: Pocket | null;
  onChange: (pocket: Pocket) => void;
  disabled?: boolean;
  /** Bigger pockets for the kiosk. */
  large?: boolean;
}> = ({ value, onChange, disabled = false, large = false }) => {
  const hole = large ? 'h-16 w-16' : 'h-11 w-11';
  return (
    <div className={`mx-auto w-full ${large ? 'max-w-[720px] px-8 py-8' : 'max-w-[360px] px-5 py-5'}`}>
      <div className="relative aspect-[2/1] w-full rounded-[18px] bg-felt shadow-[0_0_0_10px_#3a2415,inset_0_0_0_2px_rgba(0,0,0,0.25)]">
        {/* Head string and foot spot, so it reads as a table and not a rectangle. */}
        <span className="absolute bottom-[10%] left-[25%] top-[10%] w-px bg-white/15" />
        <span className="absolute left-[75%] top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
        {POCKETS.map((pocket) => {
          const picked = value === pocket;
          return (
            <button
              key={pocket}
              type="button"
              disabled={disabled}
              aria-pressed={picked}
              aria-label={`Pocket ${POCKET_LABEL[pocket]}`}
              onClick={() => onChange(pocket)}
              style={POSITION[pocket]}
              className={`press absolute ${hole} -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors disabled:opacity-50 ${
                picked ? 'bg-white shadow-[0_0_0_4px_#0EA650]' : 'bg-black shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)]'
              }`}
            >
              {picked && <span className="absolute inset-[30%] rounded-full bg-felt" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** A popup asking which pocket the last ball went in. */
export const PocketPopup: React.FC<{
  title: string;
  onPick: (pocket: Pocket) => void;
  onSkip?: () => void;
  skipLabel?: string;
  onClose?: () => void;
  disabled?: boolean;
  large?: boolean;
}> = ({ title, onPick, onSkip, skipLabel = 'Not sure, skip it', onClose, disabled, large }) => (
  <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-center justify-center p-4">
    <button type="button" aria-label="Close" onClick={onClose} className="anim-fade absolute inset-0 bg-black/70" />
    <div className={`anim-rise relative grid w-full gap-4 rounded-[28px] bg-elev p-5 ${large ? 'max-w-[900px] p-8' : 'max-w-md'}`}>
      <h2 className={`text-center font-display font-extrabold ${large ? 'text-4xl' : 'text-xl'}`}>{title}</h2>
      <PocketTable onChange={onPick} disabled={disabled} large={large} />
      {onSkip && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSkip}
          className="press h-11 rounded-full text-xs font-extrabold text-white/55 disabled:opacity-50"
        >
          {skipLabel}
        </button>
      )}
    </div>
  </div>
);
