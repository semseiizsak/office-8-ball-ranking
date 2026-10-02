import React, { useMemo, useRef } from 'react';
import { Player } from '../../types';
import { Ball, PlayerAvatar } from '../ui';
import { gsap, useGSAP, d, prefersReducedMotion } from '../../utils/gsap';

const STAMPS = ['POW!', 'CRACK!', "RACK 'EM!", 'SNAP!', 'THWACK!'];
const DEBRIS_COUNT = 12;

/** Two players collide: a GSAP timeline carries the slam, the screen shake, a radial shockwave, flying ball debris, and a 3D stamp flip — one choreographed beat instead of separate CSS entrances. */
export const BallClashScene: React.FC<{ left?: Player; right?: Player }> = ({ left, right }) => {
  const stamp = useMemo(() => STAMPS[Math.floor(Math.random() * STAMPS.length)], []);
  const debris = useMemo(() => Array.from({ length: DEBRIS_COUNT }, (_, i) => (i % 15) + 1), []);

  const sceneRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const rightRef = useRef<HTMLSpanElement>(null);
  const vsRef = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const debrisRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useGSAP(
    () => {
      if (!left || !right) return;
      const tl = gsap.timeline();

      tl.set(leftRef.current, { xPercent: -170, opacity: 0, rotateY: -50, scale: 0.5 })
        .set(rightRef.current, { xPercent: 170, opacity: 0, rotateY: 50, scale: 0.5 })
        .set([flashRef.current, ringRef.current], { opacity: 0, scale: 0.3 })
        .set(stampRef.current, { opacity: 0, scale: 0.3, rotateX: 95 })
        .to([leftRef.current, rightRef.current], { xPercent: 0, opacity: 1, rotateY: 0, scale: 1, duration: d(0.5), ease: 'power4.in' }, 0)
        .to(vsRef.current, { opacity: 0, duration: d(0.2) }, 0.46)
        .to(flashRef.current, { opacity: 0.85, scale: 1, duration: d(0.08) }, 0.46)
        .to(flashRef.current, { opacity: 0, duration: d(0.3) }, 0.54)
        .set(ringRef.current, { opacity: 0.6, scale: 1 }, 0.46)
        .to(ringRef.current, { opacity: 0, scale: 3.2, duration: d(0.55), ease: 'power2.out' }, 0.46)
        .to([leftRef.current, rightRef.current], { scale: 0.92, duration: d(0.08), yoyo: true, repeat: 1 }, 0.46)
        .to(stampRef.current, { opacity: 1, scale: 1, rotateX: 0, duration: d(0.45), ease: 'back.out(2.4)' }, 0.5);

      if (!prefersReducedMotion()) {
        tl.to(shakeRef.current, {
          keyframes: [{ x: -14, y: 6 }, { x: 12, y: -8 }, { x: -8, y: 4 }, { x: 6, y: -3 }, { x: 0, y: 0 }],
          duration: 0.4,
          ease: 'power1.inOut',
        }, 0.46);
      }

      debrisRefs.current.forEach((el, i) => {
        if (!el) return;
        const angle = (i / DEBRIS_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const distance = 90 + Math.random() * 160;
        tl.fromTo(
          el,
          { x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 },
          {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance * 0.7,
            opacity: 0,
            scale: 1,
            rotate: gsap.utils.random(-320, 320),
            duration: d(0.6 + Math.random() * 0.3),
            ease: 'power3.out',
          },
          0.46
        );
      });

      if (!prefersReducedMotion()) {
        tl.to(stampRef.current, { scale: 1.08, duration: 0.55, ease: 'sine.inOut', yoyo: true, repeat: -1 }, '>')
          .to([leftRef.current, rightRef.current], { y: -6, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.2 }, '<');
      }
    },
    { scope: sceneRef }
  );

  if (!left || !right) return null;

  return (
    <div ref={sceneRef} className="relative flex w-full flex-1 items-center justify-center overflow-hidden" style={{ perspective: 900 }}>
      <div ref={shakeRef} className="relative grid w-full max-w-sm justify-items-center gap-3.5 px-6">
        <span ref={flashRef} className="pointer-events-none absolute inset-0 bg-white" />
        <div className="relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <span
            ref={ringRef}
            className="pointer-events-none absolute left-1/2 top-[34px] -ml-[70px] -mt-[70px] h-[140px] w-[140px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.55),rgba(255,255,255,0))]"
          />
          {debris.map((n, i) => (
            <span
              key={i}
              ref={(el) => {
                debrisRefs.current[i] = el;
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 -ml-4 -mt-4"
            >
              <Ball n={n} size={32} />
            </span>
          ))}
          <span ref={leftRef} className="relative z-10 grid min-w-0 justify-items-center gap-2">
            <PlayerAvatar player={left} size={88} />
            <span className="max-w-full font-display text-xl font-extrabold uppercase leading-none [overflow-wrap:anywhere]">{left.name.split(' ')[0]}</span>
          </span>
          <span className="relative z-10 grid h-[84px] w-[116px] place-items-center">
            <span ref={vsRef} className="col-start-1 row-start-1 font-display text-3xl font-extrabold text-white/55">VS</span>
            <span ref={stampRef} className="col-start-1 row-start-1 rounded-lg bg-white px-3 py-2 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-bg">
              {stamp}
            </span>
          </span>
          <span ref={rightRef} className="relative z-10 grid min-w-0 justify-items-center gap-2">
            <PlayerAvatar player={right} size={88} />
            <span className="max-w-full font-display text-xl font-extrabold uppercase leading-none [overflow-wrap:anywhere]">{right.name.split(' ')[0]}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
