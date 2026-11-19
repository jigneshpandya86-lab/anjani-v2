const fs = require('fs');
const path = require('path');
const https = require('https');

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/configstore/firebase-tools.json'), 'utf8'));
const token = cfg.tokens.access_token;

const req = https.request('https://firestore.googleapis.com/v1/projects/anjaniappnew/databases/(default)/documents/ai_feedbacks?pageSize=300', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.documents) {
        console.log('Total fetched:', data.documents.length);
        const docs = data.documents.map(d => {
          const f = d.fields || {};
          return {
            id: d.name.split('/').pop(),
            status: f.status ? f.status.stringValue : 'pending',
            message: f.message ? f.message.stringValue : '',
            created: f.submittedAt ? f.submittedAt.stringValue : (f.createdAt ? f.createdAt.timestampValue : d.createTime),
            hasScreenshot: Boolean(f.attachmentUrl && f.attachmentUrl.stringValue || f.screenshotDataUrl && f.screenshotDataUrl.stringValue)
          };
        });

        // Sort by created descending
        docs.sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        console.log('\n=== RECENT FEEDBACKS ===');
        docs.slice(0, 10).forEach((d, i) => {
          console.log(`${i + 1}. [${d.status.toUpperCase()}] ${d.id}`);
          console.log(`   Message: ${d.message}`);
          console.log(`   Date: ${d.created} | Screenshot: ${d.hasScreenshot}`);
        });

        const pending = docs.filter(d => d.status === 'pending' || d.status === 'pending_review' || d.status === 'pending_weekly_review' || d.status === 'code_fix_queued');
        console.log(`\n=== PENDING QUEUE (${pending.length} items) ===`);
        pending.forEach((d, i) => {
          console.log(`${i + 1}. [${d.status}] "${d.message}" (ID: ${d.id})`);
        });
      } else {
        console.log('No documents or error:', body);
      }
    } catch (e) {
      console.log('Error parsing:', e.message);
    }
  });
});
req.on('error', console.error);
req.end();
