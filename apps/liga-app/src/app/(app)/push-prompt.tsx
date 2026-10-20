// A13 push pre-prompt (Know when it's your turn), A13.1 when notifications are off in system settings.
import { router, useLocalSearchParams } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { notNow, pushStatus, requestPush, type PushStatus } from '@/lib/inbox';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Icon, T } from '@/ui';
import { showBanner } from '@/ui/inbox-runtime';

export default function PushPrompt() {
  const { t } = useTheme();
  const { league } = useLeague();
  const { reason, who = 'Dave' } = useLocalSearchParams<{ reason?: 'match' | 'challenge'; who?: string }>();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const s = await pushStatus();
    setStatus(s);
    if (s === 'granted') { router.back(); showBanner({ title: 'Notifications on' }); }
  }, []);
  // A13.1: coming back from system settings re-checks the state.
  useEffect(() => { pushStatus().then(setStatus); const s = AppState.addEventListener('change', (a) => { if (a === 'active') check(); }); return () => s.remove(); }, [check]);

  const preview = reason === 'challenge' ? { title: `${who} accepted your challenge`, body: "Your challenge is on. Start it when you're at the table." } : { title: `${who} logged a match with you`, body: `${who} won 10 : 7. You −14 Elo, now 1 012.` };
  const off = status === 'denied';
  const later = async () => { await notNow(); router.back(); };
  const turnOn = async () => {
    setBusy(true);
    const s = await requestPush();
    setBusy(false);
    if (s === 'granted') { router.back(); showBanner({ title: 'Notifications on' }); } else setStatus(s);
  };

  return (
    <View style={{ flex: 1, padding: space[6], gap: space[5], backgroundColor: t.overlay }}>
      <View accessible accessibilityLabel={`Example notification: ${preview.title}`}
        style={{ flexDirection: 'row', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: t.surface2, marginTop: space[4] }}>
        <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><Icon as={Trophy} size={20} color={t.onBrand} /></View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label">{preview.title}</T>
            <T v="caption" c="text3">now</T>
          </View>
          <T v="small" c="text2" numberOfLines={2}>{preview.body}</T>
        </View>
      </View>
      <View style={{ gap: space[3] }}>
        <T v="title">{off ? 'Notifications are off' : "Know when it's your turn"}</T>
        <T v="body" c="text2">
          {off
            ? "You'll miss challenges and match news. Turn them on in Settings, it takes 10 seconds."
            : `We'll tell you when someone challenges you, logs a match with you or takes the crown in ${league?.name ?? 'your league'}. You choose the rest in settings.`}
        </T>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: space[2] }}>
        {off
          ? <Button label="Open Settings" onPress={() => Linking.openSettings()} />
          : <Button label="Turn on notifications" loading={busy} onPress={turnOn} />}
        <Button label="Not now" variant="ghost" onPress={later} />
      </View>
    </View>
  );
}
