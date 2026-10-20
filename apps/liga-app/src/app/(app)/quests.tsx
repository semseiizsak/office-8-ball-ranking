// G5.4 Weekly quests: 3 quests a week from a pool, progress from matches, Claim and Claim all. Ready quests float up.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Check, Coins, Target } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { countdown } from '@/lib/cup';
import { claimQuest, questBoard, type Board, type Quest, type QuestId } from '@/lib/quests';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { QUEST_ICON } from '@/ui/rewards';

const ORDER = { ready: 0, progress: 1, claimed: 2 } as const;

export default function Quests() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [b, setB] = useState<Board | null>(null);
  const [busy, setBusy] = useState<QuestId | 'all' | null>(null);

  const load = useCallback(async () => { if (session && league) setB(await questBoard(session.user, league.id)); }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const claim = async (id: QuestId | 'all') => {
    if (!session || !league) return;
    setBusy(id);
    try { await claimQuest(session.user, league.id, id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await load(); }
    catch { Alert.alert('Could not claim', 'Check your connection and try again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Retry', onPress: () => claim(id) }]); }
    setBusy(null);
  };

  if (b && !b.on) return <Screen><Header title="Weekly quests" /><Empty icon={Target} title="Quests are off in this league" body="An admin can turn on Coins and Weekly quests in the league modules." action={<Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />} /></Screen>;
  if (!b) return <Screen><Header title="Weekly quests" /><View style={{ padding: space[4], gap: space[3] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={112} />)}</View></Screen>;
  if (b.guest) return <Screen><Header title="Weekly quests" /><Empty icon={Target} title="Guests don't collect quests" body="Claim your profile with an account to join in." /></Screen>;

  const list = [...b.quests].sort((x, y) => ORDER[x.state] - ORDER[y.state]);
  const allDone = b.quests.every((q) => q.state === 'claimed');

  const card = (q: Quest) => {
    const ready = q.state === 'ready', claimed = q.state === 'claimed';
    return (
      <Card key={q.id} style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: ready ? t.win : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={claimed ? Check : QUEST_ICON[q.id]} size={22} color={ready ? t.onWin : claimed ? t.text3 : t.text} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading" c={claimed ? 'text3' : 'text'} style={claimed ? { textDecorationLine: 'line-through' } : undefined}>{q.title}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon as={Coins} size={14} color={claimed ? t.text3 : t.crown} />
              <T v="caption" c={claimed ? 'text3' : 'text2'}>{claimed ? `${q.reward} coins claimed` : `+${q.reward} coins`}</T>
            </View>
          </View>
          {ready ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Claim ${q.reward} coins`} disabled={!!busy} onPress={() => claim(q.id)}
              style={({ pressed }) => ({ height: 44, minWidth: 88, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: t.win, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              {busy === q.id ? <ActivityIndicator color={t.onWin} /> : <T style={{ fontFamily: font.bold, fontSize: 15, color: t.onWin }}>Claim</T>}
            </Pressable>
          ) : !claimed ? <T v="label" c="text2" style={{ fontVariant: ['tabular-nums'] }}>{q.progress} of {q.target}</T> : null}
        </View>
        {!claimed ? (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round((q.progress / q.target) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: ready ? t.win : t.brand }} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen>
      <Header title="Weekly quests" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <T v="small" c="text2" style={{ paddingHorizontal: space[1] }}>
          {allDone ? `All done this week. New quests in ${countdown(b.endsAt)}.` : `Resets in ${countdown(b.endsAt)}. Unfinished quests simply roll over to new ones.`}
        </T>
        {list.map(card)}
        {b.ready > 1 ? <Button label={`Claim all, ${b.quests.filter((q) => q.state === 'ready').reduce((s, q) => s + q.reward, 0)} coins`} loading={busy === 'all'} onPress={() => claim('all')} /> : null}
        <T v="caption" c="text3" center>Coins can&apos;t be bought. You earn them by playing.</T>
      </ScrollView>
    </Screen>
  );
}
