const fs = require('fs');
const path = require('path');
const https = require('https');

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/configstore/firebase-tools.json'), 'utf8'));
const token = cfg.tokens.access_token;
const url = 'https://firestore.googleapis.com/v1/projects/anjaniappnew/databases/(default)/documents/ai_feedbacks';

const req = https.get(url, {
  headers: {
    'Authorization': 'Bearer ' + token
  },
  timeout: 10000
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      const list = data.documents || [];
      console.log('Total feedbacks in Firestore:', list.length);
      list.sort((a,b) => new Date(b.createTime) - new Date(a.createTime));
      
      const pending = list.filter(d => {
        const s = d.fields?.status?.stringValue;
        return s !== 'completed' && s !== 'resolved';
      });
      console.log('Pending count:', pending.length);

      list.slice(0, 5).forEach((d, idx) => {
        const id = d.name.split('/').pop();
        const f = d.fields || {};
        console.log(`\n[${idx + 1}] ID: ${id}`);
        console.log('Status:', f.status?.stringValue || 'none');
        console.log('Created:', d.createTime);
        console.log('Message:', f.message?.stringValue || '(none)');
        console.log('Note:', f.note?.stringValue || '(none)');
        console.log('RawSnippet:', f.rawSnippet?.stringValue || '(none)');
        console.log('Has Screenshot:', !!(f.attachmentUrl || f.screenshotDataUrl));
      });
    } catch (e) {
      console.error('Parse error:', e.message, body.slice(0, 200));
    }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});
