import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Copy, Link, RefreshCw, Share2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  EXPIRY_CHOICES, inviteInfo, inviteUrl, prettyCode, regenerateCode, templateOf, type ExpiryChoice,
} from '@/lib/invite';
import { sportOf } from '@/lib/sports';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, themes, useTheme } from '@/theme';
import { Button, Card, Icon, IconButton, Screen, Seg, T } from '@/ui';
import { SeatsNotice } from '@/ui/plan-kit';

// K8 invite with QR, code and link (A9), K8.1 full screen QR (A9.2), K8.2 new code for owner and admin.
// With ready=1 it opens with the A8.5 "your league is ready" summary right after creating a league.
// The QR always sits on the light theme surface so cameras read it in dark mode too.
// Screen brightness boost (A9.2) needs expo-brightness, left for the dev build.
const paper = themes.light;

export default function Invite() {
  const { t } = useTheme();
  const { ready } = useLocalSearchParams<{ ready?: string }>();
  const { session } = useAuth();
  const { league, me, members, reloadLeagues } = useLeague();
  const admin = me?.role === 'owner' || me?.role === 'admin';
  const [info, setInfo] = useState<Awaited<ReturnType<typeof inviteInfo>> | null>(null);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [expiry, setExpiry] = useState<ExpiryChoice>('7');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { if (league) setInfo(await inviteInfo(league.id)); }, [league]);
  // load() only sets state after an await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const code = info?.code ?? league?.invite_code ?? '';
  const url = code ? inviteUrl(code) : '';
  const daysLeft = info?.days_left ?? null;
  const expiryText = info?.expired ? 'This invite expired.' : daysLeft === null ? 'Never expires.' : `Expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`;
  const live = !!info && !info.expired;

  const copy = async (what: 'code' | 'link') => {
    await Clipboard.setStringAsync(what === 'code' ? code : url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };
  const share = () => Share.share({ message: `Join ${league?.name} on Liga. Tap the link or use code ${prettyCode(code)}: ${url}` });
  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const renew = () => Alert.alert('Make a new code?', 'The old code and QR stop working right away.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'New code', onPress: async () => {
      if (!session || !league) return;
      setBusy(true);
      try { await regenerateCode(session.user, league.id, expiry); await reloadLeagues(league.id); await load(); } catch { Alert.alert('Could not make a new code', 'Only owners and admins can. Try again in a moment.'); }
      setBusy(false);
    } },
  ]);

  const qr = (size: number) => (
    <View style={{ backgroundColor: paper.surface, padding: 16, borderRadius: radius.md }}>
      {url ? <QRCode value={url} size={size} color={paper.text} backgroundColor={paper.surface} ecl="M" /> : <View style={{ width: size, height: size }} />}
    </View>
  );

  const readyCard = () => {
    const tp = templateOf(league?.template);
    const sport = sportOf(league?.sport);
    const lines = [`Ladder for ${sport.label.toLowerCase()}, 1v1 and 2v2`, 'Rating starts at 1 000 for everyone', `${tp.label} setup: ${tp.features.slice(1).join(', ') || 'just the ladder'}`, 'Your first match starts the ladder'];
    return (
      <Card style={{ gap: space[3] }}>
        <T v="section">{league?.name} is ready</T>
        {lines.map((l) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.win, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={Check} size={14} color={t.onWin} />
            </View>
            <T v="small" c="text2" style={{ flex: 1 }}>{l}</T>
          </View>
        ))}
      </Card>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
        {ready ? <View style={{ width: 44 }} /> : <IconButton icon={ArrowLeft} label="Back" onPress={done} />}
        <T v="section" style={{ flex: 1 }} numberOfLines={1}>Invite</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[10] }}>
        {ready ? readyCard() : null}
        <SeatsNotice />
        <View style={{ gap: 4 }}>
          <T v="title">Invite to {league?.name}</T>
          <T c="text2">{members.length} {members.length === 1 ? 'member' : 'members'}. Scan, tap the link or type the code.</T>
        </View>

        <Card style={{ alignItems: 'center', gap: space[4], paddingVertical: space[6] }}>
          {live ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Show QR full screen" onPress={() => setFull(true)}>{qr(200)}</Pressable>
          ) : (
            <View style={{ width: 232, height: 232, borderRadius: radius.md, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', padding: space[5] }}>
              <T v="small" c="text2" center>{info ? 'This invite expired. Make a new code to show a fresh QR.' : ' '}</T>
            </View>
          )}
          <T v="display" style={{ letterSpacing: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{prettyCode(code)}</T>
          <T v="caption" c="text3" numberOfLines={1}>{url}</T>
          <View style={{ flexDirection: 'row', gap: space[2], alignSelf: 'stretch' }}>
            <Button label={copied === 'code' ? 'Copied' : 'Copy code'} icon={copied === 'code' ? Check : Copy} size="md" variant="secondary" style={{ flex: 1 }} onPress={() => copy('code')} />
            <Button label={copied === 'link' ? 'Copied' : 'Copy link'} icon={copied === 'link' ? Check : Link} size="md" variant="secondary" style={{ flex: 1 }} onPress={() => copy('link')} />
          </View>
          <Button label="Share invite" icon={Share2} full onPress={share} disabled={!live} />
        </Card>

        <Card style={{ gap: space[3] }}>
          <T v="heading">{expiryText}</T>
          {admin ? (
            <>
              <T v="small" c="text2">A new code replaces this one. Pick how long it works.</T>
              <Seg value={expiry} onChange={setExpiry} options={EXPIRY_CHOICES.map((c) => ({ value: c.value, label: c.label }))} />
              <Button label="New code" icon={RefreshCw} size="md" variant="secondary" loading={busy} onPress={renew} />
            </>
          ) : (
            <T v="small" c="text2">{info?.expired ? 'Ask an admin for a new code.' : 'Anyone with the code or the link can join.'}</T>
          )}
        </Card>

        <T v="caption" c="text3" center>In Expo Go the QR opens this test app through Expo. The liga.app web link comes with the store build.</T>
        <Button label={ready ? 'Done' : 'Close'} onPress={() => (ready ? router.replace('/') : done())} />
      </ScrollView>

      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: paper.surface, alignItems: 'center', justifyContent: 'center', gap: space[5], padding: space[6] }}>
          <View style={{ position: 'absolute', top: 56, right: space[4] }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setFull(false)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: paper.surface3, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={X} size={20} color={paper.text} />
            </Pressable>
          </View>
          <T v="section" c={paper.text} center>{league?.name}</T>
          {qr(280)}
          <T v="display" c={paper.text} style={{ letterSpacing: 2 }}>{prettyCode(code)}</T>
          <T c={paper.text2}>Scan with your camera</T>
        </View>
      </Modal>
    </Screen>
  );
}
