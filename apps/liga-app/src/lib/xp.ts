// XP, levels and the weekly play streak with freezes (G5, G5.1, G5.3, G5.3.1). Module 'xp'.
// Derived from confirmed matches, so nothing can be lost or bought. The match hook lives in badges.ts.
import { settled } from '@/lib/api';
import { isOn } from '@/lib/modules';
import { FREEZE_EVERY, FREEZE_MAX, levelName, local, MAX_LEVEL, needFor, progressOf, replay, XP, type Progress } from '@/lib/progress-engine';

export { FREEZE_EVERY, FREEZE_MAX, levelName, MAX_LEVEL, needFor, XP, type Progress };

export async function progressFor(leagueId: string, memberId: string) {
  const d = await settled(leagueId);
  const l = d.leagues.find((x) => x.id === leagueId);
  const m = d.members.find((x) => x.id === memberId);
  if (!l || !m || m.guest || !isOn(l, 'xp')) return null;
  const p = progressOf(d, leagueId, memberId, replay(d, leagueId).get(memberId));
  const now = local(Date.now(), l.timezone);
  return { ...p, weekday: now.weekday, nowWeek: now.week };
}
export type ProgressView = NonNullable<Awaited<ReturnType<typeof progressFor>>>;

// Copy for the streak card (G5.3). Never "you lost your streak".
export function streakLine(p: ProgressView) {
  const s = p.streak;
  if (!s.current && !s.best) return 'Play a match this week to start a streak.';
  if (s.playedNow) return s.current === 1 ? 'Week 1. Play next week to make it 2.' : 'Played this week, see you next week.';
  if (!s.current) return `New streak starts this week. Your best is still ${s.best}.`;
  if (p.weekday >= 4) return `Streak at risk, one match before Sunday keeps it${s.freezes ? ', or a freeze covers it' : ''}.`;
  return 'One match this week keeps it going.';
}
