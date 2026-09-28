import { Player } from '../types';

/**
 * The wall of shame: three losses in a row and a clown goes next to your
 * name, everywhere, until you win one. Read straight off the current streak,
 * so it comes off by itself the moment the next win is logged.
 */
export const SHAME_STREAK = 3;

export const isShamed = (player: Pick<Player, 'currentStreak'> | null | undefined) =>
  !!player && player.currentStreak <= -SHAME_STREAK;

/** The name with the clown in front, when it has been earned. */
export const shamed = (name: string, player: Pick<Player, 'currentStreak'> | null | undefined) =>
  isShamed(player) ? `🤡 ${name}` : name;
