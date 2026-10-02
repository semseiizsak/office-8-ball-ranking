import { RefObject, useEffect } from 'react';

/**
 * Card tilt that follows the phone instead of a pointer. iOS only hands out
 * orientation after a tap asks for it, so the first tap anywhere after a card
 * shows up asks once; everywhere else it just starts listening.
 */
type Permission = 'unknown' | 'granted' | 'denied';
let permission: Permission = 'unknown';
let asking: Promise<Permission> | null = null;

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

const needsAsking = () =>
  typeof window !== 'undefined' &&
  'DeviceOrientationEvent' in window &&
  typeof (DeviceOrientationEvent as OrientationCtor).requestPermission === 'function';

const ask = (): Promise<Permission> => {
  if (permission !== 'unknown') return Promise.resolve(permission);
  asking ??= (DeviceOrientationEvent as OrientationCtor).requestPermission!()
    .then((answer) => (permission = answer === 'granted' ? 'granted' : 'denied'))
    .catch(() => (permission = 'denied'));
  return asking;
};

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/** How far the phone has to lean, in degrees, for the card to reach its full tilt. */
const FULL_LEAN = 22;

/**
 * Drives the same --rx/--ry/--mx/--my/--o variables the pointer tilt uses.
 * `strength` scales it, so a common card barely rocks and a legendary swings
 * its foil all the way. While `pointerActive` says a finger or mouse is on the
 * card, that wins.
 */
export const useGyroTilt = (
  ref: RefObject<HTMLElement | null>,
  { enabled, strength, glare, pointerActive }: { enabled: boolean; strength: number; glare: boolean; pointerActive: RefObject<boolean> }
) => {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let base: { beta: number; gamma: number } | null = null;
    let frame = 0;
    let latest: { beta: number; gamma: number } | null = null;

    const paint = () => {
      frame = 0;
      const el = ref.current;
      if (!el || !latest || pointerActive.current) return;
      base ??= { ...latest };
      // The resting angle drifts along slowly, so however you hold the phone becomes "flat".
      base.beta += (latest.beta - base.beta) * 0.02;
      base.gamma += (latest.gamma - base.gamma) * 0.02;
      const x = clamp((latest.gamma - base.gamma) / FULL_LEAN);
      const y = clamp((latest.beta - base.beta) / FULL_LEAN);
      el.classList.add('gyro');
      el.style.setProperty('--ry', `${x * 11 * strength}deg`);
      el.style.setProperty('--rx', `${-y * 9 * strength}deg`);
      el.style.setProperty('--mx', `${50 + x * 50}%`);
      el.style.setProperty('--my', `${50 + y * 50}%`);
      if (glare) el.style.setProperty('--o', String(Math.min(1, Math.hypot(x, y) * 1.4)));
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      latest = { beta: event.beta, gamma: event.gamma };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    let listening = false;
    const listen = () => {
      if (listening) return;
      listening = true;
      window.addEventListener('deviceorientation', onOrientation);
    };

    let onFirstTap: (() => void) | null = null;
    if (!needsAsking()) listen();
    else if (permission === 'granted') listen();
    else if (permission === 'unknown') {
      onFirstTap = () => {
        void ask().then((answer) => answer === 'granted' && listen());
      };
      window.addEventListener('click', onFirstTap, { once: true });
    }

    return () => {
      if (onFirstTap) window.removeEventListener('click', onFirstTap);
      window.removeEventListener('deviceorientation', onOrientation);
      if (frame) window.cancelAnimationFrame(frame);
      ref.current?.classList.remove('gyro');
    };
  }, [enabled, strength, glare, ref, pointerActive]);
};
