const fs = require('fs');
const path = require('path');
const https = require('https');

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/configstore/firebase-tools.json'), 'utf8'));
const token = cfg.tokens.access_token;

function patchDocument(collection, docId, updateMask, fields) {
  return new Promise((resolve, reject) => {
    const maskParams = updateMask.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/anjaniappnew/databases/(default)/documents/${collection}/${docId}?${maskParams}`;
    
    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ fields }));
    req.end();
  });
}

async function run() {
  const resolvedAt = new Date().toISOString();

  console.log('1. Resolving feedback KMDkBiqTO7YCwZNUzGZk (remove Bailey from greeting)...');
  await patchDocument('ai_feedbacks', 'KMDkBiqTO7YCwZNUzGZk', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Updated authoritative skill specification (SKILL.md) and Cloud Function prompt to remove "Bailey" from greeting. The AI now greets strictly as "Anjani AI, operations assistant for Anjani Packaged Drinking Water".'
    }
  });
  console.log('Feedback KMDkBiqTO7YCwZNUzGZk marked completed.');

  console.log('2. Resolving feedback Ed1kI6wph2DH00Y0TcBe (Customer cancellation SMS to Bhaveshbhai)...');
  await patchDocument('ai_feedbacks', 'Ed1kI6wph2DH00Y0TcBe', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Added client_message intent in Cloud Function and interactive customer draft card in AiAssistantDrawer with direct 1-tap WhatsApp and SMS buttons. Grounded driver staff (Nilesh/Hiteshbhai) vs customers (Bhaveshbhai) in SKILL.md so customer communications are never assigned to drivers.'
    }
  });
  console.log('Feedback Ed1kI6wph2DH00Y0TcBe marked completed.');

  console.log('3. Resolving feedback CFDgkqbnGXXgneG2DJY4 (Bottom nav edge buttons submerged on Android)...');
  await patchDocument('ai_feedbacks', 'CFDgkqbnGXXgneG2DJY4', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Fixed Android PWA bottom nav clearance by adding min-h-[64px], adaptive padding max(16px, env(safe-area-inset-bottom, 16px)), and AI tab container height clearance.'
    }
  });
  console.log('Feedback CFDgkqbnGXXgneG2DJY4 marked completed.');

  console.log('All 3 feedbacks successfully marked completed!');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
