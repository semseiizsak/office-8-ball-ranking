import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

export type Series = { values: number[]; color: string };

// dv-rating line chart: dashed start line, ringed peak, solid dot in the player's colour for now.
// Tap or drag to select a point (R4.1); onSelect gets the index in the first series.
export function LineChart({ series, height = 160, baseline, peak = true, selected, onSelect }: {
  series: Series[]; height?: number; baseline?: number; peak?: boolean; selected?: number | null; onSelect?: (i: number) => void;
}) {
  const { t } = useTheme();
  const [w, setW] = useState(0);
  const pad = 8;
  const all = series.flatMap((s) => s.values).concat(baseline ?? []);
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const x = (i: number, n: number) => pad + (n > 1 ? (i / (n - 1)) * (w - pad * 2) : (w - pad * 2) / 2);
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i, vs.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const main = series[0]?.values ?? [];
  const pick = (e: GestureResponderEvent) => {
    if (!onSelect || main.length < 2 || !w) return;
    const i = Math.max(0, Math.min(main.length - 1, Math.round(((e.nativeEvent.locationX - pad) / (w - pad * 2)) * (main.length - 1))));
    if (i !== selected) { Haptics.selectionAsync(); onSelect(i); }
  };
  const peakIdx = main.indexOf(Math.max(...main));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}
      onStartShouldSetResponder={() => !!onSelect} onMoveShouldSetResponder={() => !!onSelect}
      onResponderTerminationRequest={() => false} onResponderGrant={pick} onResponderMove={pick}
      accessible accessibilityRole="image" accessibilityLabel={main.length ? `Rating from ${main[0]} to ${main[main.length - 1]}` : 'No rating yet'}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={w} y1={height * f} y2={height * f} stroke={t.line} strokeWidth={1} />)}
          {baseline !== undefined ? <Line x1={0} x2={w} y1={y(baseline)} y2={y(baseline)} stroke={t.text3} strokeWidth={1.5} strokeDasharray="4 5" /> : null}
          {selected != null && main[selected] !== undefined ? (
            <Line x1={x(selected, main.length)} x2={x(selected, main.length)} y1={0} y2={height} stroke={t.lineStrong} strokeWidth={1.5} />
          ) : null}
          {series.map((s, si) => (
            <Path key={si} d={path(s.values)} fill="none" stroke={series.length > 1 ? s.color : t.text} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {peak && main.length > 2 && peakIdx !== main.length - 1 ? (
            <Circle cx={x(peakIdx, main.length)} cy={y(main[peakIdx])} r={5} fill={t.surface2} stroke={t.text} strokeWidth={2} />
          ) : null}
          {series.map((s, si) => s.values.length ? (
            <Circle key={si} cx={x(s.values.length - 1, s.values.length)} cy={y(s.values[s.values.length - 1])} r={6} fill={s.color} stroke={t.surface} strokeWidth={2.5} />
          ) : null)}
          {selected != null && main[selected] !== undefined ? (
            <Circle cx={x(selected, main.length)} cy={y(main[selected])} r={6} fill={t.text} stroke={t.surface} strokeWidth={3} />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}

// Ten form dots, oldest to newest: win green, loss neutral grey.
export function FormDots({ form, size = 12 }: { form: ('W' | 'L')[]; size?: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Form ${form.join(' ')}`}>
      {Array.from({ length: 10 }, (_, i) => {
        const r = form[i - (10 - form.length)];
        return <View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: r === 'W' ? t.win : r === 'L' ? t.loss : t.surface2 }} />;
      })}
    </View>
  );
}

// Horizontal win rate bar: win share in green on a neutral track.
export function RateBar({ value, color }: { value: number; color?: string }) {
  const { t } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.loss, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: 8, backgroundColor: color ?? t.win }} />
    </View>
  );
}
