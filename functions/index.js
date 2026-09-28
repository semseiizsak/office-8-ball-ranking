const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

exports.sendLeagueNotification = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const notification = event.data?.data();
  if (!notification?.recipientPlayerId) return;

  const tokensSnapshot = await getFirestore()
    .collection('players')
    .doc(notification.recipientPlayerId)
    .collection('notificationTokens')
    .get();
  const tokens = tokensSnapshot.docs.map((tokenDoc) => tokenDoc.id);
  if (tokens.length === 0) return;

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: notification.title || 'Office 8-Ball',
      body: notification.body || 'You have a new league update.',
    },
    data: {
      type: notification.type || 'league',
      notificationId: event.params.notificationId,
    },
    webpush: {
      fcmOptions: { link: 'https://office-8-ball-rankings.vercel.app' },
    },
  });

  const invalidTokens = response.responses
    .map((result, index) => (result.success ? null : tokens[index]))
    .filter(Boolean);
  await Promise.all(invalidTokens.map((token) =>
    getFirestore().collection('players').doc(notification.recipientPlayerId)
      .collection('notificationTokens').doc(token).delete()
  ));
});

// Result notifications (loser, anyone passed, predictors, crown change) are
// composed and written by the client when the match is logged, so the app
// works the same on the Spark plan. This function only relays addressed
// documents to devices.
