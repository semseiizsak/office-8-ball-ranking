import { Circle, CircleDot, Dices, Disc, Gamepad2, Target, Trophy, type LucideIcon } from 'lucide-react-native';

export const SPORTS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'foosball', label: 'Foosball', icon: CircleDot },
  { id: 'pingpong', label: 'Ping pong', icon: Circle },
  { id: 'pool', label: 'Pool', icon: Disc },
  { id: 'darts', label: 'Darts', icon: Target },
  { id: 'chess', label: 'Chess', icon: Dices },
  { id: 'esports', label: 'Video games', icon: Gamepad2 },
  { id: 'other', label: 'Other', icon: Trophy },
];
export const sportOf = (id?: string) => SPORTS.find((s) => s.id === id) ?? SPORTS[SPORTS.length - 1];
