// B5.2 Compare plans: every feature per plan in one grid, columns scroll sideways on a phone.
import { router } from 'expo-router';
import { Check, Minus } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { PLANS, euro, product, type PlanId } from '@/lib/plans';
import { space, useTheme } from '@/theme';
import { Button, Icon, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';

const COLS: PlanId[] = ['free', 'team', 'club', 'business'];
const LABEL_W = 150, COL_W = 96;
type Cell = boolean | string;
const GROUPS: { title: string; rows: [string, Cell, Cell, Cell, Cell][] }[] = [
  { title: 'Players and leagues', rows: [['Players', '12', '30', 'Any', 'Any'], ['Leagues', '1', '3', 'Any', 'Any'], ['Guests', true, true, true, true]] },
  { title: 'Play', rows: [['Ladder and rating', true, true, true, true], ['Weekly cup', true, true, true, true], ['Seasons', false, true, true, true], ['Challenges with coins', false, true, true, true], ['Live matches', false, true, true, true]] },
  { title: 'Club tools', rows: [['Kiosk mode', false, false, true, true], ['Custom card art', false, false, true, true], ['Export to CSV', false, false, true, true]] },
  { title: 'Company', rows: [['Single sign on', false, false, false, true], ['Admin console', false, false, false, true], ['Invoices', false, false, false, true], ['Priority support', false, false, false, true]] },
];
const monthly = (p: PlanId) => (p === 'free' ? '€0' : p === 'team' ? euro(product('team', 'yearly').perMonth) : `${euro(p === 'club' ? 0.79 : 1.99)} a player`);

export default function Compare() {
  const { t } = useTheme();
  const cell = (v: Cell, key: string) => (
    <View key={key} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center' }}>
      {typeof v === 'string' ? <T v="label">{v}</T> : <Icon as={v ? Check : Minus} size={18} color={v ? t.win : t.text3} />}
    </View>
  );
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Compare plans" />
      <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: space[4] }} showsHorizontalScrollIndicator={false}>
        <ScrollView stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: space[6] }}>
          <View style={{ flexDirection: 'row', backgroundColor: t.bg, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: t.line }}>
            <View style={{ width: LABEL_W, justifyContent: 'flex-end' }}><T v="caption" c="text3">Per month, billed yearly</T></View>
            {COLS.map((c) => (
              <View key={c} style={{ width: COL_W, alignItems: 'center', gap: 2 }}>
                <T v="heading">{PLANS[c].name}</T>
                <T v="caption" c="text2" center>{monthly(c)}</T>
              </View>
            ))}
          </View>
          {GROUPS.map((g) => (
            <View key={g.title} style={{ paddingTop: space[4] }}>
              <T v="label" c="text2" style={{ paddingBottom: space[2] }}>{g.title}</T>
              {g.rows.map(([label, ...vals]) => (
                <View key={label} style={{ flexDirection: 'row', minHeight: 44, borderTopWidth: 1, borderTopColor: t.line }}>
                  <View style={{ width: LABEL_W, justifyContent: 'center' }}><T v="small">{label}</T></View>
                  {vals.map((v, i) => cell(v, `${label}${i}`))}
                </View>
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', paddingTop: space[3] }}>
            <View style={{ width: LABEL_W + COL_W * 3 }} />
            <View style={{ width: COL_W }}><Button label="Talk to us" size="sm" variant="ghost" onPress={() => router.push('/plans/contact')} /></View>
          </View>
        </ScrollView>
      </ScrollView>
      <View style={{ padding: space[4] }}>
        <Button label="Choose Team" variant="brand" onPress={() => router.dismissTo({ pathname: '/plans', params: { reason: 'compare', plan: 'team' } })} />
      </View>
    </Screen>
  );
}
