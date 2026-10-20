import { router } from 'expo-router';
import { Bell, ChevronDown, Search, Settings } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { sportOf } from '@/lib/sports';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Icon, IconButton, T } from '@/ui';
import { useUnread } from '@/ui/inbox-runtime';
import { CoinPill } from '@/ui/rewards';

// App bar with the league switcher (N1) on the left and settings on the right.
export function AppBar() {
  const { t } = useTheme();
  const { league } = useLeague();
  const sport = sportOf(league?.sport);
  const unread = useUnread();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Switch league" onPress={() => router.push('/switcher')}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={sport.icon} size={20} color={t.onBrand} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T v="heading" numberOfLines={1}>{league?.name ?? 'League'}</T>
            <Icon as={ChevronDown} size={16} color={t.text2} />
          </View>
          <T v="caption" c="text3" numberOfLines={1}>{league?.teams?.name}</T>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <CoinPill />
      <IconButton icon={Search} label="Search" onPress={() => router.push('/search')} />
      <IconButton icon={Bell} label={unread ? `Inbox, ${unread} unread` : 'Inbox'} badge={Math.min(unread, 99)} onPress={() => router.push('/inbox')} />
      <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
      </View>
    </View>
  );
}
