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

  console.log('Resolving feedback 56hvHRVfMVwtqJP5wKYf (Permanent Fix: Native Function Calling & edit_order)...');
  await patchDocument('ai_feedbacks', '56hvHRVfMVwtqJP5wKYf', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Permanent architectural fix implemented: Upgraded from prompt JSON string parsing to Native Gemini Function Calling (Tools API) in Vertex AI with 10 structured tools (edit_order, create_order, query_orders, send_client_message, staff_reminder, etc.) and dedicated systemInstruction. Multi-turn order editing is now stateful, preserving customer context without confusing client names with new orders.'
    }
  });
  console.log('Feedback 56hvHRVfMVwtqJP5wKYf marked completed!');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
