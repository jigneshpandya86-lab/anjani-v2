const admin = require("firebase-admin");

// Initialize with the project ID from your index.js
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "anjaniappnew"
    });
}

async function checkEligibleClients() {
    try {
        const db = admin.firestore();
        const snapshot = await db.collection('customers')
            .where('outstanding', '>', 100)
            .get();

        console.log(`\nTOTAL_ELIGIBLE_CLIENTS: ${snapshot.size}`);
        
        if (snapshot.empty) {
            console.log("No clients found with outstanding > 100.");
            return;
        }

        console.log("\n--- ELIGIBLE CLIENT LIST ---");
        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.name || "N/A";
            const outstanding = data.outstanding;
            const mobile = data.mobile || data.phone || "N/A";
            console.log(`- Name: ${name.padEnd(20)} | Outstanding: ${String(outstanding).padEnd(10)} | Mobile: ${mobile}`);
        });
        console.log("----------------------------\n");

    } catch (error) {
        if (error.message.includes("Credential") || error.message.includes("app/no-credentials")) {
            console.error("ERROR: Authentication failed. This script must be run in an environment with access to the project's credentials (like Cloud Shell or with a Service Account).");
        } else {
            console.error("ERROR_QUERYING_FIRESTORE:", error.message);
        }
    }
}

checkEligibleClients();
