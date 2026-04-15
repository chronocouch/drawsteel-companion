const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// ── Session cleanup ─────────────────────────────────────────────────────────
// Deletes sessions older than 48 hours that are no longer active
// Runs once per day at 3am

exports.cleanupOldSessions = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    const db = admin.firestore();
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const snapshot = await db.collection('sessions')
      .where('active', '==', false)
      .where('createdAt', '<', cutoff)
      .get();

    const deletions = snapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletions);

    console.log(`Cleaned up ${deletions.length} old sessions`);
    return null;
  });
