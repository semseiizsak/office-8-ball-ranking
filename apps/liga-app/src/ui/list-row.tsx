import { router } from 'expo-router';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { radius, space, useTheme } from '@/theme';
import { Icon, IconButton, T } from '@/ui';

// Settings style list (DS #lists, #sd-settings): a titled group card with drill down rows.
export function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const { t } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      {title ? <T v="label" c="text2" style={{ paddingHorizontal: space[1] }}>{title}</T> : null}
      <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>{children}</View>
      {footer ? <T v="caption" c="text3" style={{ paddingHorizontal: space[1] }}>{footer}</T> : null}
    </View>
  );
}

export function Row({ label, value, icon, onPress, danger, disabled, right, first }: {
  label: string; value?: string; icon?: LucideIcon; onPress?: () => void; danger?: boolean; disabled?: boolean; right?: ReactNode; first?: boolean;
}) {
  const { t } = useTheme();
  const colour = disabled ? t.text3 : danger ? t.error : t.text;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ disabled }} disabled={!onPress || disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2],
        backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: first ? 0 : 1, borderTopColor: t.line })}>
      {icon ? <Icon as={icon} size={20} color={colour} /> : null}
      <T v="heading" style={{ flex: 1, color: colour }} numberOfLines={1}>{label}</T>
      {value ? <T v="small" c="text2" numberOfLines={1}>{value}</T> : null}
      {right ?? (onPress && !danger ? <Icon as={ChevronRight} size={18} color={t.text3} /> : null)}
    </Pressable>
  );
}

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
      <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
      <T v="section" style={{ flex: 1 }} numberOfLines={1}>{title}</T>
      {right}
    </View>
  );
}
