/**
 * Monday's cup sign-up reminder: once at 9:30, a last call at 11:30.
 *
 * Called on a schedule (`?slot=morning` / `?slot=late`). Every player who has
 * not signed up yet gets the same inbox notification and push the app sends
 * itself. Each slot goes out at most once a week, kept in `cupReminders/{week}`,
 * and only between its own time and the noon close, so a repeated or stray
 * call can never send it twice or at the wrong hour.
 *
 * Reads: the week's tournament, its reminder doc and the players, then the
 * device tokens of whoever is reminded. A few dozen reads a week.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const ZONE = 'Europe/Budapest';
/** Same as CUP_CLOSES_HOUR in src/utils/tournament.ts. */
const CLOSES_HOUR = 12;

const SLOTS = {
  morning: {
    from: 9 * 60 + 30,
    title: '🏆 The weekly cup is open',
    body: 'Sign up before noon, the draw is at 12:00.',
  },
  late: {
    from: 11 * 60 + 30,
    title: '🏆 Last call for the cup',
    body: 'Sign-ups close at noon. Half an hour to get in.',
  },
} as const;

type Slot = keyof typeof SLOTS;

function adminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  return initializeApp({ credential: cert(serviceAccount) });
}

/** Budapest's date, weekday and minute of the day right now. */
function budapestNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    monday: parts.weekday === 'Mon',
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export default async function handler(req: any, res: any) {
  const slot = String(req.query?.slot ?? '') as Slot;
  if (!(slot in SLOTS)) {
    res.status(400).json({ error: 'slot must be morning or late' });
    return;
  }

  const now = budapestNow();
  if (!now.monday || now.minute < SLOTS[slot].from || now.minute >= CLOSES_HOUR * 60) {
    res.status(200).json({ ok: true, sent: 0, skipped: 'outside the slot' });
    return;
  }

  adminApp();
  const db = getFirestore();
  const week = now.day;

  // Claim the slot first, so two calls racing each other still send once.
  const reminderRef = db.collection('cupReminders').doc(week);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reminderRef);
    if (snapshot.get(slot)) return false;
    transaction.set(reminderRef, { [slot]: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!claimed) {
    res.status(200).json({ ok: true, sent: 0, skipped: 'already sent' });
    return;
  }

  const [tournament, players] = await Promise.all([
    db.collection('tournaments').doc(week).get(),
    db.collection('players').get(),
  ]);
  if (tournament.get('drawnAt')) {
    res.status(200).json({ ok: true, sent: 0, skipped: 'already drawn' });
    return;
  }
  const signedUp = new Set(((tournament.get('entrants') ?? []) as Array<{ id: string }>).map((entry) => entry.id));
  const recipients = players.docs.map((player) => player.id).filter((id) => !signedUp.has(id));

  const { title, body } = SLOTS[slot];
  const messaging = getMessaging();
  await Promise.all(
    recipients.map(async (playerId) => {
      const notification = db.collection('notifications').doc();
      await notification.set({
        type: 'tournament',
        recipientPlayerId: playerId,
        title,
        body,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
      });

      const tokensCollection = db.collection('players').doc(playerId).collection('notificationTokens');
      const tokens = (await tokensCollection.get()).docs.map((tokenDoc) => tokenDoc.id);
      if (tokens.length === 0) return;
      // Data-only, like api/send-push.ts: the service worker shows it once.
      const response = await messaging.sendEachForMulticast({
        tokens,
        data: { title, body, type: 'tournament', notificationId: notification.id },
        webpush: { fcmOptions: { link: 'https://office-8-ball-rankings.vercel.app' } },
      });
      const invalidTokens = response.responses
        .map((result, index) => (result.success ? null : tokens[index]))
        .filter((token): token is string => Boolean(token));
      await Promise.all(invalidTokens.map((token) => tokensCollection.doc(token).delete()));
    })
  );

  res.status(200).json({ ok: true, sent: recipients.length });
}
