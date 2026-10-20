import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { REASONS, type Dispute, type Proposal } from '@/lib/confirm-engine';
import type { MatchRow, Member } from '@/lib/types';
import { pendingLists } from '@/lib/confirm';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Card, Icon, Pill, T } from '@/ui';

// Shared bits for the confirmation screens (M3, M16): countdowns, version text, the two versions side by side.
export function left(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = ms / 3600000;
  return h >= 1 ? `${Math.round(h)} h` : `${Math.max(1, Math.ceil(ms / 60000))} min`;
}
export function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}
export const sideNames = (match: MatchRow, side: 'a' | 'b', members: Member[], meId?: string) =>
  match.match_players.filter((p) => p.side === side).map((p) => (p.member_id === meId ? 'You' : members.find((m) => m.id === p.member_id)?.display_name ?? 'Former player')).join(' and ');

export function versionText(match: MatchRow, v: Exclude<Proposal, null>, members: Member[], meId?: string) {
  const score = v.score_a == null || v.score_b == null ? '' : v.winner === 'a' ? ` ${v.score_a} : ${v.score_b}` : ` ${v.score_b} : ${v.score_a}`;
  const who = sideNames(match, v.winner, members, meId);
  return `${who} won${score}`;
}
export const whose = (name: string) => (name === 'You' ? 'Your version' : `${name}'s version`);
export const reasonLabel = (x: Dispute) => (x.reason === 'no_show' ? 'No show' : REASONS.find((r) => r.id === x.reason)?.label ?? 'Problem');

// M3.3 two versions next to each other; the changed one gets a solid warning edge.
export function Versions({ match, dispute, members, meId, logger, opener }: { match: MatchRow; dispute: Dispute; members: Member[]; meId?: string; logger: string; opener: string }) {
  const { t } = useTheme();
  const original = versionText(match, { winner: match.winner, score_a: match.score_a, score_b: match.score_b }, members, meId);
  const proposed = dispute.proposal ? versionText(match, dispute.proposal, members, meId) : reasonLabel(dispute);
  const box = (title: string, body: string, changed: boolean) => (
    <View style={{ flex: 1, gap: 4, padding: space[3], borderRadius: radius.md, backgroundColor: t.surface, borderWidth: 2, borderColor: changed ? t.warning : t.surface }}>
      <T v="caption" c="text2">{title}</T>
      <T v="heading">{body}</T>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      {box(whose(logger), original, false)}
      {box(whose(opener), proposed, true)}
    </View>
  );
}

// M3.4 entry: "2 waiting" bar on top of History. Hidden when the module is off or nothing waits.
export function PendingBanner() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [n, setN] = useState({ you: 0, others: 0 });
  const on = isOn(league, 'confirm');
  useFocusEffect(useCallback(() => {
    if (!on || !league || !session) return;
    pendingLists(session.user, league.id).then((l) => setN({ you: l.you.length, others: l.others.length }));
  }, [on, league, session]));
  if (!on || (!n.you && !n.others)) return null;
  return (
    <Card onPress={() => router.push('/pending')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52 }}>
      {n.you ? <Pill label={String(n.you)} tone="warning" /> : null}
      <T v="heading" style={{ flex: 1 }}>{n.you ? `${n.you === 1 ? '1 result' : `${n.you} results`} to confirm` : `${n.others} waiting for others`}</T>
      <Icon as={ChevronRight} size={18} color={t.text3} />
    </Card>
  );
}
