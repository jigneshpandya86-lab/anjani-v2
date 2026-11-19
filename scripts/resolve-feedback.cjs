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
  const mapUrl = 'https://maps.app.goo.gl/zhy35VaFNRsV6jhq7?g_st=ac';
  
  console.log('1. Updating order 7lNRmLQd1cw6UCTOozJE...');
  await patchDocument('orders', '7lNRmLQd1cw6UCTOozJE', ['mapLink', 'location'], {
    mapLink: { stringValue: mapUrl },
    location: { stringValue: mapUrl }
  });
  console.log('Order updated with mapLink.');

  console.log('2. Updating client C-1770202009693...');
  await patchDocument('customers', 'C-1770202009693', ['mapLink'], {
    mapLink: { stringValue: mapUrl }
  });
  console.log('Client updated with mapLink.');

  console.log('3. Resolving feedback TO03jykdLG5ANcaNM74U...');
  await patchDocument('ai_feedbacks', 'TO03jykdLG5ANcaNM74U', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: new Date().toISOString() },
    resolutionNote: { stringValue: 'Fixed location auto-save in AiAssistantDrawer, compacted output format to 2 lines, and updated order 7lNRmLQd1cw6UCTOozJE mapLink.' }
  });
  console.log('Feedback TO03jykdLG5ANcaNM74U marked completed.');

  console.log('4. Resolving feedback fRApGvJzRI2l9J7ikr9l...');
  await patchDocument('ai_feedbacks', 'fRApGvJzRI2l9J7ikr9l', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: new Date().toISOString() },
    resolutionNote: { stringValue: 'Fixed location auto-save and chip actions in AiAssistantDrawer.' }
  });
  console.log('Feedback fRApGvJzRI2l9J7ikr9l marked completed.');

  console.log('All updates successful!');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
