// K4.4 notification routing, K4.6 in-app banner, local delivery and the A13 trigger.
// Mounted once in (app)/_layout.tsx. Remote push needs a dev build; this build fires local notifications.
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect, usePathname, type Href } from 'expo-router';
import { Bell, Crown, Flame, Swords, TrendingUp, Trophy, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Easing, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/lib/api';
import type { Notice } from '@/lib/engine';
import { categoryOf, freshNotices, markRead, noticeTarget, onInboxChange, inboxChanged, promptReason, pushLocal, unreadCount } from '@/lib/inbox';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { motion, radius, space, useTheme, type Theme } from '@/theme';
import { Icon, T } from '@/ui';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
} catch { /* not available in this runtime */ }

// Icon and solid marker colour per notice type.
export function noticeLook(kind: string, t: Theme): { icon: LucideIcon; bg: string; fg: string } {
  if (kind.startsWith('crown')) return { icon: Crown, bg: t.crown, fg: t.onCrown };
  const c = categoryOf(kind);
  if (c === 'challenges') return { icon: Swords, bg: t.brand, fg: t.onBrand };
  if (kind === 'match.reaction') return { icon: Flame, bg: t.surface3, fg: t.text };
  if (c === 'matches') return { icon: Trophy, bg: t.surface3, fg: t.text };
  if (c === 'ranks') return { icon: TrendingUp, bg: t.surface3, fg: t.text };
  return { icon: Bell, bg: t.surface3, fg: t.text };
}

type Banner = { title: string; body?: string; notice?: Notice };
const bannerListeners = new Set<(b: Banner) => void>();
export const showBanner = (b: Banner) => bannerListeners.forEach((l) => l(b));
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function useUnread() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [count, setCount] = useState(0);
  const load = useCallback(async () => { if (uid) setCount(await unreadCount(uid)); }, [uid]);
  useFocusEffect(useCallback(() => { load(); return onInboxChange(load); }, [load]));
  return count;
}

// Opens a notice target: marks it read, switches league when needed, handles a deleted match.
export function useOpenNotice() {
  const { league, leagues, select } = useLeague();
  return useCallback(async (n: Notice) => {
    await markRead(n.id);
    const target = await noticeTarget(n);
    if (!leagues.some((l) => l.id === n.league_id)) { Alert.alert(`You're no longer a member of ${target.league?.name ?? 'this league'}`); return; }
    if (league?.id !== n.league_id) { await select(n.league_id); showBanner({ title: `Switched to ${target.league?.name}` }); }
    if (target.matchGone) { showBanner({ title: 'This match was deleted' }); router.navigate('/history'); return; }
    router.push(n.href as Href);
  }, [league, leagues, select]);
}

export function InboxRuntime() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const pathname = usePathname();
  const open = useOpenNotice();
  const here = useRef(pathname);
  const asked = useRef(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [y] = useState(() => new Animated.Value(-160));

  const hide = useCallback(() => {
    if (hideTimer) clearTimeout(hideTimer);
    Animated.timing(y, { toValue: -160, duration: motion.fast, easing: Easing.bezier(...motion.easing), useNativeDriver: true }).start(() => setBanner(null));
  }, [y]);

  const show = useCallback((b: Banner) => {
    setBanner(b);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(y, { toValue: 0, duration: motion.base, easing: Easing.bezier(...motion.easing), useNativeDriver: true }).start();
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 4000);
  }, [y, hide]);

  useEffect(() => { bannerListeners.add(show); return () => { bannerListeners.delete(show); }; }, [show]);
  useEffect(() => { here.current = pathname; }, [pathname]);

  // New notices: banner when the app is open (not when already on the target), local notification otherwise.
  useEffect(() => {
    if (!uid) return;
    const tick = async () => {
      const fresh = await freshNotices(uid);
      if (!fresh.length) return;
      inboxChanged();
      if (AppState.currentState === 'active') {
        const n = fresh[fresh.length - 1];
        if (here.current === n.href) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else show({ title: n.title, body: n.body, notice: n });
      } else for (const n of fresh) await pushLocal(n);
    };
    tick();
    const iv = setInterval(tick, 4000);
    const sub = AppState.addEventListener('change', tick);
    return () => { clearInterval(iv); sub.remove(); };
  }, [uid, show]);

  // Tapping a local notification, warm or cold start.
  useEffect(() => {
    const handle = async (r: Notifications.NotificationResponse | null) => {
      const data = r?.notification.request.content.data as { id?: string; href?: string } | undefined;
      if (!data?.href) return;
      const n = data.id ? (await db()).notices?.find((x) => x.id === data.id) : undefined;
      if (n) open(n); else router.push(data.href as Href);
    };
    let sub: { remove: () => void } | null = null;
    try {
      Notifications.getLastNotificationResponseAsync().then((r) => { handle(r); Notifications.clearLastNotificationResponseAsync?.()?.catch(() => {}); }).catch(() => {});
      sub = Notifications.addNotificationResponseReceivedListener(handle);
    } catch { /* not available */ }
    return () => sub?.remove();
  }, [open]);

  // A13: ask in context, back on a tab after the first logged match or challenge.
  useEffect(() => {
    if (!uid || asked.current || (pathname !== '/' && pathname !== '/history')) return;
    const id = setTimeout(async () => {
      const r = await promptReason(uid);
      if (!r || asked.current) return;
      asked.current = true;
      router.push({ pathname: '/push-prompt' as never, params: r });
    }, 700);
    return () => clearTimeout(id);
  }, [uid, pathname]);

  const pan = Gesture.Pan().runOnJS(true).onEnd((e) => { if (e.translationY < -12) hide(); });
  if (!banner) return null;
  const look = noticeLook(banner.notice?.kind ?? '', t);
  return (
    <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: space[3], right: space[3], top: insets.top + space[2], transform: [{ translateY: y }] }}>
      <GestureDetector gesture={pan}>
        <Pressable accessibilityRole="button" accessibilityLabel={banner.title}
          onPress={() => { hide(); if (banner.notice) open(banner.notice); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: t.overlay, borderWidth: 1, borderColor: t.line,
            shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={look.icon} size={18} color={look.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="label" numberOfLines={1}>{banner.title}</T>
            {banner.body ? <T v="small" c="text2" numberOfLines={1}>{banner.body}</T> : null}
          </View>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}
