const admin = require('../functions/node_modules/firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'anjaniappnew' })
}

const db = admin.firestore()

console.log('[Watcher] Listening for on-demand feedback trigger in Firestore collection ai_feedback_triggers...')

// Listen for any trigger with status 'pending'
const unsubscribe = db
  .collection('ai_feedback_triggers')
  .where('status', '==', 'pending')
  .limit(5)
  .onSnapshot(
    async (snapshot) => {
      if (!snapshot.empty) {
        console.log(`[Watcher] Detected ${snapshot.size} manual feedback trigger(s) from App UI!`)
        for (const doc of snapshot.docs) {
          const data = doc.data()
          console.log(`[Watcher] Trigger ID: ${doc.id}, source: ${data.source || 'app_ui_button'}, requestedAt: ${data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : data.requestedAt}`)
          try {
            await doc.ref.update({
              status: 'processing',
              pickedUpAt: new Date().toISOString(),
            })
          } catch (e) {
            console.error('[Watcher] Failed to update trigger doc:', e.message)
          }
        }
        unsubscribe()
        console.log('[Watcher] Trigger acknowledged. Exiting cleanly to resume agent execution.')
        process.exit(0)
      }
    },
    (err) => {
      console.error('[Watcher] Firestore listener error:', err)
      process.exit(1)
    }
  )

// Keep process active while listening
setInterval(() => {
  // Heartbeat every 10 minutes
}, 600000)
