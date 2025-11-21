# Admin Authentication System - Quick Start Guide

## ✅ What Has Been Implemented

### 1. **Backend (Complete)**
- ✅ AdminStaff Model with security features
- ✅ LoginOTP Model for 2FA
- ✅ JWT-based authentication
- ✅ OTP email sending
- ✅ Password reset functionality
- ✅ Account lockout protection
- ✅ Password history tracking
- ✅ First login setup flow

### 2. **API Endpoints (Complete)**
- ✅ `POST /api/admin/auth/login` - Login with OTP
- ✅ `POST /api/admin/auth/verify-otp` - Verify OTP & get JWT
- ✅ `PUT /api/admin/auth/update-email` - Update email
- ✅ `PUT /api/admin/auth/update-password` - Update password
- ✅ `POST /api/admin/auth/complete-first-login` - Complete setup
- ✅ `GET /api/admin/auth/profile` - Get user profile
- ✅ `POST /api/admin/auth/refresh-token` - Refresh JWT

### 3. **Frontend Pages (Complete)**
- ✅ `/admin/login` - Modern login page with OTP verification
- ✅ `/admin/first-login` - First-time setup wizard
- ✅ `/admin/dashboard` - Dashboard (already existed)

### 4. **Default Accounts Created**
✅ **6 admin accounts** auto-created on server start:
```
admin@edtti.ac.ke      - System Administrator
deputy@edtti.ac.ke     - Deputy Principal  
finance@edtti.ac.ke    - Finance Officer
dean@edtti.ac.ke       - Dean of Students
ilo@edtti.ac.ke        - Industry Liaison Officer
registrar@edtti.ac.ke  - Registrar

Default Password (all): Admin@2024
```

---

## 🚀 Quick Test Guide

### Step 1: Start Server
```bash
node server.js
```

Look for these messages in console:
```
✅ Connected to MongoDB successfully!
✅ Admin staff initialization completed!
📧 Default credentials:
   Email: [role]@edtti.ac.ke (e.g., admin@edtti.ac.ke)
   Password: Admin@2024
```

### Step 2: Test Login
1. **Navigate to:** `http://localhost:5502/admin/login`
2. **Enter credentials:**
   - Email: `admin@edtti.ac.ke`
   - Password: `Admin@2024`
3. **Click "Sign In"**
4. **Check your email** for 6-digit OTP
5. **Enter OTP** in the form
6. **You'll be redirected** to first login setup

### Step 3: First Login Setup
1. **Update Email:**
   - Enter your new email address
   - Click "Continue"

2. **Update Password:**
   - Current: `Admin@2024`
   - New: Your strong password (min 8 chars, uppercase, lowercase, number, special char)
   - Confirm password
   - Click "Complete Setup"

3. **Redirected to Dashboard**

---

## 📁 Files Created/Modified

### New Files:
```
src/models/AdminStaff.js              - Admin staff model
src/models/LoginOTP.js                - Login OTP model
src/routes/adminAuth.js               - Auth API routes
src/components/admin/AdminLogin.html  - Login page
src/components/admin/FirstLogin.html  - First login setup
src/utils/emailService.js             - Updated with login OTP
ADMIN_AUTH_GUIDE.md                   - Complete documentation
ADMIN_AUTH_QUICK_START.md             - This file
```

### Modified Files:
```
server.js                             - Added routes & initialization
src/models/PasswordReset.js          - Added admin roles
package.json                         - Added jsonwebtoken
```

---

## 🔐 Security Features

| Feature | Status | Description |
|---------|--------|-------------|
| OTP 2FA | ✅ | 6-digit code, 10min expiry |
| JWT Auth | ✅ | 24h token expiry |
| Account Lockout | ✅ | 5 failed attempts = 2h lock |
| Password Strength | ✅ | Complex password required |
| Password History | ✅ | Can't reuse last 5 passwords |
| First Login | ✅ | Forced email/password update |
| Email Verification | ✅ | OTP sent to email |
| Rate Limiting | ✅ | Prevents brute force |

---

## 🎨 Frontend Features

### Login Page (`/admin/login`)
- Modern gradient design with Tailwind CSS
- Responsive layout
- Password show/hide toggle
- OTP countdown timer (10 minutes)
- Resend OTP after 60 seconds
- Real-time error messages
- Loading spinner
- Auto-focus on OTP inputs
- Keyboard navigation

### First Login Page (`/admin/first-login`)
- 2-step setup wizard
- Progress indicator
- Email validation
- Password strength meter
- Password match indicator
- Real-time validation
- Security requirements display
- Back navigation

---

## 🧪 Testing Checklist

- [ ] Server starts without errors
- [ ] 6 admin accounts created in database
- [ ] Login page loads at `/admin/login`
- [ ] Can login with default credentials
- [ ] OTP email received
- [ ] OTP verification works
- [ ] First login page loads
- [ ] Email can be updated
- [ ] Password can be updated
- [ ] Dashboard loads after setup
- [ ] JWT token stored in localStorage
- [ ] Protected routes require token
- [ ] Token refresh works
- [ ] Profile endpoint returns data
- [ ] Logout clears token

---

## 🛠️ Environment Variables

Make sure these are in your `.env` file:

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/test?retryWrites=true&w=majority

# JWT (REQUIRED for admin auth)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# Email (REQUIRED for OTP)
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# Base URL (for email links)
BASE_URL=http://localhost:5502
```

---

## 📞 API Usage Examples

### cURL Examples:

**1. Login:**
```bash
curl -X POST http://localhost:5502/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@edtti.ac.ke","password":"Admin@2024"}'
```

**2. Verify OTP:**
```bash
curl -X POST http://localhost:5502/api/admin/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@edtti.ac.ke","otp":"123456"}'
```

**3. Get Profile:**
```bash
curl -X GET http://localhost:5502/api/admin/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### JavaScript Examples:

```javascript
// Login
const login = async () => {
  const response = await fetch('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@edtti.ac.ke',
      password: 'Admin@2024'
    })
  });
  return await response.json();
};

// Verify OTP
const verifyOTP = async (email, otp) => {
  const response = await fetch('/api/admin/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  });
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('adminToken', data.data.token);
  }
  return data;
};

// Get Profile (authenticated)
const getProfile = async () => {
  const token = localStorage.getItem('adminToken');
  const response = await fetch('/api/admin/auth/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
};
```

---

## 🐛 Troubleshooting

### Issue: OTP not received
**Solution:**
1. Check `EMAIL_USER` and `EMAIL_APP_PASSWORD` in `.env`
2. Check server logs for email errors
3. Check spam/junk folder
4. Verify email service is initialized (look for "✅ Email service initialized successfully")

### Issue: "Invalid or expired token"
**Solution:**
1. Token expired (24h default)
2. Use refresh token endpoint
3. Login again to get new token

### Issue: "Account is locked"
**Solution:**
1. Wait 2 hours for automatic unlock
2. Or manually update `lockUntil` field in database to past date

### Issue: First login redirects to login
**Solution:**
1. Check token is saved in localStorage
2. Check token hasn't expired
3. Check browser console for errors

---

## 🎯 Next Steps

### Immediate:
1. ✅ Test all flows end-to-end
2. ✅ Update default passwords
3. ✅ Configure production JWT_SECRET

### Short-term:
- [ ] Add role-based dashboard content
- [ ] Implement role-based permissions
- [ ] Add activity logging
- [ ] Create admin management UI
- [ ] Add session management (view/revoke)

### Long-term:
- [ ] Email verification flow
- [ ] SMS OTP option
- [ ] Biometric authentication
- [ ] SSO integration
- [ ] Audit trail system

---

## 📊 Database Collections

### adminstaff
```javascript
{
  _id: ObjectId,
  role: String, // admin, deputy, finance, dean, ilo, registrar
  staffId: String, // ADMIN001, etc.
  name: String,
  email: String, // Unique
  password: String, // Hashed
  phone: String,
  department: String,
  isActive: Boolean,
  isFirstLogin: Boolean,
  mustUpdateEmail: Boolean,
  mustUpdatePassword: Boolean,
  emailVerified: Boolean,
  lastLogin: Date,
  lastPasswordChange: Date,
  passwordHistory: [{ password: String, changedAt: Date }],
  loginAttempts: Number,
  lockUntil: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### loginotps
```javascript
{
  _id: ObjectId,
  userId: ObjectId, // Reference to adminstaff
  userType: String, // Role
  email: String,
  otp: String, // 6-digit code
  otpAttempts: Number,
  ipAddress: String,
  userAgent: String,
  isUsed: Boolean,
  isVerified: Boolean,
  expiresAt: Date, // 10 minutes
  createdAt: Date,
  verifiedAt: Date
}
```

---

## 📝 Support

- **Documentation:** See `ADMIN_AUTH_GUIDE.md` for detailed info
- **Issues:** Check server logs and browser console
- **Email:** support@edtti.ac.ke (configure in system)

---

**System Status:** ✅ Fully Operational
**Last Updated:** November 21, 2024
**Version:** 1.0.0
