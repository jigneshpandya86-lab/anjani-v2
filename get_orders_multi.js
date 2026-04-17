const { execSync } = require('child_process');

async function getOrders() {
  const token = execSync('gcloud auth print-access-token').toString().trim();
  const url = 'https://firestore.googleapis.com/v1/projects/anjaniappnew/databases/(default)/documents:runQuery';
  
  const results = [];
  
  for (const field of ['date', 'orderDate', 'deliveryDate']) {
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
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
    if (data.length > 1 || (data.length === 1 && data[0].document)) {
        data.forEach(item => {
            if(item.document) results.push(item.document);
        });
    }
  }
  
  if(results.length === 0) {
      // try looking for anything with 13-4-2026 or 13/04/2026
      for (const field of ['date', 'orderDate', 'deliveryDate']) {
          for (const val of ['13-04-2026', '13-4-2026', '13/04/2026']) {
            const query = {
              structuredQuery: {
                from: [{ collectionId: 'orders' }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: field },
                    op: 'EQUAL',
                    value: { stringValue: val }
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
            if (data.length > 1 || (data.length === 1 && data[0].document)) {
                data.forEach(item => {
                    if(item.document) results.push(item.document);
                });
            }
          }
      }
  }

  // De-duplicate results
  const uniqueResults = results.filter((value, index, self) => 
    index === self.findIndex((t) => (
        t.name === value.name
    ))
  );

  console.log(JSON.stringify(uniqueResults, null, 2));
}

getOrders().catch(console.error);
