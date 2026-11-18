const fs = require('fs')
const { Firestore } = require('../functions/node_modules/@google-cloud/firestore')
const { OAuth2Client } = require('../functions/node_modules/google-auth-library')

function getDb() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync('/home/jigneshpandya86/.config/configstore/firebase-tools.json', 'utf8')
    )
    const client = new OAuth2Client()
    client.setCredentials(cfg.tokens)
    return new Firestore({ projectId: 'anjaniappnew', authClient: client })
  } catch (_authErr) {
    const admin = require('../functions/node_modules/firebase-admin')
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: 'anjaniappnew' })
    }
    return admin.firestore()
  }
}

let db = getDb()

console.log('[Watcher] Listening for on-demand feedback trigger in Firestore collection ai_feedback_triggers (polling every 10s)...')

async function checkPendingTriggers() {
  try {
    const snapshot = await db
      .collection('ai_feedback_triggers')
      .where('status', '==', 'pending')
      .limit(5)
      .get()

    if (!snapshot.empty) {
      console.log(`[Watcher] Detected ${snapshot.size} manual feedback trigger(s) from App UI!`)
      for (const doc of snapshot.docs) {
        const data = doc.data()
        console.log(
          `[Watcher] Trigger ID: ${doc.id}, source: ${data.source || 'app_ui_button'}, requestedAt: ${
            data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : data.requestedAt
          }`
        )
        try {
          await doc.ref.update({
            status: 'processing',
            pickedUpAt: new Date().toISOString(),
          })
        } catch (e) {
          console.error('[Watcher] Failed to update trigger doc:', e.message)
        }
      }
      console.log('[Watcher] Trigger acknowledged. Exiting cleanly to resume agent execution.')
      process.exit(0)
    }
  } catch (err) {
    console.warn('[Watcher] Transient polling error (will retry next cycle):', err.message)
    try {
      db = getDb()
    } catch (_reErr) {}
  }
}

// Initial check immediately
checkPendingTriggers()

// Poll every 10 seconds
setInterval(checkPendingTriggers, 10000)
