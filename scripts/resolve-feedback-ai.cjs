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

  console.log('1. Resolving feedback u9tdr5LgAn49MujESq6D (Industry standard AI)...');
  await patchDocument('ai_feedbacks', 'u9tdr5LgAn49MujESq6D', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Eliminated client-side regex interceptors and flow questionnaire traps. Connected conversational greetings and capabilities queries directly to Google Cloud Vertex AI Gemini 2.5 (askAnjaniAi).'
    }
  });
  console.log('Feedback u9tdr5LgAn49MujESq6D marked completed.');

  console.log('2. Resolving feedback O5jxBDWa6tEe8R92Oam1 (Bottom navigation pane buttons)...');
  await patchDocument('ai_feedbacks', 'O5jxBDWa6tEe8R92Oam1', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Fixed Android PWA edge-to-edge / 3-button navigation overlay by adding viewport-fit=cover and dynamic safe-area-inset-bottom padding to the bottom navigation bar and content layout.'
    }
  });
  console.log('Feedback O5jxBDWa6tEe8R92Oam1 marked completed.');

  console.log('All updates successful!');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
