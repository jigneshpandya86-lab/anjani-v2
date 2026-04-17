const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "anjaniappnew"
    });
}

const FOLLOW_UP_DAYS = [3, 7, 10, 15];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toDateObject(value) {
  if (!value) return null;
  const { Timestamp } = require("firebase-admin/firestore");
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDueReminderContext(lead, now = new Date()) {
  const step = Number.isInteger(lead.followUpStep) ? lead.followUpStep : 0;

  if (step >= FOLLOW_UP_DAYS.length) {
    return { shouldMarkComplete: true };
  }

  const lastSmsAt = toDateObject(lead.lastSmsAt) || toDateObject(lead.smsSentAt);
  if (!lastSmsAt) {
      return null;
  }

  const fallbackDueAt = new Date(lastSmsAt.getTime() + FOLLOW_UP_DAYS[step] * DAY_IN_MS);
  const dueAt = toDateObject(lead.nextFollowUpAt) || fallbackDueAt;
  
  if (dueAt > now) return null;

  return {
    shouldMarkComplete: false,
    reminderDay: FOLLOW_UP_DAYS[step],
    nextStep: step + 1
  };
}

async function checkFollowUps() {
    const now = new Date();
    const db = admin.firestore();

    try {
        const snap = await db
          .collection("leads")
          .where("Tag", "==", "SMS_SENT")
          .get();

        console.log(`TOTAL_LEADS_WITH_SMS_SENT: ${snap.size}`);

        let eligibleCount = 0;
        let markCompleteCount = 0;
        let upcomingCount = 0;

        console.log("\n--- ELIGIBLE FOLLOW-UP LIST ---");
        
        snap.forEach(doc => {
            const lead = doc.data();
            lead.id = doc.id;
            const mobile = lead.mobile || lead.phone || "";
            
            if (!mobile) return;

            const context = getDueReminderContext(lead, now);
            if (!context) {
                upcomingCount++;
                return;
            }

            if (context.shouldMarkComplete) {
                markCompleteCount++;
                return;
            }

            eligibleCount++;
            console.log(`- Lead: ${String(lead.name || "N/A").padEnd(20)} | Step: ${lead.followUpStep || 0} | Reminder Day: ${context.reminderDay} | Mobile: ${mobile}`);
        });

        console.log("\n--- SUMMARY ---");
        console.log(`Eligible to send today: ${eligibleCount}`);
        console.log(`To be marked complete:  ${markCompleteCount}`);
        console.log(`Waiting for next due:  ${upcomingCount}`);
        console.log("----------------\n");

    } catch (error) {
        console.error("Error:", error.message);
    }
}

checkFollowUps();
