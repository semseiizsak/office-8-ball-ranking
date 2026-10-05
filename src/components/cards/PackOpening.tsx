import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Player } from '../../types';
import { Card, Pack, RARITIES, SHOP_LABEL } from '../../utils/cards';
import { BallBurst } from '../ui';
import { PlayerCard, RARITY_GLOW } from './PlayerCard';

type Phase = 'sealed' | 'ripping' | 'stack' | 'summary' | 'error';

const rank = (card: Card) => RARITIES.indexOf(card.rarity);
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const packName = (pack: Pack) =>
  pack.kind === 'bought'
    ? SHOP_LABEL[pack.tier ?? 'standard']
    : pack.kind === 'reward'
    ? pack.minRarity ? `${pack.minRarity[0].toUpperCase()}${pack.minRarity.slice(1)} pack` : 'Reward pack'
    : pack.kind === 'champion' ? 'Champion pack' : pack.kind === 'earned' ? 'Earned pack' : 'Weekly pack';

/**
 * Opening a pack, like the real thing. A foil pack with crimped ends hangs in
 * the light and catches it as you move. Drag along the tear strip (or tap) and
 * the strip rips off; the cards slide out of the pack as a face down stack.
 * Tap the top card: a big pull glows and shakes before it turns, then the
 * light breaks behind it. Each card then drops into the row below.
 */
export const PackOpening: React.FC<{
  pack: Pack;
  players: Player[];
  onOpen: (packId: string) => Promise<Card[]>;
  onClose: () => void;
}> = ({ pack, players, onOpen, onClose }) => {
  const motion = !reduced();
  const [phase, setPhase] = useState<Phase>('sealed');
  const [tear, setTear] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');
  /** How many cards have been turned; the top of the stack is cards[turned]. */
  const [turned, setTurned] = useState(0);
  const [turning, setTurning] = useState<'charge' | 'flip' | null>(null);
  const [light, setLight] = useState({ x: 50, y: 30 });
  const byId = new Map(players.map((player) => [player.id, player]));
  const drag = useRef<{ from: number; width: number } | null>(null);
  const opening = useRef(false);

  const rip = () => {
    if (opening.current) return;
    opening.current = true;
    setTear(1);
    setPhase('ripping');
    const started = Date.now();
    onOpen(pack.id)
      .then((opened) => {
        window.setTimeout(() => {
          setCards(opened);
          setPhase('stack');
        }, Math.max(0, (motion ? 900 : 0) - (Date.now() - started)));
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : '';
        // The database's free daily allowance ran out: it comes back at 9:00.
        setError(/quota|resource-exhausted/i.test(message) ? 'The app is out of database for today. Your pack is safe, open it after 9:00 tomorrow.' : message || 'The pack would not open.');
        setPhase('error');
      });
  };

  // Tapping instead of dragging still tears it, just by itself.
  const autoTear = () => {
    if (opening.current) return;
    if (!motion) return rip();
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 520);
      setTear(k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
      if (k < 1) requestAnimationFrame(step);
      else rip();
    };
    requestAnimationFrame(step);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'sealed') return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { from: event.clientX - box.left, width: box.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setLight({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
    if (!drag.current || phase !== 'sealed') return;
    const progress = Math.max(0, (event.clientX - box.left - drag.current.from) / (drag.current.width * 0.8));
    setTear(Math.min(1, progress));
    if (progress >= 0.85) {
      drag.current = null;
      rip();
    }
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const moved = tear;
    drag.current = null;
    if (moved < 0.08) autoTear();
    else if (!opening.current) setTear(0);
  };

  // Turning the top card: big pulls charge up first.
  const turn = () => {
    if (phase !== 'stack' || turning || turned >= cards.length) return;
    const card = cards[turned];
    const big = rank(card) >= RARITIES.indexOf('epic');
    const flip = () => {
      setTurning('flip');
      window.setTimeout(() => {
        setTurning(null);
        const next = turned + 1;
        setTurned(next);
        if (next >= cards.length) window.setTimeout(() => setPhase('summary'), motion ? 500 : 0);
      }, motion ? (big ? 1700 : 1000) : 0);
    };
    if (big && motion) {
      setTurning('charge');
      window.setTimeout(flip, rank(card) >= RARITIES.indexOf('legendary') ? 1300 : 800);
    } else flip();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (phase === 'summary' || phase === 'error')) onClose();
      if ((event.key === ' ' || event.key === 'Enter') && phase === 'sealed') autoTear();
      if ((event.key === ' ' || event.key === 'Enter') && phase === 'stack') turn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const top = phase === 'stack' ? cards[turned] : null;
  const showing = turning === 'flip' ? top : null;
  const glow = top ? RARITY_GLOW[top.rarity] : '#fff';
  const bigNow = !!top && turning === 'flip' && rank(top) >= RARITIES.indexOf('legendary');
  const best = cards.reduce<Card | null>((b, card) => (!b || rank(card) > rank(b) ? card : b), null);

  const card = (c: Card, className = '') => (
    <PlayerCard card={c} player={byId.get(c.playerId)} other={c.otherId ? byId.get(c.otherId) : null} size="medium" width={undefined} className={`!w-full ${className}`} />
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Opening a pack"
      className={`anim-fade fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-clip bg-black px-4 text-center ${bigNow && motion ? 'po2-quake' : ''}`}
    >
      <span aria-hidden="true" className="po2-spot" />

      {(phase === 'sealed' || phase === 'ripping') && (
        <div className="relative z-10 grid justify-items-center gap-6">
          <h1 className="text-[30px]">{packName(pack)}</h1>
          <div
            className={`po2-pack-wrap ${phase === 'sealed' && motion ? 'po2-hover' : ''} ${phase === 'ripping' && motion ? 'po2-drop' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ ['--lx' as string]: `${light.x}%`, ['--ly' as string]: `${light.y}%`, ['--rx' as string]: `${(light.y - 50) / -8}deg`, ['--ry' as string]: `${(light.x - 50) / 6}deg` }}
          >
            {/* The strip that tears off: it peels up from the left as you drag. */}
            <div
              className={`po2-strip ${pack.kind} ${pack.tier ?? ''} ${phase === 'ripping' && motion ? 'po2-strip-off' : ''}`}
              style={{ clipPath: `inset(0 ${100 - Math.max(tear, 0.001) * 100}% 0 0)`, transform: `rotate(${-tear * 7}deg) translateY(${-tear * 10}px)` }}
            />
            <div className={`po2-strip ${pack.kind} ${pack.tier ?? ''} po2-strip-rest`} style={{ clipPath: `inset(0 0 0 ${tear * 100}%)` }} />
            <div className={`po2-pack ${pack.kind} ${pack.tier ?? ''}`}>
              <span className="po2-sheen" />
              <span className="po2-emblem">
                <span className="po2-ball">8</span>
              </span>
              <span className="po2-label">Office 8-Ball</span>
              <span className="po2-sub">{packName(pack)}, 3 cards</span>
            </div>
            {phase === 'sealed' && tear === 0 && motion && <span aria-hidden="true" className="po2-finger" />}
          </div>
          <p className="font-semibold text-white/70">{phase === 'sealed' ? 'Swipe along the top to tear it open.' : 'Here they come.'}</p>
        </div>
      )}

      {phase === 'stack' && top && (
        <div className="relative z-10 grid w-full max-w-md justify-items-center gap-5">
          <h1 className="min-h-[34px] text-[30px]">
            {showing ? (rank(showing) >= RARITIES.indexOf('legendary') ? (showing.rarity === 'mythic' ? 'Mythic!' : 'Legendary!') : rank(showing) >= RARITIES.indexOf('epic') ? 'Epic!' : ' ') : `${turned + 1} of ${cards.length}`}
          </h1>
          <button type="button" onClick={turn} aria-label="Turn the top card" className="relative h-[330px] w-[230px]" style={{ perspective: 1200 }}>
            {showing && motion && rank(showing) >= RARITIES.indexOf('rare') && (
              <span aria-hidden="true" className="po2-rays" style={{ ['--glow' as string]: glow }} />
            )}
            {/* The face down cards under the top one. */}
            {cards.slice(turned + 1).map((c, i) => (
              <span key={c.id} className="po2-under absolute inset-0" style={{ transform: `translate(${(i + 1) * 5}px, ${(i + 1) * 6}px) rotate(${(i + 1) * 2}deg)` }}>
                <span className="po2-back" />
              </span>
            ))}
            <span
              key={top.id}
              className={`absolute inset-0 block ${motion ? 'po2-rise' : ''} ${turning === 'charge' ? 'po2-charge' : ''}`}
              style={{ ['--glow' as string]: glow }}
            >
              <span className={`po2-card block h-full w-full ${turning === 'flip' ? 'is-turned' : ''}`}>
                <span className="po2-face">
                  <span className="po2-back" />
                </span>
                <span className="po2-face po2-front">{card(top)}</span>
              </span>
            </span>
          </button>
          <p className="font-semibold text-white/70">{turning ? ' ' : 'Tap the card to turn it.'}</p>
          <div className="flex h-[92px] justify-center gap-2">
            {cards.slice(0, turned).map((c) => (
              <span key={c.id} className="po2-land w-[64px]">{card(c)}</span>
            ))}
          </div>
        </div>
      )}
      {bigNow && motion && <BallBurst key={`burst-${turned}`} />}

      {phase === 'summary' && (
        <div className="relative z-10 grid w-full max-w-md justify-items-center gap-5">
          <h1 className="text-[30px]">{best && rank(best) >= RARITIES.indexOf('legendary') ? 'What a pack!' : 'Your cards'}</h1>
          <div className="flex w-full justify-center gap-2.5">
            {cards.map((c, i) => (
              <span key={c.id} className="po2-land w-[calc((100%-20px)/3)] max-w-[130px]" style={{ animationDelay: `${i * 120}ms` }}>
                {card(c)}
              </span>
            ))}
          </div>
          <button type="button" onClick={onClose} className="press anim-rise h-12 rounded-full bg-white px-7 text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
            Add to collection
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="relative z-10 grid justify-items-center gap-3">
          <h1 className="text-[30px]">Not this one</h1>
          <p className="font-semibold text-white/70">{error}</p>
          <button type="button" onClick={onClose} className="press h-12 rounded-full bg-white px-7 text-[13px] font-extrabold uppercase tracking-[0.06em] text-bg">
            Close
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};
