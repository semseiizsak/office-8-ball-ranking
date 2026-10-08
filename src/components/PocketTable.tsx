import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { POCKETS, Pocket } from '../types';

/** Pocket centres in the scene's 200 x 160 viewBox. */
const SPOT: Record<Pocket, [number, number]> = {
  tl: [46, 54],
  tm: [100, 52],
  tr: [154, 54],
  bl: [46, 104],
  bm: [100, 106],
  br: [154, 104],
};

export const POCKET_LABEL: Record<Pocket, string> = {
  tl: 'McDonalds corner',
  tm: 'middle by the wall',
  tr: 'top right corner',
  bl: 'plant corner',
  bm: 'middle by the aisle',
  br: 'stairs corner',
};

/**
 * The office seen from above and a little in front, like a diorama, so a
 * pocket is "the one by the plant" and not "bottom left": the McDonald's
 * sign on the back wall top left, the plant bottom left and the stairs
 * bottom right, with the table in the middle and its six pockets as
 * buttons. Tap one to pick the pocket the 8 ball went in, whoever potted it.
 */
export const PocketTable: React.FC<{
  value?: Pocket | null;
  onChange: (pocket: Pocket) => void;
  disabled?: boolean;
  /** Bigger scene for the kiosk. */
  large?: boolean;
}> = ({ value, onChange, disabled = false, large = false }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = (name: string) => `url(#${name}${id})`;
  // Width and height set apart (not aspect-ratio) so older kiosk browsers keep them round.
  const hole = large ? 'h-[11%] w-[8.8%]' : 'h-[13%] w-[10.4%]';
  const leaves = [
    [-7, -20, -35], [-3, -24, -10], [2, -25, 12], [6, -21, 32], [-9, -14, -50], [8, -14, 48],
    [-5, -17, -22], [4, -18, 22], [0, -21, 0], [-10, -9, -62], [10, -9, 62], [-2, -12, -8], [3, -13, 14],
  ];
  return (
    <div className={`relative mx-auto aspect-[5/4] w-full overflow-hidden rounded-[22px] bg-[#0E0E0E] ${large ? 'max-w-[760px]' : 'max-w-[400px]'}`}>
      <svg viewBox="0 0 200 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={`wall${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#262626" />
            <stop offset="1" stopColor="#1A1A1A" />
          </linearGradient>
          <linearGradient id={`floor${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B1B1B" />
            <stop offset="1" stopColor="#111" />
          </linearGradient>
          <radialGradient id={`felt${id}`} cx="0.5" cy="0.42" r="0.7">
            <stop offset="0" stopColor="#12994F" />
            <stop offset="0.65" stopColor="#0B7A3E" />
            <stop offset="1" stopColor="#075C2E" />
          </radialGradient>
          <linearGradient id={`rail${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3A2A1E" />
            <stop offset="1" stopColor="#1E150F" />
          </linearGradient>
          <linearGradient id={`apron${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1A120C" />
            <stop offset="1" stopColor="#0B0806" />
          </linearGradient>
          <radialGradient id={`pocket${id}`} cx="0.5" cy="0.38" r="0.6">
            <stop offset="0" stopColor="#000" />
            <stop offset="0.7" stopColor="#050505" />
            <stop offset="1" stopColor="#2A2A2A" />
          </radialGradient>
          <linearGradient id={`pot${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#BDB6AC" />
            <stop offset="0.45" stopColor="#F2EEE8" />
            <stop offset="1" stopColor="#A39C92" />
          </linearGradient>
          <linearGradient id={`tread${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E0B57A" />
            <stop offset="1" stopColor="#C89A5E" />
          </linearGradient>
          <linearGradient id={`riser${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9C7444" />
            <stop offset="1" stopColor="#7A5833" />
          </linearGradient>
          <radialGradient id={`lamp${id}`} cx="0.5" cy="0.45" r="0.55">
            <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id={`soft${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id={`glow${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* Back wall and floor. */}
        <rect x="0" y="0" width="200" height="26" fill={ref('wall')} />
        <rect x="0" y="26" width="200" height="134" fill={ref('floor')} />
        <rect x="0" y="25" width="200" height="1.6" fill="#0A0A0A" />
        {[40, 80, 120, 160].map((x) => <line key={`v${x}`} x1={x} y1="26.6" x2={x} y2="160" stroke="#fff" strokeOpacity="0.035" strokeWidth="0.4" />)}
        {[66, 106, 146].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="200" y2={y} stroke="#fff" strokeOpacity="0.035" strokeWidth="0.4" />)}
        <ellipse cx="100" cy="80" rx="95" ry="70" fill={ref('lamp')} />

        {/* McDonald's sign on the back wall, top left, glowing onto the wall. */}
        <path d="M17 21 V12.5 C17 4 25 4 26.5 12.5 C28 4 36 4 36 12.5 V21" fill="none" stroke="#FFC72C" strokeWidth="5" strokeLinecap="round" filter={ref('glow')} opacity="0.55" />
        <rect x="14" y="20" width="25" height="5" rx="1" fill="#2B1D12" />
        <rect x="16.5" y="21.2" width="20" height="2.6" rx="0.6" fill="#B3261E" />
        <path d="M17 21 V12.5 C17 4 25 4 26.5 12.5 C28 4 36 4 36 12.5 V21" fill="none" stroke="#FFC72C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 21 V12.5 C17 4 25 4 26.5 12.5 C28 4 36 4 36 12.5 V21" fill="none" stroke="#FFE7A0" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />

        {/* The table: floor shadow, base, apron, rails, felt. */}
        <ellipse cx="100" cy="128" rx="70" ry="9" fill="#000" opacity="0.6" filter={ref('soft')} />
        <path d="M72 118 L128 118 L124 130 L76 130 Z" fill="#080604" />
        <rect x="36" y="44" width="128" height="70" rx="7" fill={ref('rail')} />
        <path d="M36 107 Q36 114 43 114 L157 114 Q164 114 164 107 L164 115 Q164 122 157 122 L43 122 Q36 122 36 115 Z" fill={ref('apron')} />
        <rect x="36" y="44" width="128" height="70" rx="7" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="0.6" />
        <rect x="44" y="52" width="112" height="54" rx="2" fill={ref('felt')} />
        <rect x="44" y="52" width="112" height="54" rx="2" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.6" />
        {/* Sights on the rails. */}
        {[58, 72, 86, 114, 128, 142].flatMap((x) => [<circle key={`t${x}`} cx={x} cy="48" r="0.7" fill="#E9E3D6" opacity="0.7" />, <circle key={`b${x}`} cx={x} cy="110" r="0.7" fill="#E9E3D6" opacity="0.7" />])}
        {[67, 79, 91].flatMap((y) => [<circle key={`l${y}`} cx="40" cy={y} r="0.7" fill="#E9E3D6" opacity="0.7" />, <circle key={`r${y}`} cx="160" cy={y} r="0.7" fill="#E9E3D6" opacity="0.7" />])}
        <line x1="72" y1="54" x2="72" y2="104" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.4" />
        <circle cx="128" cy="79" r="0.8" fill="#fff" opacity="0.3" />
        {/* Pockets, drawn under the buttons. */}
        {POCKETS.map((pocket) => (
          <g key={pocket}>
            <circle cx={SPOT[pocket][0]} cy={SPOT[pocket][1]} r="5.6" fill="#0C0C0C" />
            <circle cx={SPOT[pocket][0]} cy={SPOT[pocket][1]} r="4.4" fill={ref('pocket')} />
          </g>
        ))}

        {/* Plant, bottom left: a white vase with eucalyptus. */}
        <ellipse cx="22" cy="153" rx="13" ry="3.5" fill="#000" opacity="0.55" filter={ref('soft')} />
        <path d="M14 134 Q13 146 16 152 Q22 155 28 152 Q31 146 30 134 Z" fill={ref('pot')} />
        <ellipse cx="22" cy="134" rx="8" ry="2.4" fill="#D9D3CA" />
        <ellipse cx="22" cy="134" rx="6.4" ry="1.7" fill="#3B2B1F" />
        <g transform="translate(22 134)">
          {leaves.map(([x, y, angle], index) => (
            <g key={index}>
              <line x1="0" y1="0" x2={x} y2={y} stroke="#4E7A55" strokeWidth="0.5" />
              <ellipse cx={x} cy={y} rx="2.2" ry="4" transform={`rotate(${angle} ${x} ${y})`} fill={index % 3 === 0 ? '#7FA886' : index % 3 === 1 ? '#5E8F68' : '#4A7A55'} />
            </g>
          ))}
        </g>

        {/* Stairs, bottom right: three oak steps rising away. */}
        <ellipse cx="176" cy="157" rx="26" ry="3" fill="#000" opacity="0.5" filter={ref('soft')} />
        {[0, 1, 2].map((step) => {
          const y = 128 + step * 9;
          return (
            <g key={step}>
              <rect x={150 - step * 2} y={y} width={52 + step * 2} height="5" fill={ref('tread')} />
              <rect x={150 - step * 2} y={y} width={52 + step * 2} height="0.6" fill="#F6D9A8" />
              <rect x={150 - step * 2} y={y + 5} width={52 + step * 2} height="4" fill={ref('riser')} />
            </g>
          );
        })}

        {/* Labels. */}
        <g fontFamily="Inter, sans-serif" fontSize="4.2" fontWeight="700" fill="#fff" fillOpacity="0.55">
          <text x="43" y="16">McDonald's</text>
          <text x="36" y="142">Plant</text>
          <text x="196" y="124" textAnchor="end">Stairs</text>
        </g>
      </svg>

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
            style={{ left: `${SPOT[pocket][0] / 2}%`, top: `${(SPOT[pocket][1] / 160) * 100}%` }}
            className={`press absolute ${hole} -translate-x-1/2 -translate-y-1/2 rounded-full transition-[box-shadow,background-color] duration-200 ease-in-out disabled:opacity-50 ${
              picked ? 'bg-white/10 shadow-[0_0_0_3px_#fff,0_0_18px_4px_rgba(14,166,80,0.75)]' : 'hover:shadow-[0_0_0_2px_rgba(255,255,255,0.35)]'
            }`}
          >
            {picked && <span className="absolute inset-[34%] rounded-full bg-white" />}
          </button>
        );
      })}
    </div>
  );
};

/**
 * A popup asking which pocket the 8 ball went in. Portalled to the body so a
 * transformed or scrolling parent (a sheet, the kiosk's live screen) can never
 * clip it or pin it in the wrong place.
 */
export const PocketPopup: React.FC<{
  title: string;
  onPick: (pocket: Pocket) => void;
  onSkip?: () => void;
  skipLabel?: string;
  onClose?: () => void;
  disabled?: boolean;
  large?: boolean;
}> = ({ title, onPick, onSkip, skipLabel = 'Not sure, skip it', onClose, disabled, large }) => createPortal(
  <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[90] flex items-center justify-center p-4">
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
  </div>,
  document.body
);
