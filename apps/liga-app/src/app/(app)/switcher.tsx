import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { sportOf } from '@/lib/sports';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Icon, T } from '@/ui';

// N1 League switcher sheet.
export default function Switcher() {
  const { t } = useTheme();
  const { leagues, league, select } = useLeague();
  return (
    <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: space[5], gap: space[2] }}>
      <T v="section" style={{ marginBottom: space[2] }}>Your leagues</T>
      {leagues.map((l) => {
        const on = l.id === league?.id;
        const s = sportOf(l.sport);
        return (
          <Pressable key={l.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={async () => { await select(l.id); if (router.canGoBack()) router.back(); else router.replace('/'); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: pressed || on ? t.surface2 : 'transparent' })}>
            <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: on ? t.brand : t.surface3, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={s.icon} size={20} color={on ? t.onBrand : t.text} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="heading">{l.name}</T>
              <T v="caption" c="text3">{l.teams?.name}, {s.label}</T>
            </View>
            {on ? <Icon as={Check} /> : null}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => { if (router.canGoBack()) router.back(); router.push('/(onboarding)'); }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
        <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: t.surface3, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={Plus} size={20} />
        </View>
        <T v="heading">Join or start a league</T>
      </Pressable>
    </ScrollView>
  );
}
