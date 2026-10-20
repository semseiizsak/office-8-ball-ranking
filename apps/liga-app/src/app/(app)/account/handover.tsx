// B1.7.2 Hand over your leagues: every league you own gets a new owner or is deleted. Written only on the final confirm.
import { router, useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { deletionSummary, type Handover } from '@/lib/account';
import { useAuth } from '@/providers/auth';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Owned = Awaited<ReturnType<typeof deletionSummary>>['owned'][number];

export default function HandOver() {
  const { t } = useTheme();
  const { session } = useAuth();
  const [owned, setOwned] = useState<Owned[] | null>(null);
  const [choice, setChoice] = useState<Handover>({});
  const load = useCallback(async () => { if (session) setOwned((await deletionSummary(session.user.id)).owned); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!owned) return <Screen><Header title="Hand over" /><View style={{ padding: space[4] }}><Skeleton h={240} /></View></Screen>;
  const pickOf = (o: Owned) => choice[o.leagueId] ?? o.suggested ?? 'delete';
  const plan: Handover = Object.fromEntries(owned.map((o) => [o.leagueId, pickOf(o)]));

  const option = (o: Owned, value: string, label: string, sub?: string) => {
    const on = pickOf(o) === value;
    return (
      <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setChoice({ ...choice, [o.leagueId]: value })}
        style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: on ? t.surface3 : pressed ? t.surface2 : 'transparent' })}>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? t.text : t.lineStrong, backgroundColor: on ? t.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Icon as={Check} size={14} color={t.bg} /> : null}
        </View>
        <T v="heading" style={{ flex: 1, color: value === 'delete' ? t.error : t.text }}>{label}</T>
        {sub ? <T v="small" c="text2">{sub}</T> : null}
      </Pressable>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Hand over" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }}>
        <T v="title">Hand over your leagues</T>
        <T c="text2">Pick who looks after each league. They hear about it when you confirm.</T>
        {owned.map((o) => (
          <Card key={o.leagueId} style={{ gap: space[2] }}>
            <T v="heading">{o.league}</T>
            <T v="small" c="text2">{o.team}, {o.members.length} other {o.members.length === 1 ? 'member' : 'members'}</T>
            {o.paid ? <T v="small" c="text2">{o.paid} The new owner can subscribe to keep it.</T> : null}
            <View style={{ gap: 2, marginTop: space[2] }}>
              {o.members.map((m) => option(o, m.id, `New owner: ${m.name}`, m.role === 'admin' ? 'Admin' : m.bot ? 'Demo player' : undefined))}
              {option(o, 'delete', o.members.length ? 'Delete this league instead' : 'Delete this league, nobody else is in it')}
            </View>
          </Card>
        ))}
        <Button label="Next" variant="primary" onPress={() => router.push({ pathname: '/account/confirm', params: { handover: JSON.stringify(plan) } })} />
      </ScrollView>
    </Screen>
  );
}
