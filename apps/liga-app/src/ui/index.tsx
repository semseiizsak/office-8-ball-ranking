import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { font, playerColours, radius, space, type, useTheme, type PlayerColour } from '@/theme';

type Variant = keyof typeof type;

export function T({ v = 'body', c, style, children, numberOfLines, center }: {
  v?: Variant; c?: 'text' | 'text2' | 'text3' | 'onPrimary' | 'onBrand' | 'win' | 'brand' | string;
  style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; center?: boolean;
}) {
  const { t } = useTheme();
  const colour = c ? ((t as unknown as Record<string, string>)[c] ?? c) : t.text;
  return (
    <Text numberOfLines={numberOfLines} style={[type[v], { color: colour }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Screen({ children, edges = ['top'], style }: { children: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme();
  return <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</SafeAreaView>;
}

export function Icon({ as: I, size = 22, color, strokeWidth = 2.25 }: { as: LucideIcon; size?: number; color?: string; strokeWidth?: number }) {
  const { t } = useTheme();
  return <I size={size} color={color ?? t.text} strokeWidth={strokeWidth} />;
}

type BtnVariant = 'primary' | 'secondary' | 'brand' | 'ghost' | 'danger';
export function Button({ label, onPress, variant = 'primary', size = 'lg', icon, loading, disabled, style, full }: {
  label: string; onPress?: () => void; variant?: BtnVariant; size?: 'lg' | 'md' | 'sm'; icon?: LucideIcon;
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; full?: boolean;
}) {
  const { t } = useTheme();
  const h = size === 'lg' ? 52 : size === 'md' ? 44 : 36;
  const s2 = t.scheme === 'light' ? t.surface3 : t.surface2; // light surface2 equals the page bg
  const bg = disabled ? s2 : { primary: t.primary, secondary: s2, brand: t.brand, ghost: 'transparent', danger: t.error }[variant];
  const fg = disabled ? t.text3 : { primary: t.onPrimary, secondary: t.text, brand: t.onBrand, ghost: t.text, danger: '#FFFFFF' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      hitSlop={size === 'sm' ? 4 : 0}
      onPress={() => { Haptics.selectionAsync(); onPress?.(); }}
      style={({ pressed }) => [
        { height: h, borderRadius: radius.pill, backgroundColor: bg, paddingHorizontal: size === 'lg' ? 24 : 18,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          transform: [{ scale: pressed ? 0.97 : 1 }] },
        full && { alignSelf: 'stretch' },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon as={icon} size={18} color={fg} /> : null}
      <Text style={[type.heading, { fontFamily: font.bold, color: fg, fontSize: size === 'sm' ? 14 : 16 }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = 'surface', badge }: {
  icon: LucideIcon; onPress?: () => void; label: string; tone?: 'surface' | 'ghost' | 'primary'; badge?: number;
}) {
  const { t } = useTheme();
  const bg = tone === 'surface' ? t.surface2 : tone === 'primary' ? t.primary : 'transparent';
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <Icon as={icon} size={20} color={tone === 'primary' ? t.onPrimary : t.text} />
      {badge ? (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: t.live, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: t.bg }}>
          <Text style={{ fontFamily: font.bold, fontSize: 10, color: '#fff' }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: PressableProps['onPress'] }) {
  const { t } = useTheme();
  const base = { backgroundColor: t.surface, borderRadius: radius.md, padding: space[4] };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { backgroundColor: t.surface3 }, style]}>{children}</Pressable>;
}

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'win' | 'loss' | 'brand' | 'crown' | 'live' | 'warning'; icon?: LucideIcon }) {
  const { t } = useTheme();
  const map = {
    neutral: [t.surface3, t.text], win: [t.win, t.onWin], loss: [t.loss, t.onLoss], brand: [t.brand, t.onBrand],
    crown: [t.crown, t.onCrown], live: [t.live, '#FFFFFF'], warning: [t.warning, '#0A0A0A'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: bg, alignSelf: 'flex-start' }}>
      {icon ? <Icon as={icon} size={13} color={fg} /> : null}
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: fg }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, colour, jersey, size = 44, ring = true, frame }: { name: string; colour: PlayerColour; jersey?: number; size?: number; ring?: boolean; frame?: string }) {
  const { t } = useTheme();
  const c = playerColours[colour] ?? playerColours.blue;
  const ringW = Math.max(2, Math.round(size / 18));
  const showNo = jersey !== undefined && size >= 40;
  const tag = Math.round(size * 0.42);
  return (
    <View style={{ width: size, height: size }}>
      {frame ? <View pointerEvents="none" style={{ position: 'absolute', top: -ringW * 2, left: -ringW * 2, right: -ringW * 2, bottom: -ringW * 2, borderRadius: size, borderWidth: ringW, borderColor: frame }} /> : null}{/* equipped shop frame */}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: ring ? c : t.surface2, padding: ring ? ringW : 0 }}>
        <View style={{ flex: 1, borderRadius: size, backgroundColor: t.surface2, borderWidth: ring ? ringW / 2 : 0, borderColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.display, fontSize: size * 0.38, color: t.text }}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      </View>
      {showNo ? (
        <View style={{ position: 'absolute', right: -3, bottom: -3, width: tag, height: tag, borderRadius: tag / 2, backgroundColor: c, borderWidth: 2, borderColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.heavy, fontSize: tag * 0.48, color: colour === 'yellow' ? '#0A0A0A' : '#FFFFFF' }}>{jersey}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label?: string; error?: string }) {
  const { t } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="label" c="text2">{label}</T> : null}
      <TextInput
        placeholderTextColor={t.text3}
        {...props}
        style={[{ height: 52, borderRadius: radius.sm, backgroundColor: t.surface2, paddingHorizontal: 16, color: t.text, fontFamily: font.medium, fontSize: 16 },
          t.scheme === 'light' ? { borderWidth: 1, borderColor: t.lineStrong } : null, // light surface2 equals the page bg
          error ? { borderWidth: 2, borderColor: t.error } : null, props.style]}
      />
      {error ? <T v="small" c="error">{error}</T> : null}
    </View>
  );
}

export function Seg<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.scheme === 'light' ? t.surface3 : t.surface2, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} hitSlop={{ top: 4, bottom: 4 }} onPress={() => { Haptics.selectionAsync(); onChange(o.value); }}
            style={{ flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: on ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? t.onPrimary : t.text2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={icon} size={28} />
      </View>
      <T v="heading" center>{title}</T>
      <T v="small" c="text2" center>{body}</T>
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

// Loading placeholder in the shape of the content, never a full screen spinner.
export function Skeleton({ h, w, r = radius.md }: { h: number; w?: number; r?: number }) {
  const { t } = useTheme();
  return <View style={{ height: h, width: w ?? '100%', borderRadius: r, backgroundColor: t.lineStrong }} />;
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
