# 🚀 Vercel Deployment Guide - UMS

Complete guide to deploy the University Management System to Vercel.

---

## 📋 Prerequisites

1. **Vercel Account** - Sign up at https://vercel.com
2. **Vercel CLI** - Install globally
3. **MongoDB Atlas** - Cloud database (already configured)
4. **Email Service** - Gmail or other SMTP provider

---

## 🔧 Step 1: Install Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Verify installation
vercel --version
```

---

## 🔑 Step 2: Prepare Environment Variables

You'll need to add these environment variables in Vercel dashboard:

### Required Environment Variables:

```
MONGODB_URI=mongodb+srv://your-connection-string
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
BASE_URL=https://your-vercel-app.vercel.app
NODE_ENV=production
PORT=5502
```

### Get Your Current Values:

Check your `.env` file for current values, or use these defaults:
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: Generate a secure random string (min 32 characters)
- `EMAIL_USER`: Gmail address for sending emails
- `EMAIL_APP_PASSWORD`: Gmail App Password (not regular password)
- `BASE_URL`: Will be your Vercel URL (update after deployment)

---

## 🚀 Step 3: Deploy to Vercel

### Option A: Deploy via Vercel CLI (Recommended)

```bash
# Login to Vercel (opens browser)
vercel login

# Navigate to project directory
cd "c:\Users\okmom\Downloads\New folder (4)\Ums"

# Deploy to preview (test deployment)
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Select your account
# - Link to existing project? No (first time)
# - Project name? ums (or your preferred name)
# - Directory? ./ (current directory)
# - Override settings? No

# After successful preview deployment, deploy to production
vercel --prod
```

### Option B: Deploy via GitHub (Alternative)

```bash
# Push code to GitHub (already done)
git push origin master

# Then:
# 1. Go to https://vercel.com/dashboard
# 2. Click "Add New Project"
# 3. Import from GitHub: okmomnyi/ums
# 4. Configure environment variables (see Step 4)
# 5. Click "Deploy"
```

---

## ⚙️ Step 4: Configure Environment Variables in Vercel

### Via Vercel Dashboard:

1. Go to: https://vercel.com/dashboard
2. Select your project (ums)
3. Go to **Settings** → **Environment Variables**
4. Add each variable:

```
Name: MONGODB_URI
Value: mongodb+srv://...
Environment: Production, Preview, Development

Name: JWT_SECRET
Value: your-secret-key
Environment: Production, Preview, Development

Name: EMAIL_USER
Value: your-email@gmail.com
Environment: Production, Preview, Development

Name: EMAIL_APP_PASSWORD
Value: your-app-password
Environment: Production, Preview, Development

Name: BASE_URL
Value: https://your-app.vercel.app
Environment: Production

Name: NODE_ENV
Value: production
Environment: Production
```

### Via Vercel CLI:

```bash
# Add environment variables via CLI
vercel env add MONGODB_URI
# Paste your MongoDB connection string

vercel env add JWT_SECRET
# Paste your JWT secret

vercel env add EMAIL_USER
# Paste your email

vercel env add EMAIL_APP_PASSWORD
# Paste your app password

vercel env add BASE_URL
# Paste your Vercel URL

vercel env add NODE_ENV
# Type: production
```

---

## 🔄 Step 5: Redeploy with Environment Variables

After adding environment variables, redeploy:

```bash
vercel --prod
```

---

## 🌐 Step 6: Update BASE_URL

After deployment, you'll get a URL like: `https://ums-abc123.vercel.app`

Update the `BASE_URL` environment variable:

```bash
# Via CLI
vercel env rm BASE_URL production
vercel env add BASE_URL production
# Enter: https://your-actual-vercel-url.vercel.app

# Or update via dashboard
```

Then redeploy:

```bash
vercel --prod
```

---

## ✅ Step 7: Test Your Deployment

### Test URLs:

```
Main App: https://your-app.vercel.app
Admin Login: https://your-app.vercel.app/admin/login
Student Portal: https://your-app.vercel.app/student/login
Finance Portal: https://your-app.vercel.app/finance/dashboard
```

### Test Admin Login:

1. Go to: `https://your-app.vercel.app/admin/login`
2. Login with: `admin@edtti.ac.ke` / `Admin@2024`
3. Update email to your real email
4. Verify OTP
5. Set new password
6. Access dashboard

---

## 📊 Step 8: Monitor Your Deployment

### View Logs:

```bash
# Real-time logs
vercel logs

# Follow logs
vercel logs --follow

# View specific deployment
vercel logs [deployment-url]
```

### Vercel Dashboard:

- Go to: https://vercel.com/dashboard
- Select your project
- View: Analytics, Logs, Deployments

---

## 🔧 Common Commands

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View deployment list
vercel ls

# View project info
vercel inspect

# Remove a deployment
vercel rm [deployment-url]

# View domains
vercel domains ls

# Add custom domain
vercel domains add your-domain.com

# View environment variables
vercel env ls

# Pull environment variables locally
vercel env pull
```

---

## 🛠️ Troubleshooting

### Issue: Deployment fails

```bash
# Check logs
vercel logs --follow

# Try redeploying
vercel --prod --force
```

### Issue: Database connection fails

- Check MongoDB Atlas IP whitelist (allow 0.0.0.0/0 for Vercel)
- Verify MONGODB_URI environment variable
- Check MongoDB Atlas credentials

### Issue: Email not sending

- Verify EMAIL_USER and EMAIL_APP_PASSWORD
- Check Gmail settings allow less secure apps
- Use Gmail App Password (not regular password)

### Issue: 404 errors

- Check vercel.json routes configuration
- Ensure all static files are included
- Redeploy: `vercel --prod --force`

---

## 🔐 Security Checklist

- ✅ All environment variables set in Vercel
- ✅ `.env` file in .gitignore (not pushed to GitHub)
- ✅ JWT_SECRET is strong and unique
- ✅ MongoDB connection string has strong password
- ✅ Gmail App Password is used (not regular password)
- ✅ CORS configured for your domain
- ✅ BASE_URL points to your Vercel domain

---

## 📞 Need Help?

- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- MongoDB Atlas Docs: https://docs.atlas.mongodb.com

---

## 🎉 Success!

Your UMS application is now live on Vercel! 🚀

**Production URL:** `https://your-app.vercel.app`

**Admin Login:** `https://your-app.vercel.app/admin/login`
