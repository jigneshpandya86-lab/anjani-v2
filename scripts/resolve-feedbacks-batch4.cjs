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

  console.log('1. Resolving feedback edpc8cWKJ6fBVpC7gozG (Book Order incomplete command handling)...');
  await patchDocument('ai_feedbacks', 'edpc8cWKJ6fBVpC7gozG', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Updated SKILL.md specification and AiAssistantDrawer client guard: when user types "Book Order" or "New Order" without specifying customer name and items, AI politely prompts for customer name and quantity rather than creating a dummy placeholder card with 0 units.'
    }
  });
  console.log('Feedback edpc8cWKJ6fBVpC7gozG marked completed.');

  console.log('2. Resolving feedback hIYcqS5AphdjMnmHX2Mq (Card/chip clicks do nothing)...');
  await patchDocument('ai_feedbacks', 'hIYcqS5AphdjMnmHX2Mq', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Added universal fallback handler in handleChipClick to automatically dispatch chip.value, chip.text, or chip.label directly to handleSend, ensuring every quick action card and suggestion chip immediately triggers AI execution.'
    }
  });
  console.log('Feedback hIYcqS5AphdjMnmHX2Mq marked completed.');

  console.log('3. Resolving feedback pKDCd0uMDhTKlGxmMHkQ (Menu shall fit on one page only)...');
  await patchDocument('ai_feedbacks', 'pKDCd0uMDhTKlGxmMHkQ', ['status', 'resolvedAt', 'resolutionNote'], {
    status: { stringValue: 'completed' },
    resolvedAt: { timestampValue: resolvedAt },
    resolutionNote: {
      stringValue: 'Redesigned the main menu into an ultra-compact single-card interface (~200px height with h-7 compact pill buttons) that fits 100% on any mobile viewport without requiring any vertical scrolling.'
    }
  });
  console.log('Feedback pKDCd0uMDhTKlGxmMHkQ marked completed.');

  console.log('All 3 feedbacks successfully marked completed!');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
