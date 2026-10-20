import { router } from 'expo-router';
import { Swords } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Avatar, Button, Card, Icon, T } from '@/ui';

// A12 first match nudge on Ranks: shows while you have 0 matches and there is someone to play.
// Availability is not tracked yet, so "free now" means the most recently active players.
export function FirstMatchNudge() {
  const { t } = useTheme();
  const { me, members } = useLeague();
  if (!me || me.wins + me.losses > 0) return null;
  const others = members.filter((m) => m.id !== me.id);
  if (!others.length) return null;
  const picks = [...others].sort((a, b) => (b.last_played_at ?? '').localeCompare(a.last_played_at ?? '')).slice(0, 3);
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon as={Swords} size={18} color={t.text2} />
        <T v="heading">Who&apos;s up for a game?</T>
      </View>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        {picks.map((m) => (
          <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Log a match with ${m.display_name}`} onPress={() => router.push('/log')}
            style={({ pressed }) => ({ alignItems: 'center', gap: 4, minWidth: 64, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}>
            <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={48} />
            <T v="caption" c="text2" numberOfLines={1}>{m.display_name}</T>
          </Pressable>
        ))}
      </View>
      <T v="small" c="text2">Played before Liga? Log your last game to start the ladder.</T>
      <Button label="Log your first match" size="md" onPress={() => router.push('/log')} />
    </Card>
  );
}
