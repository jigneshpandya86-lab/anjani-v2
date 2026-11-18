const fs = require('fs')
const { Firestore } = require('../functions/node_modules/@google-cloud/firestore')
const { OAuth2Client } = require('../functions/node_modules/google-auth-library')

const cfg = JSON.parse(
  fs.readFileSync('/home/jigneshpandya86/.config/configstore/firebase-tools.json', 'utf8')
)
const client = new OAuth2Client()
client.setCredentials(cfg.tokens)
const db = new Firestore({ projectId: 'anjaniappnew', authClient: client })

const memories = [
  {
    id: 'mem-whatsapp-banking-tray',
    category: 'ui_action_tray',
    rule: 'All AI cards support an interactive WhatsApp Banking-style secondary action tray with strictly 2–3 word buttons and numeric quick-select (1, 2, 3).',
    active: true,
    source: 'owner_feedback',
    metadata: {
      feature: 'whatsapp_banking_tray',
      wordLimit: 3,
      shortcuts: ['tap_button', 'chat_number', 'keyboard_1_9'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'mem-order-card-standard',
    category: 'naming_standard',
    rule: "Always use 'Order Card' to refer to order representations (covering open, draft, or past orders).",
    active: true,
    source: 'owner_feedback',
    metadata: {
      standardName: 'Order Card',
      replaces: ['Open Order Card'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'mem-card-feedback-format',
    category: 'feedback_standard',
    rule: 'Future card feedback follows 3-line format: Card: [Card Name] | Trigger: [When to show] | Actions (strictly 2-3 words each): [1] ... [2] ... [3] ...',
    active: true,
    source: 'owner_feedback',
    metadata: {
      format: '3_line_card_standard',
      example: 'Card: Order Card | Trigger: When order is tapped | Actions: [1] Remind Nilesh [2] WhatsApp Nilesh [3] Google Maps',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'mem-delivery-reminders',
    category: 'delivery_reminders',
    rule: "Follow-ups like 'Remind Nilesh for it' or 'Nilesh ne message karo aa order mate' trigger direct delivery reminder notifications via MacroDroid SMS webhook and must never create empty or generic tasks.",
    active: true,
    source: 'owner_feedback',
    metadata: {
      channel: 'sms_webhook_macrodroid',
      intent: 'staff_order_reminder',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

async function run() {
  console.log('Upserting persistent AI memories into Firestore collection aiMemories...')
  for (const m of memories) {
    const docRef = db.collection('aiMemories').doc(m.id)
    await docRef.set(m, { merge: true })
    console.log(`✓ Saved memory: ${m.id} (${m.category}) -> "${m.rule.substring(0, 50)}..."`)
  }
  console.log('All AI memories successfully persisted in Firestore!')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to seed AI memories:', err)
    process.exit(1)
  })
