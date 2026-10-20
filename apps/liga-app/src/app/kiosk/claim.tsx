// A15.2 on the phone: the kiosk claim QR lands here. Members go straight to the claim list (A15.1),
// everyone else joins with the invite first (A6, sign in kept by N4.3) and is offered the claim after picking a name.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { db } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { useTheme } from '@/theme';
import { Screen, T } from '@/ui';

export default function ClaimLanding() {
  const { t } = useTheme();
  const { code = '' } = useLocalSearchParams<{ code: string; m?: string }>();
  const { session } = useAuth();
  const { select } = useLeague();
  const uid = session?.user.id;

  useEffect(() => {
    let live = true;
    (async () => {
      const d = await db();
      const l = d.leagues.find((x) => x.invite_code === code.toUpperCase());
      const member = !!uid && !!l && d.members.some((m) => m.league_id === l.id && m.user_id === uid && !m.status);
      if (!live) return;
      if (member && l) { await select(l.id); router.replace('/claim'); }
      else router.replace(`/join/${code.toUpperCase()}`);
    })();
    return () => { live = false; };
  }, [code, uid, select]);

  return (
    <Screen edges={['top', 'bottom']} style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <ActivityIndicator color={t.text2} />
        <T v="body" c="text2">Opening your player</T>
      </View>
    </Screen>
  );
}
