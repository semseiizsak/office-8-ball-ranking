import { router, type Href } from 'expo-router';
import { BarChart3, Info, Pencil, Swords, User, Users, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { headToHead, playerStats, type Res } from '@/lib/stats';
import type { Member } from '@/lib/types';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Icon, T } from '@/ui';
import { FormDots } from '@/ui/chart';

// Challenges live in their own feature; this only links to it.
export const goChallenge = (id: string) => router.push({ pathname: '/challenge/new', params: { opponent: id } } as unknown as Href);
export const goH2H = (a: string, b: string) => router.push({ pathname: '/h2h/[a]/[b]', params: { a, b } });
export const goCompare = (a: string, b: string) => router.push({ pathname: '/compare/[a]/[b]', params: { a, b } });

type Item = { label: string; icon: LucideIcon; run: () => void };

// R1.8 row context menu and R3.1 more menu: a bottom sheet with a mini profile preview.
export function PlayerMenu({ member, me, leagueId, onClose }: { member: Member | null; me: Member | null; leagueId?: string; onClose: () => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<{ id: string; form: Res[]; h2h: [number, number] | null } | null>(null);
  const mine = !!member && member.id === me?.id;

  useEffect(() => {
    if (!member || !leagueId) return;
    (async () => {
      const s = await playerStats(leagueId, member.id);
      const h = me && me.id !== member.id ? await headToHead(leagueId, me.id, member.id) : null;
      setInfo({ id: member.id, form: s.form, h2h: h && h.played ? [h.aWins, h.bWins] : null });
    })();
  }, [member, me, leagueId]);

  const go = (fn: () => void) => () => { onClose(); setTimeout(fn, 250); };
  const items: Item[] = !member ? [] : mine ? [
    { label: 'View profile', icon: User, run: () => router.push(`/player/${member.id}`) },
    { label: 'Edit profile', icon: Pencil, run: () => router.push('/profile-edit') },
    { label: 'How ratings work', icon: Info, run: () => router.push('/elo') },
  ] : [
    { label: 'View profile', icon: User, run: () => router.push(`/player/${member.id}`) },
    { label: 'Challenge', icon: Swords, run: () => goChallenge(member.id) },
    ...(me ? [
      { label: 'Head to head', icon: Users, run: () => goH2H(me.id, member.id) },
      { label: 'Compare', icon: BarChart3, run: () => goCompare(me.id, member.id) },
    ] : []),
  ];
  const data = info && info.id === member?.id ? info : null;

  return (
    <Modal visible={!!member} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1, backgroundColor: t.scrim }} />
      {member ? (
        <View style={{ backgroundColor: t.overlay, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[4], paddingBottom: insets.bottom + space[4], gap: space[3] }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.lineStrong }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: t.surface, borderRadius: radius.md, padding: space[3] }}>
            <Avatar name={member.display_name} colour={member.colour} jersey={member.jersey} size={52} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="heading" numberOfLines={1}>{mine ? 'You' : member.display_name}</T>
                <T v="number" style={{ fontSize: 17 }}>{fmt(member.rating)}</T>
              </View>
              <FormDots form={data?.form ?? []} size={10} />
              {data?.h2h ? <T v="caption" c="text2">You {data.h2h[0]} : {data.h2h[1]} {member.display_name}</T> : null}
            </View>
          </View>
          <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
            {items.map((it, i) => (
              <Pressable key={it.label} accessibilityRole="button" onPress={go(it.run)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4],
                  backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
                <Icon as={it.icon} size={20} />
                <T v="heading">{it.label}</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
