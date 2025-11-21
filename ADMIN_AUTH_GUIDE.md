# Admin Staff Authentication System - Complete Guide

## Overview
This authentication system provides secure login for administrative staff (Admin, Deputy, Finance, Dean, ILO, Registrar) using:
- **Two-Factor Authentication** with OTP sent via email
- **JWT tokens** for session management
- **Mandatory first-login setup** requiring email and password updates
- **Secure password policies** with history tracking

---

## Default Accounts Created

When the server starts, these accounts are automatically created:

| Role | Email | Staff ID | Password | Department |
|------|-------|----------|----------|------------|
| Administrator | admin@edtti.ac.ke | ADMIN001 | Admin@2024 | Administration |
| Deputy Principal | deputy@edtti.ac.ke | DEPUTY001 | Admin@2024 | Administration |
| Finance Officer | finance@edtti.ac.ke | FINANCE001 | Admin@2024 | Finance |
| Dean of Students | dean@edtti.ac.ke | DEAN001 | Admin@2024 | Student Affairs |
| Industry Liaison Officer | ilo@edtti.ac.ke | ILO001 | Admin@2024 | Industry Liaison |
| Registrar | registrar@edtti.ac.ke | REGISTRAR001 | Admin@2024 | Registry |

⚠️ **All users MUST update their email and password on first login!**

---

## Authentication Flow

### Step 1: Login (Send OTP)
**Endpoint:** `POST /api/admin/auth/login`

**Request Body:**
```json
{
  "email": "admin@edtti.ac.ke",
  "password": "Admin@2024"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your email",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "email": "admin@edtti.ac.ke",
    "isFirstLogin": true,
    "mustUpdateEmail": true,
    "mustUpdatePassword": true
  }
}
```

### Step 2: Verify OTP (Get JWT Token)
**Endpoint:** `POST /api/admin/auth/verify-otp`

**Request Body:**
```json
{
  "email": "admin@edtti.ac.ke",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "staffId": "ADMIN001",
      "name": "System Administrator",
      "email": "admin@edtti.ac.ke",
      "role": "admin",
      "roleDisplay": "Administrator",
      "isFirstLogin": true,
      "mustUpdateEmail": true,
      "mustUpdatePassword": true,
      "emailVerified": false
    }
  }
}
```

### Step 3: Update Email (First Login - Required)
**Endpoint:** `PUT /api/admin/auth/update-email`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Request Body:**
```json
{
  "newEmail": "john.admin@edtti.ac.ke"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email updated successfully",
  "data": {
    "email": "john.admin@edtti.ac.ke"
  }
}
```

### Step 4: Update Password (First Login - Required)
**Endpoint:** `PUT /api/admin/auth/update-password`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Request Body:**
```json
{
  "currentPassword": "Admin@2024",
  "newPassword": "MySecure@Pass123",
  "confirmPassword": "MySecure@Pass123"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)
- Cannot be the same as current password
- Cannot reuse any of the last 5 passwords

**Response:**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

### Step 5: Complete First Login Setup
**Endpoint:** `POST /api/admin/auth/complete-first-login`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "First login setup completed successfully"
}
```

---

## Protected Endpoints

### Get Profile
**Endpoint:** `GET /api/admin/auth/profile`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "staffId": "ADMIN001",
    "name": "System Administrator",
    "email": "john.admin@edtti.ac.ke",
    "phone": "+254712345678",
    "role": "admin",
    "roleDisplay": "Administrator",
    "department": "Administration",
    "isFirstLogin": false,
    "mustUpdateEmail": false,
    "mustUpdatePassword": false,
    "emailVerified": false,
    "lastLogin": "2024-11-21T13:00:00.000Z",
    "lastPasswordChange": "2024-11-21T12:30:00.000Z"
  }
}
```

### Refresh Token
**Endpoint:** `POST /api/admin/auth/refresh-token`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

## Security Features

### 1. Account Lockout
- After **5 failed login attempts**, the account is locked for **2 hours**
- Automatic unlock after lockout period

### 2. OTP Security
- OTP valid for **10 minutes**
- Maximum **5 attempts** to enter correct OTP
- New OTP invalidates previous ones

### 3. Password Security
- Passwords hashed using **bcrypt** (12 salt rounds)
- Password history tracked (last 5 passwords)
- Cannot reuse recent passwords
- Strong password requirements enforced

### 4. Session Management
- JWT tokens expire after **24 hours** (configurable)
- Token contains: userId, email, role, staffId, isFirstLogin
- Tokens can be refreshed before expiry

### 5. Rate Limiting
- Login OTP requests are tracked
- Email enumeration protection

---

## Email Templates

### Login OTP Email
- Professional design with blue gradient
- Security badge
- Login details (account type, time)
- Clear expiration warning
- Security notice for unauthorized attempts

### Password Reset Email
- Used for forgot password flow
- Separate from login OTP
- Red gradient design for urgency

---

## Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Email and password are required"
}
```

**423 Locked:**
```json
{
  "success": false,
  "message": "Account is locked due to too many failed attempts. Please try again later."
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

---

## Testing the System

### Using cURL

**1. Login:**
```bash
curl -X POST http://localhost:5502/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@edtti.ac.ke", "password": "Admin@2024"}'
```

**2. Verify OTP:**
```bash
curl -X POST http://localhost:5502/api/admin/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@edtti.ac.ke", "otp": "123456"}'
```

**3. Get Profile:**
```bash
curl -X GET http://localhost:5502/api/admin/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Using Postman

1. **Create Environment Variables:**
   - `baseUrl`: `http://localhost:5502`
   - `token`: (will be set automatically)

2. **Import Collection:**
   - Create requests for each endpoint
   - Use `{{baseUrl}}` and `{{token}}` variables

3. **Test Script (Save Token):**
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    if (jsonData.data && jsonData.data.token) {
        pm.environment.set("token", jsonData.data.token);
    }
}
```

---

## Database Models

### AdminStaff Model
- `role`: admin, deputy, finance, dean, ilo, registrar
- `staffId`: Unique staff identifier
- `name`: Full name
- `email`: Unique email (validated)
- `password`: Hashed password
- `phone`: Contact number
- `department`: Department name
- `isActive`: Account status
- `isFirstLogin`: First login flag
- `mustUpdateEmail`: Email update required
- `mustUpdatePassword`: Password update required
- `emailVerified`: Email verification status
- `lastLogin`: Last login timestamp
- `lastPasswordChange`: Password change timestamp
- `passwordHistory`: Array of previous passwords
- `loginAttempts`: Failed login counter
- `lockUntil`: Account lock expiry

### LoginOTP Model
- `userId`: Reference to admin staff
- `userType`: Role type
- `email`: User email
- `otp`: 6-digit OTP
- `otpAttempts`: Verification attempts
- `ipAddress`: Request IP
- `userAgent`: Browser info
- `isUsed`: OTP used flag
- `isVerified`: OTP verified flag
- `expiresAt`: Expiration timestamp

---

## Environment Variables Required

Add these to your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# Email Configuration (already set)
EMAIL_USER=your-gmail@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# Base URL for email links
BASE_URL=http://localhost:5502
```

---

## Frontend Integration Example

```javascript
// 1. Login
async function login(email, password) {
  const response = await fetch('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  if (data.success) {
    // Show OTP input modal
    showOTPModal(data.data.email);
  }
}

// 2. Verify OTP
async function verifyOTP(email, otp) {
  const response = await fetch('/api/admin/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  });
  
  const data = await response.json();
  if (data.success) {
    // Store token
    localStorage.setItem('authToken', data.data.token);
    
    // Check if first login
    if (data.data.user.isFirstLogin) {
      // Redirect to first login setup
      window.location.href = '/admin/first-login';
    } else {
      // Redirect to dashboard
      window.location.href = '/admin/dashboard';
    }
  }
}

// 3. Make authenticated requests
async function getProfile() {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('/api/admin/auth/profile', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}

// 4. Handle token expiry
async function makeAuthRequest(url, options = {}) {
  const token = localStorage.getItem('authToken');
  
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    // Token expired, redirect to login
    localStorage.removeItem('authToken');
    window.location.href = '/admin/login';
  }
  
  return response;
}
```

---

## Troubleshooting

### OTP Not Received
1. Check email service configuration in `.env`
2. Verify EMAIL_USER and EMAIL_APP_PASSWORD
3. Check spam/junk folder
4. Ensure email service is initialized (check server logs)

### "Invalid or expired token"
1. Token may have expired (24h default)
2. Check JWT_SECRET matches between requests
3. Use refresh token endpoint before expiry

### Account Locked
- Wait 2 hours for automatic unlock
- Or manually update `lockUntil` field in database

### Password Update Fails
- Check password meets all requirements
- Ensure not reusing recent passwords
- Verify current password is correct

---

## Next Steps

1. **Create Frontend Pages:**
   - Login page with OTP verification
   - First login setup page
   - Dashboard for each role
   - Profile management page

2. **Add Role-Based Permissions:**
   - Create middleware for role checking
   - Define permissions for each role
   - Protect routes based on roles

3. **Implement Additional Features:**
   - Password recovery flow
   - Email verification
   - Two-factor authentication toggle
   - Activity logs
   - Session management (view/revoke)

4. **Production Deployment:**
   - Change default passwords
   - Set strong JWT_SECRET
   - Enable HTTPS
   - Configure email service properly
   - Set up monitoring and logging

---

## API Endpoint Summary

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/admin/auth/login` | No | Initiate login, send OTP |
| POST | `/api/admin/auth/verify-otp` | No | Verify OTP, get JWT token |
| PUT | `/api/admin/auth/update-email` | Yes | Update email address |
| PUT | `/api/admin/auth/update-password` | Yes | Change password |
| POST | `/api/admin/auth/complete-first-login` | Yes | Complete first login setup |
| GET | `/api/admin/auth/profile` | Yes | Get user profile |
| POST | `/api/admin/auth/refresh-token` | Yes | Refresh JWT token |

---

## Security Best Practices

1. **Always use HTTPS in production**
2. **Store JWT tokens securely** (httpOnly cookies preferred over localStorage)
3. **Implement CSRF protection** for state-changing operations
4. **Log all authentication events** for audit trail
5. **Regularly rotate JWT secrets**
6. **Monitor for suspicious login patterns**
7. **Implement IP-based restrictions** for sensitive roles
8. **Add captcha** after multiple failed attempts
9. **Encrypt sensitive data** at rest
10. **Regular security audits**

---

## Support

For issues or questions:
- Check server logs for detailed error messages
- Review this documentation
- Contact IT Support: support@edtti.ac.ke

---

**Last Updated:** November 21, 2024
**Version:** 1.0.0
**Author:** UMS Development Team
