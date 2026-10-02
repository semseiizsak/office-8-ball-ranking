import React, { useMemo, useRef } from 'react';
import { Ball } from '../ui';
import { gsap, useGSAP, d, prefersReducedMotion } from '../../utils/gsap';

const PAYOFFS = ["RACK 'EM!", 'GAME ON!', 'BREAK TIME!', 'LOADED!', 'FULL HOUSE!'];
const BALL_COUNT = 34;

/** The "wow" beat: the whole dark screen pops full of pool balls in a GSAP stagger burst, then a big payoff word flips in on top. */
export const BallFloodScene: React.FC = () => {
  const payoff = useMemo(() => PAYOFFS[Math.floor(Math.random() * PAYOFFS.length)], []);
  const balls = useMemo(
    () =>
      Array.from({ length: BALL_COUNT }, (_, index) => ({
        n: (index % 15) + 1,
        left: `${Math.round(Math.random() * 100)}%`,
        top: `${Math.round(Math.random() * 100)}%`,
        size: Math.round(32 + Math.random() * 48),
      })),
    []
  );

  const sceneRef = useRef<HTMLDivElement>(null);
  const ballRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const payoffRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline();
      tl.set(ballRefs.current, { opacity: 0, scale: 0, xPercent: -50, yPercent: -50, rotate: () => gsap.utils.random(-180, 180) });
      tl.to(ballRefs.current, {
        opacity: 1,
        scale: 1,
        rotate: 0,
        duration: d(0.5),
        ease: 'back.out(1.6)',
        stagger: { each: 0.025, from: 'random' },
      }, 0);

      tl.set(payoffRef.current, { opacity: 0, scale: 0.4, rotateX: 90 });
      tl.to(payoffRef.current, { opacity: 1, scale: 1, rotateX: 0, duration: d(0.5), ease: 'back.out(2.2)' }, 0.95);

      if (!prefersReducedMotion()) {
        tl.to(payoffRef.current, { scale: 1.06, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }, '>');
        ballRefs.current.forEach((el, i) => {
          if (!el) return;
          gsap.to(el, {
            y: `+=${gsap.utils.random(-10, 10)}`,
            duration: 1.6 + Math.random(),
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            delay: 1 + i * 0.02,
          });
        });
      }
    },
    { scope: sceneRef }
  );

  return (
    <div ref={sceneRef} className="relative flex w-full flex-1 items-center justify-center overflow-hidden" style={{ perspective: 900 }}>
      {balls.map((ball, index) => (
        <span
          key={index}
          ref={(el) => {
            ballRefs.current[index] = el;
          }}
          className="absolute"
          style={{ left: ball.left, top: ball.top }}
        >
          <Ball n={ball.n} size={ball.size} />
        </span>
      ))}
      <h2
        ref={payoffRef}
        className="relative z-10 rounded-2xl bg-bg/80 px-7 py-4 text-center font-display text-5xl font-extrabold uppercase tracking-[-0.02em]"
      >
        {payoff}
      </h2>
    </div>
  );
};
