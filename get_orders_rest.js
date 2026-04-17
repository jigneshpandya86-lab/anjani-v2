const { execSync } = require('child_process');

async function getOrders() {
  const token = execSync('gcloud auth print-access-token').toString().trim();
  const url = 'https://firestore.googleapis.com/v1/projects/anjaniappnew/databases/(default)/documents:runQuery';
  
  // Try querying where 'date' == '2026-04-13' or 'deliveryDate' == '2026-04-13'
  // I will just query for deliveryDate first, or just list all and filter to avoid complex composite index issues
  
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'deliveryDate' },
          op: 'EQUAL',
          value: { stringValue: '2026-04-13' }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

getOrders().catch(console.error);
