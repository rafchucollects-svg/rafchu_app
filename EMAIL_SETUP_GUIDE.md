# Email Notification Setup Guide

This guide will help you set up email notifications for message alerts in your Rafchu TCG app.

## 📧 What's Been Built

A Cloud Function that automatically sends an email notification when a user receives a new message in the app. The email includes:
- Sender's name
- Message preview
- Direct link to view the message
- Beautiful HTML template with Rafchu TCG branding

## 🛠️ Setup Steps

### 1. Install Dependencies

First, fix the npm permission issue, then install dependencies:

```bash
# Fix npm permissions (only needed once)
sudo chown -R 501:20 "/Users/rafael.rimola/.npm"

# Install function dependencies
cd functions
npm install
cd ..
```

### 2. Set Up Gmail App Password

You need a Gmail account to send emails. Here's how to get an **App Password**:

1. Go to your **Google Account** → Security
2. Enable **2-Step Verification** (required for app passwords)
3. Search for **App passwords** or go to: https://myaccount.google.com/apppasswords
4. Create a new app password:
   - **App name**: "Rafchu TCG"
   - Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### 3. Configure Firebase Functions Environment Variables

Set your email credentials as Firebase config variables:

```bash
# Replace with your actual email and app password
firebase functions:config:set gmail.email="your-email@gmail.com" gmail.password="your-app-password"
```

**Example:**
```bash
firebase functions:config:set gmail.email="rafchucollects@gmail.com" gmail.password="abcd efgh ijkl mnop"
```

### 4. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

This will deploy the `sendMessageNotification` function to Firebase.

---

## ✅ How It Works

1. User A sends a message to User B
2. Cloud Function detects the new message
3. Function looks up User B's email from their profile
4. Beautiful email is sent to User B with:
   - Sender's name
   - Message preview
   - Link to view full conversation
5. User B clicks link → Opens Rafchu TCG directly to the conversation

---

## 📊 Testing

### Test in Firebase Console:
1. Go to Firebase Console → Functions
2. You should see `sendMessageNotification` listed
3. Send a test message in your app
4. Check Firebase Functions logs for success/errors

### Test Locally (Optional):
```bash
npm run serve
# Functions will run on localhost:5001
```

---

## 🎨 Email Template Features

The email notification includes:
- ✨ Beautiful gradient design matching Rafchu TCG branding
- 📱 Mobile-responsive layout
- 🔗 Direct deep link to the conversation
- 👤 Sender's display name
- 💬 Message preview (first 100 characters)
- 🖼️ Special handling for image messages

---

## 🔧 Customization Options

### Change Email Service (Optional)

If you want to use **SendGrid** instead of Gmail:

1. Sign up for SendGrid (free tier: 100 emails/day)
2. Get your API key
3. Update `functions/index.js`:

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(functions.config().sendgrid.key);

// Replace mailTransport.sendMail() with:
await sgMail.send(mailOptions);
```

### Disable Notifications for Specific Users

In the future, you can add a user preference:
- Add `emailNotifications: boolean` to user profiles
- Check this in the Cloud Function before sending

---

## 🚨 Important Notes

1. **Gmail Limits**: Gmail has a daily sending limit (~500 emails/day for free accounts)
2. **Spam Risk**: Make sure to include unsubscribe links if sending high volume
3. **Costs**: Cloud Functions are free for first 2M invocations/month
4. **Privacy**: Emails are only sent to users who receive messages

---

## 📈 Monitoring

Check email delivery in:
- Firebase Console → Functions → Logs
- Gmail account → Sent mail

---

## 🆘 Troubleshooting

### "Error sending message notification"
- Check Firebase Functions logs in console
- Verify Gmail app password is correct
- Ensure 2-Step Verification is enabled

### Emails going to spam
- Ask users to add `your-email@gmail.com` to contacts
- Consider using SendGrid for better deliverability

### Function not triggering
- Check Firestore rules allow the function to read conversations
- Verify the function is deployed: `firebase functions:list`

---

## 🎯 Next Steps (Optional Enhancements)

1. **Email Preferences**: Let users opt-out in settings
2. **Digest Emails**: Group multiple messages into one daily summary
3. **SMS Notifications**: Use Twilio for text message alerts
4. **Push Notifications**: Use FCM for in-app push notifications
5. **Email Templates**: Add more templates for different notification types

---

**Need help?** Check the Firebase Functions logs or test locally with the emulator!










