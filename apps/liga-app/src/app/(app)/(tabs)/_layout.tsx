import { Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { History, ListOrdered, Plus, Swords, Trophy, type LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOn, type ModuleId } from '@/lib/modules';
import { useLeague } from '@/providers/league';
import { font, radius, useTheme } from '@/theme';
import { Icon } from '@/ui';

// Max 5 items: Ranks, Arena, Log button, Cup, History. A tab whose module is off is hidden.
const TABS: Record<string, { label: string; icon: LucideIcon; module?: ModuleId[] }> = {
  index: { label: 'Ranks', icon: ListOrdered },
  // Arena also holds live, schedule, rewards, cards and predictions, so it stays while any of them is on.
  arena: { label: 'Arena', icon: Swords, module: ['challenges', 'live', 'schedule', 'coins', 'cards', 'predictions', 'awards'] },
  cup: { label: 'Cup', icon: Trophy, module: ['cup'] },
  history: { label: 'History', icon: History },
};
const LEFT = ['index', 'arena'], RIGHT = ['cup', 'history'];

// Floating tab bar 12 px above the home indicator, with the Log match button in the middle (N3).
function TabBar({ state, navigation }: { state: { index: number; routes: { key: string; name: string }[] }; navigation: { navigate: (name: string) => void } }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { league } = useLeague();
  const item = (name: string) => {
    const i = state.routes.findIndex((x) => x.name === name);
    const r = state.routes[i];
    const meta = TABS[name];
    if (!r || !meta || (meta.module && !meta.module.some((m) => isOn(league, m)))) return null;
    const on = state.index === i;
    return (
      <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={meta.label}
        onPress={() => { Haptics.selectionAsync(); navigation.navigate(r.name); }}
        style={{ flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? t.surface3 : 'transparent' }}>
        <Icon as={meta.icon} size={20} color={on ? t.text : t.text3} />
        <Text style={{ fontFamily: font.semibold, fontSize: 11, color: on ? t.text : t.text3 }}>{meta.label}</Text>
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: radius.pill, backgroundColor: t.tabbar,
        borderWidth: 1, borderColor: t.line, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
        {LEFT.map(item)}
        <Pressable accessibilityRole="button" accessibilityLabel="Log a match" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/log'); }}
          style={({ pressed }) => ({ height: 52, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: t.primary, flexDirection: 'row', alignItems: 'center', gap: 6, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <Icon as={Plus} size={20} color={t.onPrimary} />
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: t.onPrimary }}>Log</Text>
        </Pressable>
        {RIGHT.map(item)}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }} tabBar={(p) => <TabBar state={p.state} navigation={p.navigation} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="arena" />
      <Tabs.Screen name="cup" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
