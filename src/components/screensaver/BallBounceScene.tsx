import React, { useMemo, useRef } from 'react';
import { Ball } from '../ui';
import { gsap, useGSAP, prefersReducedMotion } from '../../utils/gsap';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * A complete non sequitur, on purpose: pool balls careening around and
 * "bouncing" off the edges, DVD-logo style, with a little cartoon squash on
 * every turn. No data, no point to it — the over-the-top unrelated filler
 * bowling alleys have always put between frames.
 */
export const BallBounceScene: React.FC = () => {
  const balls = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => ({
        n: ((index * 2 + 1) % 15) || 15,
        size: Math.round(rand(40, 72)),
      })),
    []
  );

  const sceneRef = useRef<HTMLDivElement>(null);
  const ballRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useGSAP(
    () => {
      gsap.set(ballRefs.current, { xPercent: -50, yPercent: -50 });
      if (prefersReducedMotion()) return;

      ballRefs.current.forEach((el) => {
        if (!el) return;

        const bounce = () => {
          const x = rand(-42, 42);
          const y = rand(-36, 36);
          gsap.to(el, {
            x: `${x}vw`,
            y: `${y}vh`,
            duration: rand(1.6, 2.8),
            ease: 'sine.inOut',
            onComplete: bounce,
          });
          // a little squash-and-stretch wobble right as it changes direction
          gsap.fromTo(
            el,
            { scaleX: 1.25, scaleY: 0.8 },
            { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' }
          );
        };
        gsap.delayedCall(rand(0, 1.2), bounce);
      });
    },
    { scope: sceneRef }
  );

  return (
    <div ref={sceneRef} className="relative flex w-full flex-1 items-center justify-center overflow-hidden">
      {balls.map((ball, index) => (
        <span
          key={index}
          ref={(el) => {
            ballRefs.current[index] = el;
          }}
          className="absolute left-1/2 top-1/2"
        >
          <Ball n={ball.n} size={ball.size} />
        </span>
      ))}
    </div>
  );
};
