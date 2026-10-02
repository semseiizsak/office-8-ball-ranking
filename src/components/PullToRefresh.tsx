import React, { useEffect, useRef, useState } from 'react';
import { Ball } from './ui';
import { hardRefresh } from '../utils/refresh';

/** How far the finger has to travel, after resistance, before letting go reloads. */
const TRIGGER_PX = 72;
const MAX_PX = 110;

/**
 * Pull down from the top of the page to reload, the gesture every phone app
 * has and an installed PWA otherwise lacks. Data is already live, so this is
 * really a fresh build plus peace of mind. Sheets, dialogs and anything marked
 * data-no-pull (the chat box) keep their own scrolling.
 */
export const PullToRefresh: React.FC = () => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (refreshing || window.scrollY > 0 || event.touches.length > 1) return;
      if (target?.closest('[role="dialog"], [data-no-pull], input, textarea')) return;
      startY.current = event.touches[0].clientY;
    };
    const onMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const dy = event.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Resistance, so it reads as stretching rather than dragging the page.
      const next = Math.min(MAX_PX, dy * 0.5);
      pullRef.current = next;
      setPull(next);
      if (event.cancelable) event.preventDefault();
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= TRIGGER_PX) {
        setRefreshing(true);
        setPull(TRIGGER_PX);
        void hardRefresh();
      } else {
        setPull(0);
      }
      pullRef.current = 0;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing]);

  if (pull === 0 && !refreshing) return null;
  const progress = Math.min(1, pull / TRIGGER_PX);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center"
      style={{
        transform: `translateY(calc(var(--safe-top) + ${pull - 44}px))`,
        transition: startY.current === null ? 'transform 280ms var(--ease)' : 'none',
      }}
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-full bg-surface-alt shadow-lg ${refreshing ? '[&>span]:animate-spin' : ''}`}
        style={{ opacity: 0.4 + progress * 0.6 }}
      >
        <Ball n={8} size={28} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </span>
    </div>
  );
};
