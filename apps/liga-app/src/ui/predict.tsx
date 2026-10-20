// Predictions pieces: the M13.2 Call the winner card (live spectator view, cup game, challenge call screen)
// and the Arena entry card. Both render nothing when the module is off or the player is under 16.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Check, Coins, Sparkles, Target } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { getCall, oddsLabel, openCalls, pays, placeTip, pointsOf, predictionsOn, WINDOW_MIN, type Call, type CallView } from '@/lib/predictions';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, fmt, radius, space, useTheme } from '@/theme';
import { Button, Card, Icon, Pill, T } from '@/ui';
import { useNow } from '@/ui/cup';

const left = (until: string | null, now: number) => {
  if (!until) return null;
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)} h left` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`;
};

function Chip({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{ flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: disabled ? t.text3 : on ? t.onPrimary : t.text }}>{label}</Text>
    </Pressable>
  );
}

// M13.2: pick a side and a stake. Shows your tip once placed and the result once the match is settled.
export function CallCard({ target, id }: { target: Call['target']; id: string }) {
  const { t } = useTheme();
  const { session } = useAuth();
  const [v, setV] = useState<CallView | null>(null);
  const [side, setSide] = useState<'a' | 'b' | null>(null);
  const [stake, setStake] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);

  const load = useCallback(async () => { if (session) setV(await getCall(session.user, target, id)); }, [session, target, id]);
  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]));

  if (!v) return null;
  const c = v.call, mine = v.mine;
  if (c?.playing) return null;

  if (mine) {
    const settled = mine.status !== 'open';
    const title = mine.status === 'won' ? (mine.payout ? `You called it, +${fmt(mine.payout)}` : 'You called it')
      : mine.status === 'lost' ? 'Not this time' : mine.status === 'refunded' ? 'Tip returned' : `You called ${mine.pick_name}`;
    const sub = mine.status === 'won' ? `${mine.pick_name} won. +${pointsOf(mine)} Oracle points.`
      : mine.status === 'lost' ? `${mine.pick_name} did not win this one. Next call is yours.`
      : mine.status === 'refunded' ? (mine.stake ? `It was not played, ${mine.stake} coins are back.` : 'It was not played.')
      : mine.stake ? `${mine.stake} coins at ${oddsLabel(mine.odds)}, pays ${fmt(pays(mine.stake, mine.odds))}` : `Odds ${oddsLabel(mine.odds)}, just for the bragging rights`;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: mine.status === 'won' ? t.win : t.surface }}>
        <Icon as={mine.status === 'won' ? Sparkles : settled ? Target : Check} size={22} color={mine.status === 'won' ? t.onWin : t.text} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading" c={mine.status === 'won' ? 'onWin' : 'text'}>{title}</T>
          <T v="small" c={mine.status === 'won' ? 'onWin' : 'text2'}>{sub}</T>
        </View>
      </View>
    );
  }
  if (!c) return null;
  if (!c.open) return <T v="small" c="text3">{c.closed}</T>;

  const s = stake ?? (v.stakes[1] && v.stakes[1] <= v.balance ? v.stakes[1] : 0);
  const short = s > v.balance;
  const odds = side ? c.odds[side] : null;
  const timeLeft = c.target === 'live' ? (c.closes_at ? left(c.closes_at, now) : `Open until ${WINDOW_MIN} min in`) : c.closes_at ? left(c.closes_at, now) : 'Open until it is played';

  const go = async () => {
    if (!session || !side) return;
    setBusy(true);
    try { await placeTip(session.user, c.target, c.id, side, s); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await load(); }
    catch (e) { Alert.alert("Couldn't place it", e instanceof Error ? e.message : 'Try again.'); }
    setBusy(false);
  };

  const sideBtn = (k: 'a' | 'b', name: string) => {
    const on = side === k;
    return (
      <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${name}, odds ${oddsLabel(c.odds[k])}`}
        onPress={() => { Haptics.selectionAsync(); setSide(k); }}
        style={{ flex: 1, minHeight: 64, borderRadius: radius.md, padding: space[3], gap: 2, justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
        <T v="heading" c={on ? 'onPrimary' : 'text'} numberOfLines={1}>{name}</T>
        <T v="label" c={on ? 'onPrimary' : 'text2'}>{oddsLabel(c.odds[k])}</T>
      </Pressable>
    );
  };

  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <T v="heading">Call the winner</T>
        {timeLeft ? <T v="caption" c="text2">{timeLeft}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {sideBtn('a', c.names.a)}
        {sideBtn('b', c.names.b)}
      </View>
      {v.coinsOn ? (
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {v.stakes.map((x) => <Chip key={x} label={x ? String(x) : 'Just call it'} on={x === s} disabled={x > v.balance} onPress={() => setStake(x)} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <Icon as={Coins} size={14} color={t.crown} />
            <T v="caption" c="text2">{short ? `You have ${fmt(v.balance)} coins.` : s && odds ? `${s} pays ${fmt(pays(s, odds))}` : s ? `You have ${fmt(v.balance)} coins` : 'No coins, just the bragging rights'}</T>
          </View>
        </View>
      ) : <T v="caption" c="text2">Just for the bragging rights. Right calls climb The Oracle.</T>}
      <Button label="Place tip" onPress={go} loading={busy} disabled={!side || short} />
      {c.pool.players ? <T v="caption" c="text3">{c.pool.players} {c.pool.players === 1 ? 'tip' : 'tips'}{c.pool.coins ? `, ${fmt(c.pool.coins)} coins` : ''}</T> : null}
    </Card>
  );
}

// Arena entry: open calls and a way into The Oracle.
export function ArenaPredictions() {
  const { session } = useAuth();
  const { league } = useLeague();
  const [calls, setCalls] = useState<Call[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (session && league) (async () => setCalls((await predictionsOn(session.user, league)) ? await openCalls(session.user, league.id) : null))();
  }, [session, league]));
  if (!calls) return null;
  const open = calls.filter((c) => c.open && !c.mine).length;
  return (
    <Card onPress={() => router.push('/predictions')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <Icon as={Target} size={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading">Predictions</T>
        <T v="small" c="text2">{open ? `${open} ${open === 1 ? 'match' : 'matches'} to call` : 'Nothing to call right now. See The Oracle.'}</T>
      </View>
      {open ? <Pill label={String(open)} tone="brand" /> : null}
    </Card>
  );
}
