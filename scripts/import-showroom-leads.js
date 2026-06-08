import fs from 'fs';

function getAccessToken() {
  try {
    const configPath = '/home/jigneshpandya86/.config/configstore/firebase-tools.json';
    if (fs.existsSync(configPath)) {
      const toolsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const token = toolsConfig.tokens?.access_token;
      if (token) {
        return token;
      }
    }
  } catch (e) {
    console.error("Error reading Firebase CLI config:", e.message);
  }
  throw new Error("Unable to obtain Firebase CLI access token. Please run 'npx firebase login' first.");
}

async function queryFirestore(accessToken, url, body = null) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/anjaniappnew/databases/(default)/documents${url}`, options);
  const data = await response.json();
  if (data.error) {
    throw new Error(`${data.error.status}: ${data.error.message}`);
  }
  return data;
}

async function fetchAllExistingMobiles(accessToken) {
  const mobiles = new Set();
  let url = '/leads?pageSize=100';
  
  while (true) {
    const res = await queryFirestore(accessToken, url);
    if (res.documents) {
      for (const doc of res.documents) {
        if (doc.fields && doc.fields.mobile && doc.fields.mobile.stringValue) {
          const cleanMobile = doc.fields.mobile.stringValue.trim();
          if (cleanMobile) {
            mobiles.add(cleanMobile);
          }
        }
      }
    }
    if (res.nextPageToken) {
      url = `/leads?pageSize=100&pageToken=${res.nextPageToken}`;
    } else {
      break;
    }
  }
  
  return mobiles;
}

async function createLead(accessToken, lead) {
  return await queryFirestore(accessToken, '/leads', {
    fields: {
      name: { stringValue: lead.name },
      mobile: { stringValue: lead.mobile },
      source: { stringValue: 'open_source' },
      Tag: { nullValue: null },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  });
}

// Showrooms data list to process
const defaultShowrooms = [
  { name: "Kataria Automobiles (Maruti Suzuki, Makarpura)", mobile: "9574994000" },
  { name: "Amar Cars (Maruti Suzuki, Subhanpura)", mobile: "9925246281" },
  { name: "Kiran Motors (Maruti Suzuki, Old Chhani Road)", mobile: "9925434566" },
  { name: "Shree Gopinathji Honda (Makarpura)", mobile: "8657588837" },
  { name: "Shree Gopinathji Honda (Karelibaug)", mobile: "9619638941" },
  { name: "Down Town Hyundai (Old Padra Road)", mobile: "9227108696" },
  { name: "Shree Gopinathji Vehicles LLP (Mahindra, Karelibagh)", mobile: "9909023193" },
  { name: "Param Wheels (Mahindra, Vadodara)", mobile: "7069060111" },
  { name: "SP Vehicles (Tata Motors, Fatehganj)", mobile: "9619224497" },
  { name: "Shreenath Kia (Chhani)", mobile: "8879881597" },
  { name: "Gopinathji Kia (Atladra)", mobile: "9167258072" },
  { name: "Stellar Skoda (Ram Wadi)", mobile: "9328841793" },
  { name: "Stellar Skoda (Atladra)", mobile: "9328883325" }
];

async function importLeads() {
  try {
    const token = getAccessToken();

    console.log("Fetching existing leads to check for duplicates...");
    const existingMobiles = await fetchAllExistingMobiles(token);
    console.log(`Found ${existingMobiles.size} unique mobile numbers in database.`);

    // Check if custom arguments were passed: node import-showroom-leads.js "Name" "Mobile"
    let leadsToImport = [];
    const args = process.argv.slice(2);
    if (args.length >= 2) {
      const name = args[0];
      const mobile = args[1];
      leadsToImport.push({ name, mobile });
    } else {
      leadsToImport = defaultShowrooms;
    }

    const filteredLeads = leadsToImport.filter(lead => {
      const isDup = existingMobiles.has(lead.mobile.trim());
      if (isDup) {
        console.log(`Skipping duplicate lead: ${lead.name} (${lead.mobile})`);
      }
      return !isDup;
    });

    if (filteredLeads.length === 0) {
      console.log("No new leads to import.");
      return;
    }

    console.log(`Importing ${filteredLeads.length} new leads...`);
    for (const lead of filteredLeads) {
      try {
        const res = await createLead(token, lead);
        console.log(`Successfully inserted: ${lead.name} (ID: ${res.name.split('/').pop()})`);
      } catch (e) {
        console.error(`Failed to insert ${lead.name}:`, e.message);
      }
    }
    console.log("Import process completed!");

  } catch (error) {
    console.error("Error during lead import:", error.message);
  }
}

importLeads();
