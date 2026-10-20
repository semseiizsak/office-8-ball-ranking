import type { PlayerColour } from '@/theme';

export type League = { id: string; name: string; sport: string; invite_code: string; team_id: string; k_factor: number; teams?: { name: string }; archived_at?: string | null; template?: string; timezone?: string; modules?: Partial<Record<string, boolean>>; season?: import('@/lib/seasons').SeasonConfig };
export type Member = {
  id: string; league_id: string; user_id: string | null; display_name: string; jersey: number; colour: PlayerColour;
  role: 'owner' | 'admin' | 'member'; rating: number; wins: number; losses: number; streak: number; last_played_at: string | null;
  status?: 'left' | 'removed'; former_user_id?: string | null; left_at?: string | null; // former players keep their matches
  guest?: boolean; // added without an account (A9.4, R10.5), claimable later (A15)
};
// Match confirmation module: no status means the match counts. pending, disputed, no_show wait; void and walkover never move ratings.
export type MatchStatus = 'pending' | 'disputed' | 'no_show' | 'walkover' | 'void';
export type MatchRow = {
  status?: MatchStatus;
  id: string; format: '1v1' | '2v2'; winner: 'a' | 'b'; score_a: number | null; score_b: number | null; played_at: string; created_by: string;
  match_players: { member_id: string; side: 'a' | 'b'; delta: number; rating_after: number }[];
};
