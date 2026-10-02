import React, { useMemo, useRef } from 'react';
import { Player } from '../../types';
import { Ball } from '../ui';
import { gsap, useGSAP, d, prefersReducedMotion } from '../../utils/gsap';

const RESULTS = [
  { word: 'STRIKE!', flavor: (name: string) => `${name} is on fire!` },
  { word: 'SPARE!', flavor: (name: string) => `${name} cleaned it up.` },
  { word: 'GUTTER BALL!', flavor: (name: string) => `Rough one for ${name}.` },
];
const PIN_COUNT = 18;

/** A cue ball rides a curved motion path into a rack of "pins", which fly apart in a GSAP stagger before the result word punches in. */
export const BowlingScene: React.FC<{ player?: Player }> = ({ player }) => {
  const result = useMemo(() => RESULTS[Math.floor(Math.random() * RESULTS.length)], []);
  const pins = useMemo(
    () =>
      Array.from({ length: PIN_COUNT }, (_, index) => ({
        n: (index % 15) + 1,
        x: gsap.utils.random(-46, 46, 1),
        y: gsap.utils.random(-34, 34, 1),
      })),
    []
  );
  const name = player?.name.split(' ')[0] ?? 'Someone';

  const sceneRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLSpanElement>(null);
  const pinRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const wordRef = useRef<HTMLHeadingElement>(null);
  const flavorRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline();

      tl.set(pinRefs.current, { opacity: 0, scale: 0.4, x: 0, y: 0 });
      tl.set(cueRef.current, { opacity: 1, xPercent: -50, yPercent: -50 });
      tl.to(cueRef.current, {
        motionPath: { path: [{ x: 0, y: 260 }, { x: -40, y: 90 }, { x: 0, y: 0 }], curviness: 1.3 },
        duration: d(0.6),
        ease: 'power1.in',
      });
      tl.to(cueRef.current, { opacity: 0, scale: 0.6, duration: d(0.15) });

      tl.to(pinRefs.current, {
        opacity: 1,
        scale: 1,
        x: (i) => `${pins[i].x}vw`,
        y: (i) => `${pins[i].y}vh`,
        rotate: () => gsap.utils.random(-280, 280),
        duration: d(0.7),
        ease: 'power3.out',
        stagger: { each: 0.015, from: 'center' },
      }, '-=0.05');
      tl.to(pinRefs.current, { scale: 1.08, duration: d(0.15), yoyo: true, repeat: 1, stagger: 0.01 }, '-=0.15');

      tl.set(wordRef.current, { opacity: 0, scale: 0.3, rotateX: 90 });
      tl.to(wordRef.current, { opacity: 1, scale: 1, rotateX: 0, duration: d(0.45), ease: 'back.out(2.2)' }, '-=0.2');
      tl.from(flavorRef.current, { opacity: 0, y: 12, duration: d(0.35) }, '-=0.1');

      if (!prefersReducedMotion()) {
        tl.to(wordRef.current, { scale: 1.05, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }, '>');
      }
    },
    { scope: sceneRef, dependencies: [result.word] }
  );

  return (
    <div ref={sceneRef} className="relative grid w-full flex-1 place-items-center overflow-hidden" style={{ perspective: 900 }}>
      <span
        ref={cueRef}
        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-white opacity-0 shadow-[0_0_20px_rgba(255,255,255,.6)]"
      />
      {pins.map((pin, index) => (
        <span
          key={index}
          ref={(el) => {
            pinRefs.current[index] = el;
          }}
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[22px] -mt-[22px]"
        >
          <Ball n={pin.n} size={44} />
        </span>
      ))}
      <div className="relative grid justify-items-center gap-3">
        <h2 ref={wordRef} className="font-display text-[64px] leading-none">{result.word}</h2>
        <p ref={flavorRef} className="text-base font-semibold text-white/70">{result.flavor(name)}</p>
      </div>
    </div>
  );
};
