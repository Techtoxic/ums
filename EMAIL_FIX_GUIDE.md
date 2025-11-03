# 📧 Email Service Fix Guide - SMTP Timeout Issue

## 🔴 Current Issue
**Error:** `ETIMEDOUT` when connecting to Gmail SMTP on Render  
**Code:** Connection timeout after 30 seconds  
**Location:** `/api/auth/forgot-password` endpoint

## 🔍 Root Cause
Gmail SMTP connections may be blocked or restricted on Render's network infrastructure. This is common on cloud hosting platforms.

---

## ✅ Solution 1: Verify Environment Variables (IMMEDIATE)

### Check Render Dashboard Environment Variables

1. Go to your Render dashboard
2. Select your web service
3. Go to **Environment** tab
4. Verify these variables are set:

```
EMAIL_USER=your-gmail@gmail.com
EMAIL_APP_PASSWORD=your-16-digit-app-password
```

### Generate Gmail App Password

If you haven't already:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required)
3. Go to **App Passwords**: https://myaccount.google.com/apppasswords
4. Select **Mail** and **Other (Custom name)**
5. Name it "EDTTI UMS Production"
6. Copy the 16-digit password
7. Add to Render as `EMAIL_APP_PASSWORD` (no spaces)

---

## ✅ Solution 2: Try Port 465 (SSL Instead of TLS)

Port 465 might work better on Render. I've already added timeout configurations, but you can also try switching ports.

### Current Configuration (Port 587 - TLS):
```javascript
port: 587,
secure: false, // Use TLS
```

### Alternative Configuration (Port 465 - SSL):
```javascript
port: 465,
secure: true, // Use SSL
```

To switch, update `src/utils/emailService.js` line 15-16.

---

## ✅ Solution 3: Use Alternative Email Service (RECOMMENDED)

If Gmail continues to timeout, switch to a transactional email service designed for production:

### Option A: SendGrid (FREE Tier - 100 emails/day)

1. Sign up: https://signup.sendgrid.com/
2. Get API Key
3. Update environment variables:
```
SENDGRID_API_KEY=your-api-key
EMAIL_FROM=noreply@yourdomain.com
```

4. Install SendGrid:
```bash
npm install @sendgrid/mail
```

5. Update email service (I can help with this)

### Option B: AWS SES (Very Cheap)

1. Set up AWS SES
2. Verify email/domain
3. Add credentials to Render
4. No code changes needed, just update env vars

### Option C: Mailgun (FREE Tier - 5000 emails/month)

1. Sign up: https://www.mailgun.com/
2. Verify domain
3. Get SMTP credentials
4. Update Render env vars

---

## ✅ Solution 4: Verify Render IP isn't Blocked

### Check if Gmail is blocking Render's IPs:

1. Check Gmail account for security alerts
2. Look for "Blocked sign-in attempt" emails
3. If blocked, allow the device/IP
4. Try "Allow less secure apps" temporarily for testing

---

## 🔧 Changes I've Made

### 1. Added Timeout Configurations
**File:** `src/utils/emailService.js`

```javascript
connectionTimeout: 30000, // 30 seconds
greetingTimeout: 20000, // 20 seconds  
socketTimeout: 30000, // 30 seconds
pool: true, // Use connection pooling
maxConnections: 5,
maxMessages: 100
```

### 2. Added Detailed Logging
**File:** `server.js` line 3381-3430

Now logs:
- ✅ Email update request received
- ❌ Validation errors
- ✅ Success confirmation
- ❌ Student not found
- ❌ Email already in use

---

## 🧪 Testing Steps

### 1. After Render Redeploys:

Check logs in Render dashboard for:
```
✅ Email service initialized successfully
```

If you see:
```
❌ Email service initialization failed: Connection timeout
```
Then Gmail SMTP is blocked.

### 2. Test Student Email Update:

1. Login to student portal
2. Go to Profile section
3. Click "Update Email"
4. Enter new email
5. Click "Update"
6. Check Render logs for:
   - `📧 Student email update request`
   - `✅ Student email updated successfully`

### 3. Test Password Reset OTP:

1. Go to any login page
2. Click "Forgot Password"
3. Enter email
4. Select "OTP"
5. Click "Send OTP"
6. Check Render logs for email sending status

---

## 📊 Quick Diagnosis Checklist

- [ ] Environment variables set on Render (`EMAIL_USER`, `EMAIL_APP_PASSWORD`)
- [ ] Gmail App Password generated (not regular password)
- [ ] 2-Step Verification enabled on Gmail
- [ ] No "Blocked sign-in" alerts from Gmail
- [ ] Render logs show email service initialized
- [ ] Try from different network (not office/school that blocks SMTP)
- [ ] Consider switching to SendGrid/Mailgun

---

## 🚀 Recommended Path Forward

### IMMEDIATE (Today):
1. ✅ Verify Render environment variables
2. ✅ Generate proper Gmail App Password
3. ✅ Wait 2-3 minutes for Render redeploy
4. ✅ Test and check logs

### SHORT TERM (This Week):
If Gmail continues failing:
1. Switch to **SendGrid** (easiest, free tier sufficient)
2. I'll help you implement it (5 minutes of code changes)
3. Much more reliable for production

### LONG TERM (Future):
1. Set up custom domain email
2. Use AWS SES with verified domain
3. Add email queue for better performance

---

## 💡 Why This Happens

Cloud platforms like Render often restrict SMTP ports (25, 465, 587) to prevent spam. Many services either:
- Block these ports entirely
- Rate-limit connections
- Require whitelisting

**Transactional email services (SendGrid, Mailgun, SES) use HTTP/HTTPS APIs** instead of SMTP, which work reliably on any platform.

---

## 📞 Next Steps

1. Check the environment variables on Render
2. Look at the logs after this redeploys
3. Let me know what you see - I can help switch to SendGrid if needed

**Deployment Status:** Changes pushed, waiting for Render to redeploy (~2-3 minutes)

