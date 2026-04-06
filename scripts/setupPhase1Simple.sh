#!/bin/bash

###############################################################################
# SMS Audit Phase 1 - Automated Setup (Web Environment)
# Uses: Firebase CLI + firestore:set commands
# No service account key needed - uses firebase CLI auth
###############################################################################

set -e  # Exit on error

PROJECT_ID="anjaniappnew"

echo ""
echo "🚀 Starting Automated Phase 1 Setup"
echo ""

# Step 1: Ensure logged in
echo "📝 Step 1: Checking Firebase authentication..."
echo ""

if ! firebase projects:list --json &>/dev/null; then
  echo "  🔐 Not authenticated - opening browser for login..."
  echo ""
  firebase login --no-localhost
  echo ""
  echo "  ✅ Authenticated with Firebase"
  echo ""
fi

# Step 2: Set Firebase project
echo "⚙️  Setting project to: $PROJECT_ID"
firebase use $PROJECT_ID 2>/dev/null || firebase use --add $PROJECT_ID

echo ""
echo "📝 Step 2: Creating Firestore Configuration Documents"
echo ""

# Create settings/smsFeatures
echo "  Creating settings/smsFeatures..."

firebase firestore:set settings/smsFeatures \
  --data '{
    "enableServerSideProcessing": false,
    "enableErrorClassification": true,
    "enableRateLimiting": true,
    "enableDeliveryTracking": true,
    "updatedAt": "SERVER_TIMESTAMP"
  }' \
  --project=$PROJECT_ID

echo "  ✅ settings/smsFeatures created"

# Create settings/smsRateLimitConfig
echo "  Creating settings/smsRateLimitConfig..."

firebase firestore:set settings/smsRateLimitConfig \
  --data '{
    "enabled": true,
    "minIntervalBetweenSmsMs": 3600000,
    "updatedAt": "SERVER_TIMESTAMP"
  }' \
  --project=$PROJECT_ID

echo "  ✅ settings/smsRateLimitConfig created"
echo ""

# Step 3: Verify
echo "🔍 Verification: Checking documents..."
echo ""

echo "  settings/smsFeatures:"
firebase firestore:get settings/smsFeatures --project=$PROJECT_ID 2>/dev/null || echo "    (checking...)"

echo ""
echo "  settings/smsRateLimitConfig:"
firebase firestore:get settings/smsRateLimitConfig --project=$PROJECT_ID 2>/dev/null || echo "    (checking...)"

echo ""
echo "✅ Phase 1: Foundation Setup COMPLETE!"
echo ""
echo "📋 Next Steps:"
echo "  1. Deploy Cloud Functions:"
echo "     firebase deploy --only functions"
echo ""
echo "  2. Run tests:"
echo "     npm test"
echo ""
echo "  3. Verify in Firebase Console:"
echo "     Go to: https://console.firebase.google.com"
echo "     Select: anjaniappnew project"
echo "     Go to: Firestore Database"
echo "     Check: settings collection has 2 documents"
echo ""
