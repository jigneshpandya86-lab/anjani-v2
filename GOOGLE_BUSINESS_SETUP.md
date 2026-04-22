# Google Business Profile Integration Setup Guide

## Overview
This guide explains how to set up the Google Business Profile automation feature for weekly marketing posts.

## Architecture
The system works in two phases:
1. **Generation (Automated)**: Every Monday at 8 AM UTC, a Cloud Function generates an AI-powered marketing post
2. **Approval (Manual)**: A dashboard component allows you to review, edit, regenerate, or post the content to your Google Business Profile

## Required Setup Steps

### 1. Google Cloud Project Configuration
Your Google Cloud Project (`anjaniappnew`) already has the necessary APIs enabled through Firebase. However, you need to enable the Google My Business API:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project `anjaniappnew`
3. Search for "My Business API" and enable it
4. Create a service account if not already done:
   - Go to Service Accounts (under IAM & Admin)
   - Click "Create Service Account"
   - Grant it role: "Google My Business Manager"
   - Create a JSON key and download it

### 2. Set Cloud Functions Environment Variables

In the Firebase Console:

1. Go to **Firebase Console** → **Project Settings** → **Service Account** 
2. Generate a new private key (if not already done)
3. Go to **Cloud Functions**
4. Edit `generateWeeklyGoogleBusinessPost` function → **Runtime Settings** → **Environment Variables**
   - Add `GOOGLE_BUSINESS_ACCOUNT_ID` = Your Google Business Account ID (numeric, e.g., `123456789`)
   - Add `GOOGLE_BUSINESS_LOCATION_ID` = Your location ID (numeric, e.g., `987654321`)

### 3. Find Your Google Business Account & Location IDs

To find these IDs:

1. Go to [Google My Business](https://mybusiness.google.com/)
2. Log in with your business Google account
3. Select your business location
4. In the URL: `https://mybusiness.google.com/manage/###########/`
   - The number after `/manage/` is your `ACCOUNT_ID`
5. Click on your business location and look for the Location ID in the URL or API

Alternatively, use the Google My Business API to list your accounts:
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://mybusiness.googleapis.com/v4/accounts"
```

### 4. Authentication
The Firebase Admin SDK (already configured in Cloud Functions) will use the service account for OAuth authentication. Make sure:
- The service account has access to manage your Google My Business account
- The service account email is added as an admin to your Google My Business account

## How It Works

### Generated Post Example
The system generates marketing posts that rotate through 5 types:
- **Service Highlight**: Features service quality and reliability
- **Customer Benefit**: Highlights convenience and benefits
- **Promotion**: Features special offers and deals
- **Sustainability**: Emphasizes eco-friendly practices
- **Call to Action**: Encourages customers to order

### Dashboard Features
Access the dashboard via: Menu → Google Business Posts (for admin users only)

**Pending Posts Tab:**
- Shows AI-generated posts waiting for approval
- View keywords and hashtags included for SEO
- Copy post text to clipboard
- **Approve & Post**: Publishes immediately to Google Business Profile
- **Regenerate**: Deletes current post (new one generates next Monday)
- **Discard**: Marks post as skipped

**Posted Posts Tab:**
- Shows history of all published posts
- Timestamps for each post
- Read-only view

### Monitoring

Monitor Cloud Function execution in Firebase Console:
1. Go to **Cloud Functions**
2. Click on `generateWeeklyGoogleBusinessPost`
3. View **Logs** tab for execution history
4. Check for any errors

### Troubleshooting

**"Missing Google Business account or location ID" error:**
- Verify `GOOGLE_BUSINESS_ACCOUNT_ID` and `GOOGLE_BUSINESS_LOCATION_ID` are set correctly
- Make sure they're numeric values

**"Failed to authenticate with Google Business API" error:**
- Check service account has "Google My Business Manager" role
- Verify service account email is added to your Google My Business account as admin

**Post not generating:**
- Check Cloud Logs for function errors
- Verify Cloud Functions have network access
- Check function timeout (default 60 seconds)

**Post not appearing in Google My Business:**
- Check the `googleBusinessPosts` Firestore collection for error messages
- Review Cloud Logs for API response errors
- Verify your business location ID is correct

## Firestore Collections

The system creates a new Firestore collection: `googleBusinessPosts`

Each document contains:
```
{
  summary: string (the post text),
  marketingType: string (service|benefit|promotion|sustainability|action),
  keywords: array (SEO keywords),
  hashtags: array (marketing hashtags),
  status: string (pending|posted|skipped|failed),
  createdAt: timestamp,
  approvedAt: timestamp,
  postedAt: timestamp,
  postId: string (Google API response ID),
  error: string (error message if failed)
}
```

## Cost Considerations

- **Cloud Functions**: 1 invocation/week (~$0.0000004 per invocation)
- **Vertex AI**: ~2,000 tokens per generation (~$0.0008 per generation)
- **Firestore**: Minimal reads/writes (~$0 per month at this scale)

Estimated monthly cost: **< $1**

## Next Steps

1. Complete steps 1-4 above
2. Deploy the updated code to Firebase
3. Access the dashboard: Menu → Google Business Posts
4. Verify first post generates next Monday at 8 AM UTC
5. Test approval workflow
6. Monitor Cloud Logs for any errors

## Support

For issues with Google API integration, refer to:
- [Google My Business API Documentation](https://developers.google.com/my-business/content/get-started)
- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
