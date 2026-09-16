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

/**
 * Relays a logged match only to the people it actually concerns.
 *
 * Everybody used to get a push for every game, which is how a league app gets
 * muted. Now: the two players always hear, anyone who staked a prediction hears
 * the result of their call, and the whole office only hears when the crown
 * changes hands.
 */
exports.notifyLeagueMatch = onDocumentCreated('matches/{matchId}', async (event) => {
  const match = event.data?.data();
  if (!match) return;

  const db = getFirestore();
  const winnerName = match.winnerId === match.playerAId ? match.playerAName : match.playerBName;
  const loserName = match.winnerId === match.playerAId ? match.playerBName : match.playerAName;
  const crownTaken = Number(match.bountyCollected || 0) > 0;

  /** recipientId -> { title, body }; one notification per person, best reason wins. */
  const recipients = new Map();
  const addRecipient = (playerId, title, body) => {
    if (!playerId || recipients.has(playerId)) return;
    recipients.set(playerId, { title, body });
  };

  if (crownTaken) {
    const playersSnapshot = await db.collection('players').get();
    for (const player of playersSnapshot.docs) {
      addRecipient(
        player.id,
        'The crown has changed hands',
        `${winnerName} took down ${loserName} and collected a ${match.bountyCollected} point bounty.`
      );
    }
  }

  if (match.challengeId) {
    const challengeSnapshot = await db.collection('challenges').doc(match.challengeId).get();
    const predictions = challengeSnapshot.data()?.predictions || {};
    for (const [predictorId, prediction] of Object.entries(predictions)) {
      const wasRight = prediction?.predictedWinnerId === match.winnerId;
      addRecipient(
        predictorId,
        wasRight ? 'You called it' : 'You called it wrong',
        `${winnerName} beat ${loserName}.`
      );
    }
  }

  addRecipient(
    match.winnerId,
    'Result recorded',
    `You beat ${loserName}. +${match.eloDelta} Elo${crownTaken ? ` and a ${match.bountyCollected} point bounty` : ''}.`
  );
  addRecipient(match.loserId, 'Result recorded', `${winnerName} beat you. -${match.eloDelta} Elo.`);

  if (recipients.size === 0) return;

  const batch = db.batch();
  for (const [recipientPlayerId, payload] of recipients) {
    batch.set(db.collection('notifications').doc(), {
      type: crownTaken ? 'crown_taken' : 'match_logged',
      recipientPlayerId,
      title: payload.title,
      body: payload.body,
      matchId: event.params.matchId,
      createdAt: new Date(),
      read: false,
    });
  }
  await batch.commit();
});
