/**
 * Relays an addressed notification to devices via Firebase Cloud Messaging.
 *
 * Runs as a Vercel serverless function instead of a Firebase Cloud Function
 * so real background push works without the Firebase project ever needing
 * the Blaze (pay-as-you-go) plan — FCM itself is free on any plan, the
 * Blaze requirement only exists for deploying Cloud Functions. The client
 * (src/services/notifications.ts) calls this right after writing the
 * Firestore notification doc; it's best-effort and never blocks the
 * in-app Firestore inbox, which keeps working the same either way.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function adminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { recipientPlayerIds, title, body, type, notificationId } = req.body ?? {};
  if (!Array.isArray(recipientPlayerIds) || recipientPlayerIds.length === 0 || !title) {
    res.status(400).json({ error: 'recipientPlayerIds (non-empty array) and title are required' });
    return;
  }

  adminApp();
  const db = getFirestore();
  const messaging = getMessaging();

  await Promise.all(
    recipientPlayerIds.map(async (playerId: string) => {
      const tokensCollection = db.collection('players').doc(playerId).collection('notificationTokens');
      const tokensSnapshot = await tokensCollection.get();
      const tokens = tokensSnapshot.docs.map((tokenDoc) => tokenDoc.id);
      if (tokens.length === 0) return;

      // Data-only — no top-level `notification` field. Sending one alongside a
      // custom onBackgroundMessage handler makes some browsers auto-display
      // the push AND run the handler, showing the same notification twice on
      // one device. Keeping this data-only means our service worker's single
      // showNotification() call is the only thing that ever displays it.
      const response = await messaging.sendEachForMulticast({
        tokens,
        data: {
          title: String(title),
          body: String(body ?? ''),
          type: String(type ?? 'league'),
          notificationId: String(notificationId ?? ''),
        },
        webpush: { fcmOptions: { link: 'https://office-8-ball-rankings.vercel.app' } },
      });

      // A token stops being valid when someone uninstalls/revokes notification
      // permission — drop it so the next send doesn't keep retrying it.
      const invalidTokens = response.responses
        .map((result, index) => (result.success ? null : tokens[index]))
        .filter((token): token is string => Boolean(token));
      await Promise.all(invalidTokens.map((token) => tokensCollection.doc(token).delete()));
    })
  );

  res.status(200).json({ ok: true });
}
