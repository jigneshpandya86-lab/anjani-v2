#!/bin/bash

# Cleanup Script: Remove all SMS-related Cloud Resources
# This script removes Cloud Functions and Firestore collections created during SMS feature development

PROJECT_ID="anjaniappnew"
REGION="us-central1"

echo "🧹 Starting cleanup of SMS cloud resources..."
echo "Project: $PROJECT_ID"
echo ""

# Delete Cloud Functions
echo "📦 Deleting Cloud Functions..."

echo "  → Deleting smsDeliveryWebhook..."
gcloud functions delete smsDeliveryWebhook \
  --project=$PROJECT_ID \
  --region=$REGION \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Not found or already deleted"

echo "  → Deleting processSmsJobsScheduled..."
gcloud functions delete processSmsJobsScheduled \
  --project=$PROJECT_ID \
  --region=$REGION \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Not found or already deleted"

echo "  → Deleting cleanupSmsProcessingQueue..."
gcloud functions delete cleanupSmsProcessingQueue \
  --project=$PROJECT_ID \
  --region=$REGION \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Not found or already deleted"

echo ""
echo "🗑️  Deleting Firestore Collections..."

# Delete Firestore collections
echo "  → Deleting sms_jobs collection..."
gcloud firestore databases delete-collection sms_jobs \
  --project=$PROJECT_ID \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Could not delete (use Firebase Console if needed)"

echo "  → Deleting sms_processing_queue collection..."
gcloud firestore databases delete-collection sms_processing_queue \
  --project=$PROJECT_ID \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Could not delete (use Firebase Console if needed)"

echo ""
echo "⚙️  Deleting Firestore Documents in settings collection..."

echo "  → Deleting settings/smsFeatures..."
gcloud firestore databases delete-document settings smsFeatures \
  --project=$PROJECT_ID \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Could not delete (use Firebase Console if needed)"

echo "  → Deleting settings/smsRateLimitConfig..."
gcloud firestore databases delete-document settings smsRateLimitConfig \
  --project=$PROJECT_ID \
  --quiet 2>/dev/null && echo "     ✓ Deleted" || echo "     ⚠ Could not delete (use Firebase Console if needed)"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Summary:"
echo "  • Cloud Functions: Deleted"
echo "  • Firestore collections: Deleted or use Firebase Console"
echo ""
echo "Note: If any resources still exist, delete them manually:"
echo "  1. Cloud Console: https://console.cloud.google.com/functions?project=$PROJECT_ID"
echo "  2. Firebase: https://console.firebase.google.com/project/$PROJECT_ID/firestore"
