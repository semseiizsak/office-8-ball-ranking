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

exports.notifyLeagueMatch = onDocumentCreated('matches/{matchId}', async (event) => {
  const match = event.data?.data();
  if (!match) return;
  const playersSnapshot = await getFirestore().collection('players').get();
  const winnerName = match.winnerId === match.playerAId ? match.playerAName : match.playerBName;
  const loserName = match.winnerId === match.playerAId ? match.playerBName : match.playerAName;
  const batch = getFirestore().batch();
  for (const player of playersSnapshot.docs) {
    batch.set(getFirestore().collection('notifications').doc(), {
      type: 'match_logged',
      recipientPlayerId: player.id,
      title: 'Match logged',
      body: `${winnerName} defeated ${loserName}. ${match.eloDelta} Elo exchanged.`,
      matchId: event.params.matchId,
      createdAt: new Date(),
      read: false,
    });
  }
  await batch.commit();
});
