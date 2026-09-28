import { Player } from '../types';

/**
 * The fifteen balls, and the only colours the app uses beyond black, white,
 * felt green, live red and crown yellow. `c` is the ball itself, always used
 * solid. `t` is a lifted variant for text on the dark background, where the
 * darker balls would not read.
 */
export const BALL_COLORS: Record<number, { c: string; t: string }> = {
  1: { c: '#F2B705', t: '#F2B705' },
  2: { c: '#1F3FA3', t: '#7D97F0' },
  3: { c: '#C8102E', t: '#FF6B7D' },
  4: { c: '#4B2A7B', t: '#B394E6' },
  5: { c: '#E8601C', t: '#F59A63' },
  6: { c: '#146B3A', t: '#5FCB8C' },
  7: { c: '#7A1F2B', t: '#E0808C' },
  8: { c: '#0A0A0A', t: '#FFFFFF' },
};

export const ballColor = (n: number) => BALL_COLORS[n > 8 ? n - 8 : n] ?? BALL_COLORS[1];

/**
 * The ball a player plays under. Players who have not picked one get a stable
 * one derived from their id, so the colour never jumps between screens.
 */
export function playerBall(player: Pick<Player, 'id' | 'ball'> | null | undefined): number {
  if (!player) return 8;
  if (player.ball && player.ball >= 1 && player.ball <= 15) return player.ball;
  let hash = 0;
  for (const char of player.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 15) + 1;
}

export const playerColor = (player: Pick<Player, 'id' | 'ball'> | null | undefined) => ballColor(playerBall(player));
