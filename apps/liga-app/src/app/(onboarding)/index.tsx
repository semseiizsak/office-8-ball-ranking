import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, LogOut, Plus, Sparkles, Ticket, X } from 'lucide-react-native';
import { useCallback } from 'react';
import { View } from 'react-native';

import { needsAge } from '@/lib/account';
import { auth } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Card, Icon, IconButton, Screen, T } from '@/ui';

// A4: join or create fork.
export default function Fork() {
  const { t } = useTheme();
  const { leagues } = useLeague();
  const { session } = useAuth();
  // A4: new accounts answer the age question once before joining or creating.
  useFocusEffect(useCallback(() => {
    if (session) needsAge(session.user.id).then((r) => r && router.push({ pathname: '/age', params: r === 'blocked' ? { blocked: '1' } : {} }));
  }, [session]));
  const option = ({ icon, title, body, onPress, brand }: { icon: typeof Plus; title: string; body: string; onPress: () => void; brand?: boolean }) => (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[5] }}>
      <View style={{ width: 52, height: 52, borderRadius: radius.sm, backgroundColor: brand ? t.brand : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={icon} color={brand ? t.onBrand : t.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading">{title}</T>
        <T v="small" c="text2">{body}</T>
      </View>
      <Icon as={ChevronRight} color={t.text3} />
    </Card>
  );
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, padding: space[6], gap: space[4] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          {leagues.length ? <IconButton icon={X} label="Close" onPress={() => router.back()} />
            : <IconButton icon={LogOut} label="Sign out" tone="ghost" onPress={() => auth.signOut()} />}
        </View>
        <T v="title" style={{ marginTop: space[6] }}>{leagues.length ? 'Add a league' : 'Let’s get you playing'}</T>
        <T c="text2" style={{ marginBottom: space[4] }}>Join your team with an invite code, or start a new league in under a minute.</T>
        {option({ icon: Ticket, title: 'I have a code', body: 'Join a league someone already set up', onPress: () => router.push('/join') })}
        {option({ icon: Plus, brand: true, title: 'Start a new league', body: 'Name it, pick the sport, invite people', onPress: () => router.push('/create') })}
        {option({ icon: Sparkles, title: 'Try the demo league', body: 'Office foosball with six players and real history', onPress: () => router.push({ pathname: '/join', params: { code: 'DEMO42' } }) })}
      </View>
    </Screen>
  );
}
