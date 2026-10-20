// K2 match thread inline on match detail (M5.3, K2.1), plus the share and report buttons for the match header (M5.5, M5.6).
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Flag, Share2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { canEditMatch, type MatchDetail } from '@/lib/api';
import { acceptGuidelines, addComment, deleteComment, loadComments, report, toggleCommentReaction, type Comment, type CommentView } from '@/lib/chat';
import { ago } from '@/lib/challenges';
import type { Member } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, IconButton, Pill, T } from '@/ui';
import { tapTime, ActionSheet, BlockSheet, Composer, GuidelinesCard, ReactionPills, RemoveSheet, ReportSheet, Rich, Sheet, WhoReacted, type Action, type ReportReq } from '@/ui/chat-kit';

export function MatchComments({ matchId, leagueId }: { matchId: string; leagueId: string }) {
  const { t } = useTheme();
  const { session } = useAuth();
  const { members, league } = useLeague();
  const [v, setV] = useState<CommentView | null>(null);
  const [all, setAll] = useState(false);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Comment | null>(null);
  const [who, setWho] = useState<Comment['reactions'] | null>(null);
  const [reportReq, setReportReq] = useState<ReportReq | null>(null);
  const [blockFor, setBlockFor] = useState<Member | null>(null);
  const [removeFor, setRemoveFor] = useState<{ kind: 'comment'; id: string; author: string } | null>(null);
  const taps = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!session) return;
    try { setV(await loadComments(session.user, matchId)); } catch { /* keep the last list */ }
  }, [session, matchId]);
  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]));

  if (!v || !v.enabled || !v.me) return null;
  const me = v.me;
  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id: string) => (id === me.id ? 'You' : byId.get(id)?.display_name ?? 'Former player');
  const live = v.comments.filter((c) => !c.deleted_at || v.comments.some((x) => x.reply_to === c.id));
  const shown = all ? live : live.slice(-2);
  const count = v.comments.filter((c) => !c.deleted_at && !c.removed_by).length;

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.'); }
    load();
  };
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try { await addComment(session!.user, matchId, text, reply?.id ?? null); Haptics.selectionAsync(); setText(''); setReply(null); setAll(true); }
    catch (e) { Alert.alert("Couldn't post", e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); load(); }
  };
  const tap = (c: Comment) => {
    const now = tapTime(), last = taps.current[c.id] ?? 0;
    taps.current[c.id] = now;
    if (now - last < 280) { taps.current[c.id] = 0; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); run(() => toggleCommentReaction(session!.user, c.id, '🔥')); }
  };
  const actions = (c: Comment): Action[] => {
    if (c.deleted_at || c.removed_by) return [];
    const author = byId.get(c.author) ?? null;
    const out: Action[] = [{ label: 'Reply', run: () => setReply(c) }, { label: 'Copy text', run: () => Clipboard.setStringAsync(c.body) }];
    if (c.reactions.length) out.push({ label: 'View reactions', run: () => setWho(c.reactions) });
    if (c.author === me.id) out.push({ label: 'Delete', danger: true, run: () => run(() => deleteComment(session!.user, c.id)) });
    else {
      out.push({ label: v.reported.has(c.id) ? 'Reported' : 'Report', danger: true, run: () => (v.reported.has(c.id) ? Alert.alert('Already reported', "You reported this. We're looking at it.") : setReportReq({ leagueId, target: 'comment', targetId: c.id, author, snapshot: c.body, label: 'comment' })) });
      if (v.admin) out.push({ label: 'Remove', danger: true, run: () => setRemoveFor({ kind: 'comment', id: c.id, author: author?.display_name ?? 'The author' }) });
      if (author) out.push({ label: `Block ${author.display_name}`, danger: true, run: () => setBlockFor(author) });
    }
    return out;
  };

  const item = (c: Comment) => {
    const a = byId.get(c.author);
    const parent = c.reply_to ? v.comments.find((x) => x.id === c.reply_to) : null;
    const gone = c.deleted_at ? 'Comment deleted' : c.removed_by ? 'Removed by an admin' : c.hidden && c.author !== me.id ? 'Hidden while the admins review it' : null;
    return (
      <View key={c.id} style={{ flexDirection: 'row', gap: space[3], marginLeft: parent ? space[8] : 0 }}>
        <Pressable accessibilityLabel={`${nameOf(c.author)}, view profile`} onPress={() => a && router.push(`/player/${a.id}`)}>
          {a ? <Avatar name={a.display_name} colour={a.colour} size={parent ? 28 : 36} /> : <View style={{ width: 36 }} />}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <T v="label">{nameOf(c.author)}</T>
            {v.players.has(c.author) ? <Pill label="Player" /> : null}
            <T v="caption" c="text3">{ago(c.created_at)}</T>
          </View>
          {parent ? <T v="caption" c="text3">Replying to {nameOf(parent.author)}</T> : null}
          {gone ? <T v="small" c="text3">{gone}</T> : (
            <Pressable accessibilityHint="Double tap to react with fire, long press for more" onPress={() => tap(c)} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenu(c); }}
              style={({ pressed }) => ({ borderRadius: radius.xs, backgroundColor: pressed ? t.surface3 : 'transparent' })}>
              <Rich body={c.body} names={members.map((m) => m.display_name)} colour={t.text} />
            </Pressable>
          )}
          {!gone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <ReactionPills reactions={c.reactions} meId={me.id} onToggle={(e) => run(() => toggleCommentReaction(session!.user, c.id, e))} onLongPress={() => setWho(c.reactions)} />
              <Pressable accessibilityRole="button" onPress={() => setReply(parent ?? c)} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
                <T v="caption" c="text2">Reply</T>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
      <T v="heading">Comments{count ? ` ${count}` : ''}</T>
      {!live.length ? <T v="small" c="text2">No comments yet. Say something nice. Or don&apos;t.</T> : null}
      {!all && live.length > 2 ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T v="label" c="text2">View all {live.length} comments</T>
        </Pressable>
      ) : null}
      {shown.map(item)}
      {!v.accepted ? <GuidelinesCard onAgree={() => run(() => acceptGuidelines(session!.user))} /> : (
        <Composer value={text} onChange={setText} onSend={send} busy={busy} placeholder="Add a comment" members={members.filter((m) => m.id !== me.id && !v.blocked.has(m.id))}
          replying={reply ? nameOf(reply.author) : null} onCancelReply={() => setReply(null)} />
      )}

      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} preview={menu?.body}
        mine={menu?.reactions.filter((r) => r.member_id === me.id).map((r) => r.emoji)}
        react={menu && !menu.deleted_at && !menu.removed_by ? (e) => run(() => toggleCommentReaction(session!.user, menu.id, e)) : undefined}
        actions={menu ? actions(menu) : []} />
      <WhoReacted reactions={who} members={members} meId={me.id} onClose={() => setWho(null)} />
      <ReportSheet req={reportReq} onClose={() => { setReportReq(null); load(); }} leagueName={league?.name} />
      <BlockSheet member={blockFor} onClose={() => { setBlockFor(null); load(); }}
        onReport={blockFor ? () => setReportReq({ leagueId, target: 'profile', targetId: blockFor.id, author: blockFor, snapshot: blockFor.display_name, label: 'profile' }) : undefined} />
      <RemoveSheet item={removeFor} onClose={() => setRemoveFor(null)} onDone={load} />
    </View>
  );
}

// Header buttons for match detail: share card (M5.6, K7.1) and report a problem (M5.5).
export function MatchHeaderActions({ match }: { match: MatchDetail }) {
  const { session } = useAuth();
  const { me, members, league } = useLeague();
  const [open, setOpen] = useState(false);
  const [reportReq, setReportReq] = useState<ReportReq | null>(null);
  const played = match.match_players.some((p) => p.member_id === me?.id);
  const byId = new Map(members.map((m) => [m.id, m]));
  const summary = () => {
    const side = (s: 'a' | 'b') => match.match_players.filter((p) => p.side === s).map((p) => byId.get(p.member_id)?.display_name ?? 'Former player').join(' and ');
    return `${side(match.winner)} beat ${side(match.winner === 'a' ? 'b' : 'a')}${match.score_a != null ? ` ${match.score_a} : ${match.score_b}` : ''}`;
  };
  const go = (fn: () => void) => () => { setOpen(false); setTimeout(fn, 300); };
  const wrong = async () => {
    const perm = await canEditMatch(session!.user, match.id);
    if (perm.allowed) { router.push({ pathname: '/log', params: { edit: match.id } }); return; }
    await report(session!.user, { leagueId: match.league_id, target: 'result', targetId: match.id, author: null, reason: 'The result is wrong', snapshot: summary() });
    Alert.alert('Thanks. Admins will take a look.', 'They can fix the score or remove the match.');
  };
  return (
    <>
      <IconButton icon={Share2} label="Share result" onPress={() => router.push({ pathname: '/share/[id]', params: { id: match.id } })} />
      {me ? <IconButton icon={Flag} label="Report a problem" onPress={() => setOpen(true)} /> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Report a problem">
        {played ? <Button label="The result is wrong" variant="secondary" full onPress={go(wrong)} /> : null}
        <Button label="Something here is offensive" variant="secondary" full
          onPress={go(() => setReportReq({ leagueId: match.league_id, target: 'match', targetId: match.id, author: null, snapshot: summary(), label: 'match' }))} />
        <T v="caption" c="text3" center>Wrong scores go to the admins to fix. Offensive comments can also be reported with a long press.</T>
      </Sheet>
      <ReportSheet req={reportReq} onClose={() => setReportReq(null)} leagueName={league?.name} />
    </>
  );
}
