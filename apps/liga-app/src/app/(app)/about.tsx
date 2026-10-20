// B8 About, B8.1 What's new, B7 Legal (short in-app texts for the test build)
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { FileText, Palette, ShieldCheck, Undo2, Users } from 'lucide-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Icon, Screen, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const BUILD = 'Test build, Sprint 4';

const NEWS = [
  { icon: Undo2, title: 'Undo and fix matches', body: 'Fix a score within 15 minutes. Admins can fix any match.' },
  { icon: Palette, title: 'Light theme', body: 'Pick System, Dark or Light in Settings.' },
  { icon: Users, title: 'League settings', body: 'Roles, rating speed, members and archive in one place.' },
];

const LEGAL = [
  { id: 'terms', icon: FileText, title: 'Terms of use', body: 'This is a test build for invited testers. Play fair, log real results and be kind to each other. Features can change or disappear before release.' },
  { id: 'privacy', icon: ShieldCheck, title: 'Privacy policy', body: 'Everything you enter stays on this phone. Nothing is sent to a server in this build. Reset test data in Settings removes it all.' },
  { id: 'community', icon: Users, title: 'Community guidelines', body: 'No harassment, no hate, no fake results. Admins can remove players who break these rules.' },
  { id: 'licences', icon: FileText, title: 'Open source licences', body: 'Liga is built with Expo, React Native, Lucide icons, Inter and Sora. Their licences ship with the store build.' },
];

export default function About() {
  const { t } = useTheme();
  const { league } = useLeague();
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const diag = `Liga ${APP_VERSION}, ${BUILD}, ${Platform.OS} ${Platform.Version}, ${Constants.executionEnvironment}, league ${league?.id ?? 'none'}`;

  // B8: 7 taps on the logo open the hidden Billing test panel (test build only).
  const [taps, setTaps] = useState(0);
  const tap = () => { if (taps >= 6) { setTaps(0); router.push('/plans/test-panel'); } else setTaps(taps + 1); };
  const copy = async () => { await Clipboard.setStringAsync(diag); Haptics.selectionAsync(); setCopied(true); };

  return (
    <Screen>
      <Header title="About Liga" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <Pressable accessibilityRole="button" accessibilityHint="Long press to copy build info" onLongPress={copy} onPress={tap} style={{ alignItems: 'center', gap: space[2], paddingVertical: space[4] }}>
          <View style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
            <T v="title" c="onBrand">L</T>
          </View>
          <T v="title">Liga</T>
          <T v="small" c="text2">Version {APP_VERSION}, {BUILD}</T>
          <T v="caption" c="text3">{copied ? 'Build info copied' : 'Long press to copy build info'}</T>
        </Pressable>

        <Group title="What's new">
          {NEWS.map((n, i) => (
            <View key={n.title} style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
              <Icon as={n.icon} size={20} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="heading">{n.title}</T>
                <T v="small" c="text2">{n.body}</T>
              </View>
            </View>
          ))}
        </Group>

        <Group title="Legal">
          {LEGAL.map((l, i) => (
            <View key={l.id}>
              <Row first={i === 0} icon={l.icon} label={l.title} onPress={() => setOpen(open === l.id ? null : l.id)} />
              {open === l.id ? <T v="small" c="text2" style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>{l.body}</T> : null}
            </View>
          ))}
        </Group>

        <T v="caption" c="text3" center>Made in Budapest</T>
      </ScrollView>
    </Screen>
  );
}
