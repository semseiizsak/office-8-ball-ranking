// B6.2 Send feedback: type, message, optional device info. Saved on the phone and shareable to the Liga team.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Check, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, Switch, View } from 'react-native';

import { sendFeedback } from '@/lib/admin';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Button, Empty, Field, Screen, Seg, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Kind = 'bug' | 'idea' | 'question';

export default function Feedback() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [device, setDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const info = `Liga ${Constants.expoConfig?.version ?? ''}, ${Platform.OS} ${Platform.Version}, league ${league?.id ?? 'none'}`;
  const message = `Liga feedback, ${kind}\n\n${text.trim()}${device ? `\n\n${info}` : ''}`;

  const send = async () => {
    if (!session) return;
    setBusy(true);
    try { await sendFeedback(session.user, { leagueId: league?.id ?? null, kind, text, device: device ? info : null }); setSent(true); } catch {}
    setBusy(false);
  };

  return (
    <Screen>
      <Header title="Send feedback" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {sent ? (
          <View style={{ padding: space[4], gap: space[3] }}>
            <Empty icon={Check} title="Thanks" body="We read every message. This test build keeps it on your phone, so share it with us too." />
            <Button label="Share with the Liga team" icon={Share2} onPress={() => Share.share({ message })} />
            <Button label="Done" variant="secondary" onPress={() => router.back()} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Seg value={kind} onChange={setKind} options={[{ value: 'bug', label: 'Bug' }, { value: 'idea', label: 'Idea' }, { value: 'question', label: 'Question' }]} />
            <Field label={kind === 'bug' ? 'What happened?' : kind === 'idea' ? 'What would make Liga better?' : 'What do you want to know?'}
              value={text} onChangeText={setText} multiline maxLength={2000} textAlignVertical="top"
              placeholder={kind === 'bug' ? 'What you tapped, what you expected, what you saw' : 'Tell us in your own words'}
              style={{ height: 160, paddingTop: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 }}>
              <View style={{ flex: 1 }}>
                <T v="heading">Include device info</T>
                <T v="caption" c="text3">{info}</T>
              </View>
              <Switch value={device} onValueChange={setDevice} accessibilityLabel="Include device info" trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />
            </View>
            <Button label="Send" onPress={send} loading={busy} disabled={text.trim().length < 3} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
