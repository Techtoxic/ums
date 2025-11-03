# 🔧 Environment Configuration Guide

## Overview

We've refactored the application to use environment variables instead of hardcoded values. This makes it easy to switch between development, staging, and production environments.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install dotenv
```

### 2. Copy Environment File

```bash
# Copy the example file
cp .env.example .env

# Edit with your values
nano .env
```

### 3. Configure Your Environment

Edit `.env` with your specific values:

```env
# Server Configuration
PORT=5502
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/university_management

# API Configuration
API_BASE_URL=http://localhost:5502/api
```

### 4. Restart Server

```bash
# Development
node server.js

# Production (with PM2)
pm2 restart all
```

---

## Configuration Files

### Backend Configuration (`server.js`)

The server now uses `src/config/config.js` for all configuration:

```javascript
const config = require('./src/config/config');

// Use config values
const PORT = config.port;
mongoose.connect(config.mongodbUri);
```

### Frontend Configuration

All frontend JavaScript files now use `public/js/config.js`:

```javascript
// In your HTML files, include BEFORE other scripts:
<script src="/public/js/config.js"></script>

// Then in your JS files:
const API_BASE = window.APP_CONFIG.API_BASE_URL;
```

**Auto-detection:** Frontend automatically detects if running on:
- `localhost` → uses `http://localhost:5502/api`
- Production domain → uses `https://yourdomain.com/api`

---

## Environment Files

### `.env` (Active Configuration)
- Your current environment settings
- **NEVER commit to git!**
- Different for each environment

### `.env.example` (Template)
- Template with all available options
- Safe to commit to git
- Shows required variables

### `.gitignore`
```
.env
.env.local
.env.production
```

---

## Configuration by Environment

### Development (Local)

`.env`:
```env
PORT=5502
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/university_management
API_BASE_URL=http://localhost:5502/api
JWT_SECRET=dev-secret-key
```

### Staging/Testing

`.env.staging`:
```env
PORT=5502
NODE_ENV=staging
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ums_staging
API_BASE_URL=https://staging.yourdomain.com/api
JWT_SECRET=staging-secret-key-change-this
```

### Production

`.env.production`:
```env
PORT=5502
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ums_production
API_BASE_URL=https://yourdomain.com/api
JWT_SECRET=super-secure-production-secret
SESSION_SECRET=another-super-secure-secret
ENABLE_LOGGING=true
```

---

## How API_BASE Works

### Old Way (Hardcoded) ❌
```javascript
// In every file:
const API_BASE = 'http://localhost:5502/api';

// Had to manually change for production!
```

### New Way (Environment-Based) ✅

**Backend (`server.js`):**
```javascript
const config = require('./src/config/config');
console.log(config.apiBaseUrl); // From .env file
```

**Frontend (`adminDashboard.js`, etc.):**
```javascript
// Automatically loads from public/js/config.js
const API_BASE = window.APP_CONFIG.API_BASE_URL;

// In development: http://localhost:5502/api
// In production: https://yourdomain.com/api
```

**Frontend Auto-Detection:**
```javascript
// public/js/config.js automatically detects:
const hostname = window.location.hostname;
const isProduction = hostname !== 'localhost';

const API_BASE_URL = isProduction 
    ? `${window.location.protocol}//${window.location.host}/api`
    : 'http://localhost:5502/api';
```

---

## MongoDB Configuration

### Local Development
```env
MONGODB_URI=mongodb://localhost:27017/university_management
```

### MongoDB Atlas (Recommended for Production)
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/ums?retryWrites=true&w=majority
```

**Steps to get MongoDB Atlas URI:**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free cluster (M0)
3. Create database user
4. Whitelist IP (0.0.0.0/0 for simplicity)
5. Click "Connect" → "Connect your application"
6. Copy connection string
7. Replace `<password>` with your password

---

## Security Best Practices

### 1. Never Commit `.env` Files

`.gitignore`:
```
.env
.env.*
!.env.example
```

### 2. Use Strong Secrets in Production

```env
# ❌ BAD (Development)
JWT_SECRET=secret123

# ✅ GOOD (Production)
JWT_SECRET=8f3c9e1a7b2d4f6e8c0a2b4d6f8e0c2a4b6d8f0e2c4a6b8d0f2e4c6a8b0d2f4
```

**Generate strong secrets:**
```bash
# On Linux/Mac:
openssl rand -hex 32

# On Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Different Secrets for Each Environment

- Development: Can be simple
- Staging: Should be secure
- Production: MUST be highly secure and unique

### 4. Use Environment Variables in CI/CD

GitHub Actions example:
```yaml
env:
  MONGODB_URI: ${{ secrets.MONGODB_URI }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

---

## Switching Between Environments

### Method 1: Different `.env` Files

```bash
# Development
cp .env.development .env
npm start

# Production
cp .env.production .env
pm2 start server.js
```

### Method 2: Load Specific File

```bash
# In package.json:
"scripts": {
  "start": "node server.js",
  "start:dev": "NODE_ENV=development node server.js",
  "start:prod": "NODE_ENV=production node server.js"
}
```

### Method 3: PM2 Ecosystem File

`ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'ums-dev',
    script: './server.js',
    env: {
      NODE_ENV: 'development',
      PORT: 5502
    }
  }, {
    name: 'ums-prod',
    script: './server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 80
    }
  }]
};
```

```bash
# Start development
pm2 start ecosystem.config.js --only ums-dev

# Start production
pm2 start ecosystem.config.js --only ums-prod
```

---

## Validation

### Auto-Validation on Startup

`src/config/config.js` validates configuration:

```javascript
// Warns if missing optional variables
⚠️  Warning: Missing configuration for: SMTP_HOST

// Errors if missing required variables in production
❌ Error: Production requires: JWT_SECRET, SESSION_SECRET
```

### Manual Validation

```bash
# Check current configuration
node -e "console.log(require('./src/config/config'))"
```

---

## Troubleshooting

### Problem: "Cannot find module 'dotenv'"

```bash
# Solution:
npm install dotenv
```

### Problem: Environment variables not loading

```bash
# Check if .env exists:
ls -la | grep .env

# Check if .env is being read:
node -e "require('dotenv').config(); console.log(process.env.PORT)"
```

### Problem: API calls failing in production

1. Check `public/js/config.js` is being loaded:
```html
<!-- Must be BEFORE other scripts -->
<script src="/public/js/config.js"></script>
<script src="adminDashboard.js"></script>
```

2. Check browser console:
```javascript
console.log(window.APP_CONFIG);
// Should show current config
```

3. Verify API_BASE is correct:
```javascript
console.log(window.APP_CONFIG.API_BASE_URL);
// Development: http://localhost:5502/api
// Production: https://yourdomain.com/api
```

### Problem: MongoDB connection failing

```bash
# Test connection string:
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.on('connected', () => console.log('✅ Connected!'));
mongoose.connection.on('error', (err) => console.log('❌ Error:', err));
"
```

---

## Migration from Hardcoded Values

### Files Updated

✅ Already updated:
- `server.js` - Uses `config.port` and `config.mongodbUri`
- `src/config/config.js` - Central configuration
- `public/js/config.js` - Frontend configuration
- `src/components/admin/adminDashboard.js` - Uses `APP_CONFIG`

### Files You May Need to Update

If you have other JavaScript files with hardcoded `API_BASE`:

**Old:**
```javascript
const API_BASE = 'http://localhost:5502/api';
```

**New:**
```javascript
const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : 'http://localhost:5502/api';
```

---

## Production Deployment Checklist

### Before Deploying

- [ ] Copy `.env.example` to `.env.production`
- [ ] Update all values for production
- [ ] Generate strong secrets (JWT, SESSION)
- [ ] Use MongoDB Atlas connection string
- [ ] Set NODE_ENV=production
- [ ] Test configuration locally

### On Server

```bash
# 1. Upload files (excluding .env)
git clone your-repo
cd ums

# 2. Install dependencies
npm install --production

# 3. Create .env file
nano .env
# Paste production values

# 4. Test configuration
node -e "console.log(require('./src/config/config'))"

# 5. Start with PM2
pm2 start server.js --name ums-api
pm2 save
pm2 startup
```

### Verify Deployment

```bash
# Check if server is running
pm2 status

# Check logs
pm2 logs ums-api

# Test API
curl http://localhost:5502/api/programs
```

---

## Summary

### What Changed?

1. **Added `.env` file** for configuration
2. **Created `src/config/config.js`** for backend
3. **Created `public/js/config.js`** for frontend
4. **Updated server.js** to use config
5. **Updated JavaScript files** to use APP_CONFIG

### Benefits

✅ Easy to switch environments
✅ No hardcoded values
✅ Secure (secrets not in code)
✅ Better for team collaboration
✅ Production-ready

### What You Need to Do

1. Run `npm install dotenv`
2. Copy `.env.example` to `.env`
3. Update `.env` with your values
4. Restart server
5. Test everything works

**That's it! Your app now uses environment variables properly!** 🎉

---

## Need Help?

Common issues and solutions are in the Troubleshooting section above.

For production deployment, see: `PRODUCTION_DEPLOYMENT_GUIDE.md`

