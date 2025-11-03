# ⚡ Render Quick Start - Deploy in 10 Minutes

## ✅ Prerequisites

- [x] Code on GitHub: https://github.com/Techtoxic/ums.git
- [ ] Render account: https://render.com (sign up with GitHub)
- [ ] MongoDB Atlas account: https://mongodb.com/cloud/atlas

---

## 🚀 Step-by-Step Deployment

### STEP 1: Setup MongoDB Atlas (5 minutes)

1. **Go to:** https://mongodb.com/cloud/atlas
2. **Sign up** → Choose **M0 Free Tier**
3. **Create Database User:**
   - Username: `umsadmin`
   - Generate password (SAVE IT!)
   - Role: Atlas Admin
4. **Network Access:**
   - Add IP: `0.0.0.0/0` (Allow from anywhere)
5. **Get Connection String:**
   - Click "Connect" → "Connect your application"
   - Copy string, replace `<password>` with your password
   - Add `/university_management` before the `?`
   
   **Example:**
   ```
   mongodb+srv://umsadmin:YourPassword123@cluster0.xxxxx.mongodb.net/university_management?retryWrites=true&w=majority
   ```

**✅ SAVE THIS CONNECTION STRING!**

---

### STEP 2: Deploy to Render (5 minutes)

1. **Go to:** https://render.com
2. **Sign up** with GitHub
3. **Click:** "New +" → "Web Service"
4. **Connect Repository:** `Techtoxic/ums`
5. **Configure:**
   ```
   Name: ums-api
   Region: Oregon (or closest)
   Branch: master
   Runtime: Node
   Build Command: npm install
   Start Command: node server.js
   Plan: Free
   ```

6. **Add Environment Variables:**

Click "Advanced" and add these variables:

```env
PORT=5502
NODE_ENV=production
MONGODB_URI=mongodb+srv://umsadmin:YourPassword@cluster0.xxxxx.mongodb.net/university_management?retryWrites=true&w=majority
```

**Generate secrets** (run locally):
```bash
# For JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# For SESSION_SECRET  
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add these too:
```env
JWT_SECRET=<your-generated-secret-1>
SESSION_SECRET=<your-generated-secret-2>
API_BASE_URL=https://ums-api.onrender.com/api
CLIENT_URL=https://ums-api.onrender.com
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_LOGGING=true
LOG_LEVEL=info
```

7. **Click:** "Create Web Service"

---

### STEP 3: Wait for Deployment (3-5 minutes)

Watch the logs. You'll see:
```
==> Cloning from https://github.com/Techtoxic/ums...
==> Running build command 'npm install'...
==> Starting service...
==> Your service is live 🎉
```

**Your URL:** `https://ums-api.onrender.com`

---

### STEP 4: Update API_BASE_URL

**IMPORTANT:** After deployment, update the API URL:

1. Go to **Environment** tab
2. Edit `API_BASE_URL`
3. Change to your actual Render URL + `/api`
   ```
   https://your-actual-url.onrender.com/api
   ```
4. Click "Save Changes"
5. Service auto-redeploys (2 minutes)

---

### STEP 5: Test Your Deployment

**Admin Portal:**
```
https://ums-api.onrender.com/admin/login

Login:
Email: admin@edtti.ac.ke
Password: Admin@2025
```

**Student Portal:**
```
https://ums-api.onrender.com/student/login
```

**All Portals:**
```
/admin/login    - Admin
/student/login  - Students
/trainer/login  - Trainers
/finance/dashboard - Finance
/registrar/dashboard - Registrar
/dean/dashboard - Dean
/hod/login - HOD
```

---

## ⚡ Quick Commands

### Push Updates
```bash
git add .
git commit -m "Your changes"
git push origin master
# Render auto-deploys in 2-3 minutes!
```

### Check Logs
Visit: https://dashboard.render.com → Your Service → Logs

### Manual Deploy
Visit: https://dashboard.render.com → Your Service → Manual Deploy

### Restart Service
Visit: https://dashboard.render.com → Your Service → Settings → Restart

---

## 📊 What to Expect

**Free Tier Performance:**
- **First load** (cold start): 10-30 seconds
- **Subsequent loads**: 1-3 seconds  
- **Concurrent users**: 100-500
- **Sleeps after**: 15 minutes of inactivity

**Database:**
- **Storage**: 512 MB (free tier)
- **Good for**: Testing + 1000 records

---

## 🎯 Testing Checklist

After deployment:

- [ ] Admin login works
- [ ] Can view students
- [ ] Can view trainers
- [ ] Can add trainer
- [ ] Can view payments
- [ ] Dashboard loads properly
- [ ] All portals accessible
- [ ] No console errors
- [ ] Data persists after reload

---

## 🚨 Troubleshooting

### "Application failed to respond"
**Fix:** Check if `PORT` env variable is set to `5502`

### "Database connection failed"
**Fix:** 
1. Check MongoDB connection string
2. Verify IP whitelist includes `0.0.0.0/0`
3. URL-encode special characters in password

### "Service spins down"
**Expected!** Free tier sleeps after 15 min of inactivity.
**Solution:** Upgrade to Starter ($7/month) for always-on

### "Static files not loading"
**Fix:** Clear build cache and redeploy:
1. Go to Manual Deploy
2. Check "Clear build cache"
3. Click "Deploy"

---

## 💰 Costs

**Current (Testing):**
```
Render: $0/month (Free)
MongoDB: $0/month (Free M0)
Total: $0/month ✅
```

**When Ready (Small Production):**
```
Render Starter: $7/month (always on)
MongoDB M10: $57/month
Total: $64/month
```

**Full Production (1000+ users):**
```
DigitalOcean: $48/month (4 vCPU, 8GB)
MongoDB M20: $57/month
Total: $105/month
```

---

## 🎉 You're Live!

Your UMS is now:
- ✅ On GitHub: https://github.com/Techtoxic/ums
- ✅ Live on Render: https://ums-api.onrender.com
- ✅ Connected to MongoDB Atlas
- ✅ Accessible worldwide
- ✅ HTTPS enabled (secure)
- ✅ Auto-deploys on git push

**Share the URL and start testing!**

---

## 📚 Full Documentation

For detailed guides, see:
- **RENDER_DEPLOYMENT_GUIDE.md** - Complete Render guide
- **PRODUCTION_READINESS_SUMMARY.md** - All questions answered
- **ENVIRONMENT_SETUP_GUIDE.md** - Environment configuration

---

## 🆘 Need Help?

**Render Support:**
- Dashboard: https://dashboard.render.com
- Docs: https://render.com/docs
- Status: https://status.render.com

**MongoDB Atlas:**
- Dashboard: https://cloud.mongodb.com
- Docs: https://docs.atlas.mongodb.com

**Your Repo:**
- GitHub: https://github.com/Techtoxic/ums

---

*Quick start guide for Render deployment*
*Estimated time: 10-15 minutes*
*Cost: $0/month (free tier)*

**DEPLOY NOW!** 🚀

