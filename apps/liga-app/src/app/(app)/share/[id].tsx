import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Share2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, Switch, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { getMatch, type MatchDetail } from '@/lib/api';
import { sportOf } from '@/lib/sports';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, themes, type, useTheme } from '@/theme';
import { Avatar, Button, Icon, IconButton, Screen, Seg, Skeleton, T } from '@/ui';

// Share cards use fixed colours from the dark palette so they look the same in any theme (K7 rule).
const D = themes.dark;
const BACKGROUNDS = [D.bg, D.surface, D.surface3, D.brand] as const;

// K7.1 Match win card, K7.4 share sheet, M5.6 share result. The card is a view captured to an image (react-native-view-shot, in Expo Go).
export default function ShareCard() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const [m, setM] = useState<MatchDetail | null | undefined>(undefined);
  const [format, setFormat] = useState<'story' | 'post'>('story');
  const [bg, setBg] = useState(0);
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const card = useRef<View>(null);

  const load = useCallback(async () => { setM(await getMatch(id, session!.user.id)); }, [id, session]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (m === undefined) return <Screen><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} w={44} r={22} /><Skeleton h={420} /></View></Screen>;
  if (m === null) {
    return <Screen><View style={{ padding: space[4], gap: space[4] }}><IconButton icon={X} label="Close" onPress={() => router.back()} /><T v="heading">This match was removed</T></View></Screen>;
  }

  const byId = new Map(members.map((x) => [x.id, x]));
  const mySide = m.match_players.find((p) => p.member_id === me?.id)?.side;
  const won = mySide === m.winner;
  const winners = m.match_players.filter((p) => p.side === m.winner), losers = m.match_players.filter((p) => p.side !== m.winner);
  const isOpp = (mid: string) => !!mySide && m.match_players.find((p) => p.member_id === mid)?.side !== mySide;
  const label = (mid: string) => (hide && isOpp(mid) ? 'Opponent' : byId.get(mid)?.display_name ?? 'Former player');
  const names = (ps: typeof winners) => (hide && ps.some((p) => isOpp(p.member_id)) ? (ps.length > 1 ? 'Opponents' : 'Opponent') : ps.map((p) => label(p.member_id)).join(' and '));
  const score = m.score_a != null && m.score_b != null ? (m.winner === 'a' ? [m.score_a, m.score_b] : [m.score_b, m.score_a]) : null;
  const hero = (mySide ? m.match_players.find((p) => p.member_id === me?.id) : winners[0])!;
  const before = (p: { rating_after: number; delta: number }) => p.rating_after - p.delta;
  const avg = (ps: typeof winners) => ps.reduce((s, p) => s + before(p), 0) / Math.max(ps.length, 1);
  const upset = avg(winners) < avg(losers) - 25;
  const sport = sportOf(league?.sport);
  const date = new Date(m.played_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const fg = D.text, fg2 = bg === 3 ? D.onBrand : D.text2;
  const summary = `${names(winners)} beat ${names(losers)}${score ? ` ${score[0]} : ${score[1]}` : ''} in ${league?.name ?? 'our league'}. ${signed(hero.delta)} Elo.`;

  const share = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'ios') {
        const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
        await Share.share({ url: uri });
      } else {
        // React Native's Share sends text only on Android; images need expo-sharing (not installed).
        await Share.share({ message: summary });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not create the image.', 'You can share the result as text instead.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Share text', onPress: () => Share.share({ message: summary }) }]);
    } finally { setBusy(false); }
  };

  const avatars = (ps: typeof winners) => (
    <View style={{ flexDirection: 'row' }}>
      {ps.map((p, i) => {
        const pl = byId.get(p.member_id);
        return pl ? <View key={p.member_id} style={{ marginLeft: i ? -14 : 0 }}><Avatar name={hide && isOpp(p.member_id) ? '?' : pl.display_name} colour={hide && isOpp(p.member_id) ? 'ink' : pl.colour} size={ps.length > 1 ? 48 : 64} /></View> : null;
      })}
    </View>
  );
  const W = format === 'story' ? 270 : 320, H = format === 'story' ? 480 : 320;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <T v="section" style={{ flex: 1 }}>Share</T>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], alignItems: 'center' }}>
        <View ref={card} collapsable={false} style={{ width: W, height: H, borderRadius: radius.lg, backgroundColor: BACKGROUNDS[bg], padding: space[5], justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon as={sport.icon} size={18} color={fg} />
            <T v="label" c={fg} numberOfLines={1} style={{ flex: 1 }}>{league?.name}</T>
          </View>
          <View style={{ gap: format === 'story' ? space[4] : space[2], alignItems: 'center' }}>
            <T v="hero" c={fg} style={format === 'post' ? type.display : undefined}>{won || !mySide ? 'WIN' : 'GG'}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
              {avatars(winners)}
              {format === 'story' ? avatars(losers) : null}
            </View>
            <T v="heading" c={fg} center>{names(winners)} beat {names(losers)}</T>
            {score ? <T v="bigNumber" c={fg} style={format === 'post' ? { fontSize: 34, lineHeight: 38 } : undefined}>{score[0]} : {score[1]}</T> : null}
            <T v="number" c={bg === 3 ? D.onBrand : hero.delta > 0 ? D.win : D.text2}>{signed(hero.delta)} to {fmt(hero.rating_after)}</T>
            {upset ? <View style={{ paddingHorizontal: 12, height: 26, borderRadius: radius.pill, backgroundColor: D.crown, justifyContent: 'center' }}><T v="label" c={D.onCrown}>Upset</T></View> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <T v="caption" c={fg2} style={{ flex: 1 }}>{date}</T>
            <View style={{ width: 28, height: 28, borderRadius: radius.xs, backgroundColor: bg === 3 ? D.bg : D.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={sport.icon} size={16} color={D.onBrand} />
            </View>
            <T v="caption" c={fg2}>Get the app</T>
          </View>
        </View>

        <View style={{ alignSelf: 'stretch', gap: space[3] }}>
          <Seg value={format} onChange={setFormat} options={[{ value: 'story', label: 'Story' }, { value: 'post', label: 'Post' }]} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[3] }}>
            {BACKGROUNDS.map((c, i) => (
              <Pressable key={c} accessibilityRole="radio" accessibilityLabel={i === 3 ? 'Brand background' : `Dark background ${i + 1}`} accessibilityState={{ checked: bg === i }} onPress={() => setBg(i)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c, borderWidth: 3, borderColor: bg === i ? t.primary : t.line }} />
            ))}
          </View>
          {mySide ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
              <T v="heading" style={{ flex: 1 }}>Hide opponent</T>
              <Switch accessibilityLabel="Hide opponent" value={hide} onValueChange={setHide} trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />
            </View>
          ) : null}
          <Button label="Share" icon={Share2} loading={busy} onPress={share} full />
          <Button label="Share as text" variant="ghost" onPress={() => Share.share({ message: summary })} full />
        </View>
      </ScrollView>
    </Screen>
  );
}
