// Client side preview only; the server function record_match is the source of truth.
// Returns side A's rating change for each outcome (side B gets the opposite).
export function eloPreview(ratingA: number, ratingB: number, k = 32) {
  const ea = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const r = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
  return { aWins: r(k * (1 - ea)), bWins: r(-k * ea), chanceA: ea };
}
export const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
