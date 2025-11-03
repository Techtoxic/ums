# 🚀 Render Deployment Guide
## Deploy Your UMS to Render (Free Testing Environment)

---

## Why Render?

✅ **Free tier** - Perfect for testing
✅ **Auto-deploy** from GitHub
✅ **Easy setup** - 10 minutes
✅ **HTTPS included** - Free SSL
✅ **Good for 100-500 users** on free tier

**Perfect for testing before production!**

---

## Prerequisites

- [x] Code pushed to GitHub: https://github.com/Techtoxic/ums.git
- [ ] Render account (free): https://render.com
- [ ] MongoDB Atlas account (free): https://www.mongodb.com/cloud/atlas

---

## Part 1: Push to GitHub

### Step 1: Verify .gitignore

Your `.gitignore` should exclude sensitive files:
```gitignore
.env
.env.*
!.env.example
node_modules/
uploads/
*.log
```

### Step 2: Add Remote & Push

```bash
# 1. Check current status
git status

# 2. Add all files
git add .

# 3. Commit
git commit -m "Initial commit: University Management System with production docs"

# 4. Verify remote (should already be set)
git remote -v

# 5. Push to GitHub
git push -u origin main

# If branch is 'master' instead:
# git push -u origin master
```

### Step 3: Verify on GitHub

Visit: https://github.com/Techtoxic/ums.git

You should see all your files EXCEPT:
- `.env` (hidden - good!)
- `node_modules/` (excluded)
- `uploads/` (excluded)

✅ **GitHub push complete!**

---

## Part 2: Setup MongoDB Atlas (Database)

### Step 1: Create Free Cluster

1. Go to: https://www.mongodb.com/cloud/atlas
2. Click "Start Free"
3. Sign up with email
4. Choose **M0 Free tier**
   - Provider: AWS
   - Region: Closest to you
   - Cluster Name: `ums-cluster`
5. Click "Create"

### Step 2: Create Database User

1. Click "Database Access" (left sidebar)
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Username: `umsadmin`
5. Password: Generate strong password (SAVE THIS!)
6. Database User Privileges: "Atlas admin"
7. Click "Add User"

### Step 3: Whitelist All IPs (for Render)

1. Click "Network Access" (left sidebar)
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere"
4. IP Address: `0.0.0.0/0`
5. Click "Confirm"

**Note:** For production, you'd whitelist specific IPs. This is fine for testing.

### Step 4: Get Connection String

1. Click "Database" (left sidebar)
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Driver: Node.js, Version: 4.1 or later
5. Copy the connection string:
   ```
   mongodb+srv://umsadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual password
7. Add database name before the `?`:
   ```
   mongodb+srv://umsadmin:YourPassword@cluster0.xxxxx.mongodb.net/university_management?retryWrites=true&w=majority
   ```

**SAVE THIS CONNECTION STRING!** You'll need it for Render.

✅ **MongoDB Atlas setup complete!**

---

## Part 3: Deploy to Render

### Step 1: Create Render Account

1. Go to: https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub (easiest)
4. Authorize Render to access your repos

### Step 2: Create New Web Service

1. Click "New +" (top right)
2. Select "Web Service"
3. Connect your GitHub repo:
   - Click "Connect" next to `Techtoxic/ums`
   - If not visible, click "Configure account" and grant access

### Step 3: Configure Service

**Basic Settings:**
```
Name: ums-api
Region: Oregon (or closest to you)
Branch: main (or master)
Root Directory: (leave empty)
Runtime: Node
```

**Build Command:**
```bash
npm install
```

**Start Command:**
```bash
node server.js
```

### Step 4: Select Plan

**Choose:** Free
- 512 MB RAM
- Shared CPU
- Spins down after 15 min of inactivity
- Good for 100-500 users (testing)

**For Production Later:**
- Starter: $7/month - 512 MB, always on
- Standard: $25/month - 2 GB RAM

### Step 5: Add Environment Variables

Click "Advanced" → "Add Environment Variable"

Add these variables one by one:

```env
# Server
PORT=5502
NODE_ENV=production

# Database (paste your MongoDB Atlas connection string)
MONGODB_URI=mongodb+srv://umsadmin:YourPassword@cluster0.xxxxx.mongodb.net/university_management?retryWrites=true&w=majority

# API (Render will give you a URL like: ums-api.onrender.com)
API_BASE_URL=https://ums-api.onrender.com/api

# Client URL
CLIENT_URL=https://ums-api.onrender.com

# JWT & Session Secrets (generate random strings)
JWT_SECRET=your-random-secret-here-change-this-to-something-long-and-random
SESSION_SECRET=another-random-secret-here-also-long-and-random

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
ENABLE_LOGGING=true
LOG_LEVEL=info
```

**Generate Strong Secrets:**
```bash
# On your local machine, run:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output for JWT_SECRET

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output for SESSION_SECRET
```

### Step 6: Create Web Service

1. Click "Create Web Service"
2. Wait for deployment (5-10 minutes)
3. Watch the build logs

**You'll see:**
```
==> Cloning from https://github.com/Techtoxic/ums...
==> Running build command 'npm install'...
==> Deployed successfully!
```

### Step 7: Get Your URL

After deployment, Render gives you a URL like:
```
https://ums-api.onrender.com
```

**Update API_BASE_URL:**
1. Go to "Environment" tab
2. Edit `API_BASE_URL`
3. Change to: `https://your-actual-url.onrender.com/api`
4. Click "Save Changes"
5. Service will auto-redeploy

✅ **Deployment complete!**

---

## Part 4: Test Your Deployment

### Test 1: Check if Server is Running

Open browser and visit:
```
https://ums-api.onrender.com
```

**Expected:** Redirects to student login or shows homepage

### Test 2: Test API Endpoints

```bash
# Test programs endpoint
curl https://ums-api.onrender.com/api/programs

# Expected: JSON array of programs or []
```

### Test 3: Access Admin Portal

```
https://ums-api.onrender.com/admin/login
```

**Login with:**
- Email: `admin@edtti.ac.ke`
- Password: `Admin@2025`

### Test 4: Check Database Connection

Go to MongoDB Atlas:
1. Click "Database" → "Browse Collections"
2. You should see collections being created as you use the app

### Test 5: Performance Check

**First Load:** 10-30 seconds (free tier spins up)
**Subsequent Loads:** 1-3 seconds (normal)

**Note:** Free tier sleeps after 15 minutes of inactivity!

---

## Part 5: Auto-Deploy from GitHub

### Setup Auto-Deploy

Render automatically watches your GitHub repo!

**To deploy changes:**
```bash
# 1. Make changes locally
# 2. Commit
git add .
git commit -m "Your change description"

# 3. Push
git push origin main

# 4. Render auto-deploys in 2-3 minutes!
```

**Watch deployment:**
- Go to Render Dashboard
- Click on your service
- Click "Events" tab
- See live deployment logs

---

## Part 6: Troubleshooting

### Issue 1: "Application failed to respond"

**Cause:** Port mismatch

**Solution:** Render uses PORT environment variable
```javascript
// In server.js (already done!):
const PORT = process.env.PORT || 5502;
```

### Issue 2: "Database connection failed"

**Causes:**
1. Wrong connection string
2. Password has special characters (needs URL encoding)
3. IP not whitelisted

**Solution:**
```bash
# Test connection string locally:
node -e "
const mongoose = require('mongoose');
mongoose.connect('your-connection-string');
mongoose.connection.on('connected', () => console.log('✅ Connected!'));
mongoose.connection.on('error', (err) => console.log('❌ Error:', err));
"
```

**URL Encode Special Characters:**
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`
- `&` → `%26`

### Issue 3: "Service spins down (cold start)"

**Expected on Free Tier!**
- First request after 15 min: 10-30 seconds
- Subsequent requests: 1-3 seconds

**Solutions:**
1. Upgrade to Starter ($7/month) - stays always on
2. Use cron job to ping every 14 minutes (free but hacky)
3. Accept cold starts for testing

### Issue 4: "Static files not loading"

**Check:** Are routes configured?
```javascript
// In server.js (already done!):
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'admin-login.html'));
});
```

### Issue 5: "Environment variables not working"

**Check:**
1. Go to Render Dashboard → Your Service → Environment
2. Verify all variables are set
3. Click "Manual Deploy" → "Clear build cache & deploy"

---

## Part 7: Monitor Your App

### Render Dashboard

**Check:**
1. **Metrics** tab:
   - CPU usage
   - Memory usage
   - Request count

2. **Logs** tab:
   - Real-time console logs
   - Error messages
   - API requests

3. **Events** tab:
   - Deployment history
   - Build times
   - Errors

### MongoDB Atlas Dashboard

**Check:**
1. **Metrics**:
   - Connections
   - Operations/sec
   - Network traffic

2. **Database** → **Browse Collections**:
   - See your data
   - Verify records

---

## Part 8: Render vs Production

### Render Free Tier Limitations

| Feature | Free Tier | Starter ($7/mo) | Production |
|---------|-----------|-----------------|------------|
| RAM | 512 MB | 512 MB | 4-8 GB |
| CPU | Shared | Shared | Dedicated |
| Sleep | 15 min | Never | Never |
| Bandwidth | 100 GB | 100 GB | Unlimited |
| Users | 100-500 | 500-1000 | 1000+ |
| Uptime | 99% | 99.9% | 99.99% |

### When to Upgrade?

**Stay on Free if:**
- Testing only
- < 100 concurrent users
- Don't mind cold starts
- No critical deadlines

**Upgrade to Starter if:**
- 100-500 users
- Need always-on
- Public beta testing
- Can't have cold starts

**Move to DigitalOcean/AWS if:**
- 1000+ users
- Need full control
- Critical production app
- Complex infrastructure

---

## Part 9: Cost Comparison

### Render Pricing

```
Free: $0/month
- 512 MB RAM
- Sleeps after 15 min
- Perfect for testing

Starter: $7/month
- 512 MB RAM
- Always on
- 100 GB bandwidth

Standard: $25/month
- 2 GB RAM
- Always on
- 100 GB bandwidth
```

### Database Pricing (MongoDB Atlas)

```
M0 (Free): $0/month
- 512 MB storage
- Shared CPU
- Good for testing

M10: $57/month
- 10 GB storage
- 2 GB RAM
- Production-ready
```

### Total Costs

**Testing (Render Free + MongoDB Free):**
```
Server: $0
Database: $0
Total: $0/month ✅
```

**Small Production (Render Starter + MongoDB M10):**
```
Server: $7/month
Database: $57/month
Total: $64/month
```

**Full Production (DigitalOcean + MongoDB):**
```
Server: $48/month (4 vCPU, 8GB)
Database: $57/month
Total: $105/month
```

---

## Part 10: Next Steps

### Immediate (Today)

1. ✅ Push code to GitHub
2. ✅ Setup MongoDB Atlas
3. ✅ Deploy to Render
4. ✅ Test all portals
5. ✅ Share URL with team

### This Week

1. Test all features thoroughly
2. Train staff on test environment
3. Collect feedback
4. Fix any issues
5. Monitor performance

### When Ready for Production

1. Review all tests
2. Decide: Render Starter or DigitalOcean?
3. Upgrade MongoDB to M10
4. Setup custom domain
5. Configure monitoring
6. Plan launch date

---

## Part 11: Render-Specific Configuration

### Build Settings

Create `render.yaml` in root (optional but recommended):

```yaml
services:
  - type: web
    name: ums-api
    env: node
    region: oregon
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 5502
```

### Health Checks

Render automatically checks:
- URL: Your root URL
- Interval: 30 seconds
- Timeout: 10 seconds

Add health endpoint (optional):
```javascript
// In server.js:
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
```

---

## Part 12: Testing Checklist

### After Deployment, Test:

**Authentication:**
- [ ] Admin login works
- [ ] Student login works
- [ ] Trainer login works
- [ ] Finance login works
- [ ] Registrar login works
- [ ] Dean login works
- [ ] HOD login works

**Core Features:**
- [ ] View students
- [ ] Add student (test if needed)
- [ ] View trainers
- [ ] Add trainer
- [ ] View payments
- [ ] View programs
- [ ] Generate receipts
- [ ] Generate payslips

**Performance:**
- [ ] Initial load < 30 seconds (cold start)
- [ ] Subsequent loads < 3 seconds
- [ ] API responses < 500ms
- [ ] No errors in console

**Database:**
- [ ] Data persists after reload
- [ ] MongoDB Atlas shows collections
- [ ] No connection errors in logs

---

## Part 13: Share with Team

### Your Live URLs

**Admin Portal:**
```
https://ums-api.onrender.com/admin/login
Email: admin@edtti.ac.ke
Password: Admin@2025
```

**Student Portal:**
```
https://ums-api.onrender.com/student/login
```

**Trainer Portal:**
```
https://ums-api.onrender.com/trainer/login
```

**Finance Portal:**
```
https://ums-api.onrender.com/finance/dashboard
```

**All Other Portals:**
```
https://ums-api.onrender.com/{role}/login
```

---

## Part 14: Custom Domain (Optional)

### Add Your Own Domain

If you have `youruniversity.edu`:

**On Render:**
1. Go to Settings → Custom Domain
2. Add `ums.youruniversity.edu`
3. Follow DNS instructions

**On Your DNS Provider:**
1. Add CNAME record:
   - Name: `ums`
   - Value: `ums-api.onrender.com`
   - TTL: 3600

**Wait:** 10-30 minutes for DNS propagation

**Then:** Access at `https://ums.youruniversity.edu`

---

## Summary

### What You've Achieved

✅ **Code on GitHub** - Version controlled
✅ **Live on Render** - Accessible worldwide  
✅ **Free Database** - MongoDB Atlas
✅ **HTTPS Enabled** - Secure by default
✅ **Auto-Deploy** - Push to deploy
✅ **Production-Ready** - Easy to scale

### Your Stack

```
Frontend: HTML/CSS/JavaScript (Tailwind)
Backend: Node.js + Express
Database: MongoDB Atlas (Cloud)
Hosting: Render (Cloud)
Version Control: GitHub
Cost: $0/month (testing)
```

### Performance Expectations

**Render Free Tier:**
- Cold start: 10-30 seconds
- Warm requests: 1-3 seconds
- Concurrent users: 100-500
- Perfect for testing!

### When to Upgrade

**Upgrade when:**
- Need > 500 concurrent users
- Can't have cold starts
- Need better performance
- Ready for production launch

**Upgrade to:**
- Render Starter: $7/month (quick fix)
- DigitalOcean: $48/month (full control)

---

## 🎉 Congratulations!

Your University Management System is now:
- ✅ Live on the internet
- ✅ Accessible from anywhere
- ✅ Ready for testing
- ✅ Free to use
- ✅ Easy to update

**Share the URL and get feedback!**

**Next:** Test thoroughly, then plan production deployment.

---

## Quick Commands Reference

```bash
# Push changes to GitHub
git add .
git commit -m "Your changes"
git push origin main

# Render auto-deploys in 2-3 minutes!

# Check logs
# Visit: https://dashboard.render.com → Your Service → Logs

# Manual deploy
# Visit: https://dashboard.render.com → Your Service → Manual Deploy

# Restart service
# Visit: https://dashboard.render.com → Your Service → Settings → Restart Service
```

---

## Support & Resources

**Render:**
- Dashboard: https://dashboard.render.com
- Docs: https://render.com/docs
- Status: https://status.render.com

**MongoDB Atlas:**
- Dashboard: https://cloud.mongodb.com
- Docs: https://docs.atlas.mongodb.com
- Support: https://support.mongodb.com

**Your Repo:**
- GitHub: https://github.com/Techtoxic/ums

---

*Guide created: 2025-11-02*
*Deployment platform: Render*
*Cost: $0/month (Free tier)*
*Perfect for testing before production!*

**GO LIVE NOW!** 🚀

