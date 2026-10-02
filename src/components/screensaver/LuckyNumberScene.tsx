import React, { useMemo, useRef } from 'react';
import { Ball } from '../ui';
import { gsap, useGSAP, d } from '../../utils/gsap';

const LINES = ['The balls have spoken.', "Today's lucky number.", 'Destiny rolls again.', 'The table has decided.'];
const ITEM_HEIGHT = 140;
const REPEATS = 6;
const DEBRIS_COUNT = 10;

/**
 * Pure nonsense, on purpose — a real slot-reel spin (a tall strip of balls
 * dragged up behind a masked window, decelerating to a stop) landing on a
 * random ball. Not tied to any player or stat, just the "why is this even
 * here" spectacle a bowling alley screensaver swears by.
 */
export const LuckyNumberScene: React.FC = () => {
  const line = useMemo(() => LINES[Math.floor(Math.random() * LINES.length)], []);
  const finalNumber = useMemo(() => 1 + Math.floor(Math.random() * 15), []);
  const strip = useMemo(() => Array.from({ length: REPEATS * 15 }, (_, i) => (i % 15) + 1), []);
  const debris = useMemo(() => Array.from({ length: DEBRIS_COUNT }, (_, i) => (i % 15) + 1), []);
  const targetIndex = (REPEATS - 1) * 15 + (finalNumber - 1);

  const sceneRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLParagraphElement>(null);
  const debrisRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useGSAP(
    () => {
      gsap.set(revealRef.current, { opacity: 0, y: 14 });
      gsap.set(glowRef.current, { opacity: 0 });
      gsap.set(debrisRefs.current, { opacity: 0, scale: 0.5 });

      const tl = gsap.timeline();
      tl.to(stripRef.current, { y: -targetIndex * ITEM_HEIGHT, duration: d(2.1), ease: 'power4.out' });
      tl.addLabel('land');
      tl.to(glowRef.current, { opacity: 1, duration: d(0.15) }, 'land');
      tl.to(revealRef.current, { opacity: 1, y: 0, duration: d(0.45), ease: 'back.out(2)' }, 'land');
      tl.to(glowRef.current, { opacity: 0, duration: d(0.6) }, 'land+=0.3');

      debrisRefs.current.forEach((el, i) => {
        if (!el) return;
        const angle = (i / DEBRIS_COUNT) * Math.PI * 2;
        const distance = 100 + Math.random() * 90;
        tl.to(el, { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: 1, scale: 1, duration: d(0.5), ease: 'power2.out' }, 'land');
        tl.to(el, { opacity: 0, duration: d(0.4) }, 'land+=0.4');
      });
    },
    { scope: sceneRef }
  );

  return (
    <div ref={sceneRef} className="relative flex w-full flex-1 flex-col items-center justify-center gap-6">
      <p className="relative z-10 text-sm font-semibold uppercase tracking-[0.14em] text-white/55">{line}</p>
      <div className="relative">
        {debris.map((n, i) => (
          <span
            key={i}
            ref={(el) => {
              debrisRefs.current[i] = el;
            }}
            className="pointer-events-none absolute left-1/2 top-1/2 z-20 -ml-4 -mt-4"
          >
            <Ball n={n} size={32} />
          </span>
        ))}
        <div
          className="relative overflow-hidden rounded-3xl bg-card"
          style={{
            height: ITEM_HEIGHT,
            width: ITEM_HEIGHT,
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
            maskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
          }}
        >
          <div ref={stripRef}>
            {strip.map((n, i) => (
              <div key={i} className="flex items-center justify-center" style={{ height: ITEM_HEIGHT }}>
                <Ball n={n} size={100} />
              </div>
            ))}
          </div>
          <div ref={glowRef} className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_40px_12px_rgba(255,255,255,.5)]" />
        </div>
      </div>
      <p ref={revealRef} className="relative z-10 font-display text-3xl font-extrabold uppercase">
        Lucky number {finalNumber}
      </p>
    </div>
  );
};
