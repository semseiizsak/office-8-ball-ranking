// Per league modules (Modulok note). Every feature checks isOn() before it shows a tab, a block or sends a notice.
// The league stores overrides in `modules`; anything not set falls back to the template default.
import type { League } from '@/lib/types';

export type ModuleId =
  | 'challenges' | 'confirm' | 'seasons' | 'badges' | 'xp' | 'shame' | 'chat'
  | 'cup' | 'schedule' | 'coins' | 'quests' | 'awards' | 'live' | 'kiosk'
  | 'cards' | 'shop' | 'pass' | 'predictions';

export const MODULES: { id: ModuleId; label: string; body: string; needs?: ModuleId[] }[] = [
  { id: 'challenges', label: 'Challenges', body: 'Call someone out with the stakes shown up front.' },
  { id: 'confirm', label: 'Match confirmation', body: 'The other side confirms a result before it counts.' },
  { id: 'seasons', label: 'Seasons', body: 'Quarterly seasons with a fresh race and a wrap story.' },
  { id: 'badges', label: 'Badges and titles', body: 'Achievements for streaks, upsets and milestones.' },
  { id: 'xp', label: 'Levels and streaks', body: 'XP for every match and a weekly play streak.', needs: ['badges'] },
  { id: 'shame', label: 'Wall of shame', body: 'A friendly spot for the longest losing run.' },
  { id: 'chat', label: 'League chat', body: 'One chat for the league plus comments on matches.' },
  { id: 'cup', label: 'Weekly cup', body: 'Sign up, draw, bracket and a champion every week.' },
  { id: 'schedule', label: 'Scheduling', body: 'Match of the day and table slots.' },
  { id: 'coins', label: 'Coins', body: 'Earn coins by playing. Never bought with money.' },
  { id: 'quests', label: 'Weekly quests', body: 'Small goals that pay coins.', needs: ['coins'] },
  { id: 'awards', label: 'Weekly awards', body: 'Friday ceremony for the week’s best moments.' },
  { id: 'live', label: 'Live matches', body: 'Score a match live while others watch.' },
  { id: 'kiosk', label: 'Kiosk tablet', body: 'A shared tablet next to the table.' },
  { id: 'cards', label: 'Collectible cards', body: 'Player cards earned by playing, packs bought with earned coins.', needs: ['coins'] },
  { id: 'shop', label: 'Shop', body: 'Spend earned coins on frames, titles and packs.', needs: ['coins'] },
  { id: 'pass', label: 'Season pass', body: 'A free reward track each season, Pro adds cosmetics only.', needs: ['seasons'] },
  { id: 'predictions', label: 'Predictions', body: 'Call the winner for bragging rights. Hidden for players under 16.' },
];

const DEFAULTS: Record<string, ModuleId[]> = {
  ladder: [],
  office: ['challenges', 'cup', 'chat', 'badges', 'coins', 'quests', 'awards', 'live', 'schedule', 'shame', 'cards', 'shop'],
  club: ['challenges', 'seasons', 'cup', 'badges', 'xp', 'chat', 'confirm', 'live'],
};

export function isOn(league: Pick<League, 'template'> & { modules?: Partial<Record<ModuleId, boolean>> } | null | undefined, id: ModuleId): boolean {
  if (!league) return false;
  const override = league.modules?.[id];
  if (override !== undefined) return override;
  return (DEFAULTS[league.template ?? 'office'] ?? DEFAULTS.office).includes(id);
}
