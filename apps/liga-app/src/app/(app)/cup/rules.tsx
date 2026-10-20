// G1.10 Cup rules sheet, written from the league's cup settings
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { getCup, rulesText, CUP_DEFAULTS, type CupSettings } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useLeague } from '@/providers/league';
import { fmt, space } from '@/theme';
import { Button, T } from '@/ui';

export default function CupRules() {
  const { league } = useLeague();
  const [cfg, setCfg] = useState<CupSettings>(CUP_DEFAULTS);
  useFocusEffect(useCallback(() => { if (league) getCup(league.id).then((x) => x && setCfg(x.cfg)); }, [league]));
  const coins = isOn(league, 'coins');
  return (
    <ScrollView contentContainerStyle={{ padding: space[5], gap: space[3], paddingBottom: 48 }}>
      <T v="section">Cup rules</T>
      {rulesText(cfg).map((line) => <T key={line} c="text2">{line}</T>)}
      <View style={{ gap: 4, marginTop: space[2] }}>
        <T v="heading">Prizes</T>
        <T c="text2">Champion: cup badge for the week.</T>
        {coins ? <T c="text2">Winner {fmt(cfg.winnerCoins)} coins, final {fmt(cfg.runnerUpCoins)} coins.</T> : null}
      </View>
      <Button label="Close" variant="secondary" onPress={() => router.back()} style={{ marginTop: space[3] }} />
    </ScrollView>
  );
}
