import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(useGSAP, MotionPathPlugin);

/** A kiosk sits in a bright office all day — honor the OS-level reduced-motion preference rather than forcing full-throttle timelines on everyone. */
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Collapse a tween duration to near-instant under reduced motion, otherwise pass it through. */
export const d = (seconds: number) => (prefersReducedMotion() ? 0.01 : seconds);

export { gsap, useGSAP, MotionPathPlugin };
