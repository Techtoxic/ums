const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const AdminStaff = require('../models/AdminStaff');
const LoginOTP = require('../models/LoginOTP');
const EmailService = require('../utils/emailService');
const config = require('../config/config');
const { signToken } = require('../middleware/auth');

const emailService = new EmailService();

// SEV-C-001: strict per-IP rate limiter for the entire admin auth surface
// (login, OTP verification, email-change OTP, etc.). Mounted on the router so
// every current and future route under /api/admin/auth is throttled.
const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                 // TEMP: raised from 10 for demo. Revert after.
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.'
    }
});
router.use(adminAuthLimiter);

// JWT secret sourced from validated config (server refuses to boot if missing)
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'No token provided' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired token' 
        });
    }
};

// ===============================
// STEP 1: LOGIN - Send OTP
// ===============================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        // Find admin staff
        // SEV-H-018: password/passwordHistory are select:false; load them for
        // comparePassword and the login-attempt lockout helpers.
        const staff = await AdminStaff.findOne({
            email: email.toLowerCase(),
            isActive: true
        }).select('+password +passwordHistory');
        
        if (!staff) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check if account is locked
        if (staff.isLocked) {
            return res.status(423).json({ 
                success: false, 
                message: 'Account is locked due to too many failed attempts. Please try again later.' 
            });
        }
        
        // Verify password
        const isPasswordValid = await staff.comparePassword(password);
        
        if (!isPasswordValid) {
            await staff.incLoginAttempts();
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Reset login attempts on successful password verification
        await staff.resetLoginAttempts();
        
        // If first login and must update email, don't send OTP yet
        if (staff.isFirstLogin && staff.mustUpdateEmail) {
            return res.json({
                success: true,
                message: 'Credentials verified. Please update your email to continue.',
                requiresEmailUpdate: true,
                data: {
                    userId: staff._id,
                    email: staff.email,
                    isFirstLogin: staff.isFirstLogin,
                    mustUpdateEmail: staff.mustUpdateEmail,
                    mustUpdatePassword: staff.mustUpdatePassword
                }
            });
        }
        
        // Invalidate any previous OTPs for this user
        await LoginOTP.invalidateUserOTPs(staff._id, staff.role);
        
        // Generate OTP
        const otp = LoginOTP.generateOTP();
        
        // Create OTP record
        const loginOTP = new LoginOTP({
            userId: staff._id,
            userType: staff.role,
            email: staff.email,
            otp: otp,
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown'
        });
        
        await loginOTP.save();
        
        // Send OTP via email. Do NOT log OTPs, email addresses, or names.
        try {
            await emailService.sendLoginOTP(staff.email, otp, staff.name, staff.role);
        } catch (emailError) {
            // Log only that sending failed - never log the OTP or recipient
            console.error('Login OTP email failed to send:', emailError.message);
        }
        
        res.json({
            success: true,
            message: 'OTP sent to your email',
            data: {
                userId: staff._id,
                email: staff.email,
                isFirstLogin: staff.isFirstLogin,
                mustUpdateEmail: staff.mustUpdateEmail,
                mustUpdatePassword: staff.mustUpdatePassword
            }
        });
        
    } catch (error) {
        console.error('Error in admin login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred during login' 
        });
    }
});

// ===============================
// UPDATE EMAIL AND SEND OTP (for first-time login)
// ===============================
router.post('/update-email-send-otp', async (req, res) => {
    try {
        const { oldEmail, password, newEmail } = req.body;
        
        if (!oldEmail || !password || !newEmail) {
            return res.status(400).json({ 
                success: false, 
                message: 'Old email, password, and new email are required' 
            });
        }
        
        // Validate new email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        // Find staff by old email
        // SEV-H-018: load select:false password for comparePassword and the
        // subsequent staff.save() (required-field validation).
        const staff = await AdminStaff.findOne({
            email: oldEmail.toLowerCase(),
            isActive: true
        }).select('+password');
        
        if (!staff) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Verify password
        const isPasswordValid = await staff.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Check if new email is already in use
        const existingStaff = await AdminStaff.findOne({ 
            email: newEmail.toLowerCase(),
            _id: { $ne: staff._id }
        });
        
        if (existingStaff) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already in use' 
            });
        }
        
        // Update email
        staff.email = newEmail.toLowerCase();
        staff.mustUpdateEmail = false;
        staff.emailVerified = false; // Will be verified after OTP
        await staff.save();
        
        // Invalidate any previous OTPs
        await LoginOTP.invalidateUserOTPs(staff._id, staff.role);
        
        // Generate OTP
        const otp = LoginOTP.generateOTP();
        
        // Create OTP record with new email
        const loginOTP = new LoginOTP({
            userId: staff._id,
            userType: staff.role,
            email: staff.email,
            otp: otp,
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown'
        });
        
        await loginOTP.save();
        
        // Send OTP to new email
        try {
            await emailService.sendLoginOTP(staff.email, otp, staff.name, staff.role);
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Continue even if email fails
        }
        
        res.json({
            success: true,
            message: 'Email updated successfully. OTP sent to your new email.',
            data: {
                userId: staff._id,
                email: staff.email,
                isFirstLogin: staff.isFirstLogin,
                mustUpdateEmail: staff.mustUpdateEmail,
                mustUpdatePassword: staff.mustUpdatePassword
            }
        });
        
    } catch (error) {
        console.error('Error updating email and sending OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred' 
        });
    }
});

// ===============================
// STEP 2: VERIFY OTP - Get JWT
// ===============================
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        if (!email || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and OTP are required' 
            });
        }
        
        // SEV-C-001: Look up the OTP by email ONLY (most recent unconsumed,
        // unexpired record). Never query by the supplied OTP value, otherwise a
        // wrong guess simply returns null and the attempt is never counted.
        const loginOTP = await LoginOTP.findOne({
            email: email.toLowerCase(),
            isUsed: false,
            isVerified: false,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        if (!loginOTP) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // If the attempt cap is already reached (or the record is locked/used),
        // consume it so no further guesses - correct or not - can succeed.
        if (!loginOTP.canAttempt()) {
            if (!loginOTP.isUsed) {
                loginOTP.isUsed = true;
                await loginOTP.save();
            }
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Compare the supplied OTP against the stored hash (SEV-H-017). On
        // mismatch, atomically count the failed attempt and lock the record
        // once the 5-attempt cap is hit.
        if (!loginOTP.verifyOtp(String(otp).trim())) {
            await loginOTP.incrementAttempts();
            if (loginOTP.otpAttempts >= 5) {
                loginOTP.isUsed = true;
                await loginOTP.save();
            }
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Get staff details
        // SEV-H-018: load select:false password so updateLastLogin().save()
        // passes required-field validation.
        const staff = await AdminStaff.findById(loginOTP.userId).select('+password');

        if (!staff || !staff.isActive) {
            return res.status(401).json({ 
                success: false, 
                message: 'User account not found or inactive' 
            });
        }
        
        // Mark OTP as verified
        await loginOTP.markAsVerified();
        
        // Update last login
        await staff.updateLastLogin();
        
        // Generate JWT token
        const token = jwt.sign(
            {
                userId: staff._id,
                email: staff.email,
                role: staff.role,
                staffId: staff.staffId,
                isFirstLogin: staff.isFirstLogin,
                tokenVersion: staff.tokenVersion || 0 // SEV-H-013
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token: token,
                user: {
                    id: staff._id,
                    staffId: staff.staffId,
                    name: staff.name,
                    email: staff.email,
                    role: staff.role,
                    roleDisplay: AdminStaff.getRoleDisplayName(staff.role),
                    isFirstLogin: staff.isFirstLogin,
                    mustUpdateEmail: staff.mustUpdateEmail,
                    mustUpdatePassword: staff.mustUpdatePassword,
                    emailVerified: staff.emailVerified
                }
            }
        });
        
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred during OTP verification' 
        });
    }
});

// ===============================
// UPDATE EMAIL
// ===============================
router.put('/update-email', verifyToken, async (req, res) => {
    try {
        const { newEmail } = req.body;
        
        if (!newEmail) {
            return res.status(400).json({ 
                success: false, 
                message: 'New email is required' 
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        // Check if email is already taken
        const existingStaff = await AdminStaff.findOne({ 
            email: newEmail.toLowerCase(),
            _id: { $ne: req.user.userId }
        });
        
        if (existingStaff) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is already in use by another account' 
            });
        }
        
        // Update email
        // SEV-H-018: load select:false password so staff.save() passes
        // required-field validation; the email change bumps tokenVersion.
        const staff = await AdminStaff.findById(req.user.userId).select('+password');

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        staff.email = newEmail.toLowerCase();
        staff.mustUpdateEmail = false;
        staff.emailVerified = false; // Will need to verify new email
        await staff.save();
        
        res.json({
            success: true,
            message: 'Email updated successfully',
            data: {
                email: staff.email
            }
        });
        
    } catch (error) {
        console.error('Error updating email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while updating email' 
        });
    }
});

// ===============================
// UPDATE PASSWORD
// ===============================
router.put('/update-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Current password, new password, and confirmation are required' 
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'New passwords do not match' 
            });
        }
        
        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 8 characters long' 
            });
        }
        
        // Password strength validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' 
            });
        }
        
        // Get staff
        // SEV-H-018: password & passwordHistory are select:false; load both so
        // comparePassword, isPasswordReused and the history push all work.
        const staff = await AdminStaff.findById(req.user.userId).select('+password +passwordHistory');

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'User not found' 
            });
        }
        
        // Verify current password
        const isCurrentPasswordValid = await staff.comparePassword(currentPassword);
        
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Current password is incorrect' 
            });
        }
        
        // Check if new password is same as current
        const isSameAsCurrent = await staff.comparePassword(newPassword);
        if (isSameAsCurrent) {
            return res.status(400).json({ 
                success: false, 
                message: 'New password cannot be the same as current password' 
            });
        }
        
        // Check password history (prevent reuse of last 5 passwords)
        const isReused = await staff.isPasswordReused(newPassword);
        if (isReused) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot reuse any of your last 5 passwords' 
            });
        }
        
        // Add current password to history before updating
        if (!staff.passwordHistory) {
            staff.passwordHistory = [];
        }
        staff.passwordHistory.push({
            password: staff.password, // Already hashed
            changedAt: new Date()
        });
        
        // Keep only last 5 passwords in history
        if (staff.passwordHistory.length > 5) {
            staff.passwordHistory = staff.passwordHistory.slice(-5);
        }
        
        // Update password
        staff.password = newPassword;
        staff.mustUpdatePassword = false;
        await staff.save();
        
        res.json({
            success: true,
            message: 'Password updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while updating password' 
        });
    }
});

// ===============================
// COMPLETE FIRST LOGIN SETUP
// ===============================
router.post('/complete-first-login', verifyToken, async (req, res) => {
    try {
        // SEV-H-018: load select:false password so completeFirstLogin()'s
        // save() passes required-field validation.
        const staff = await AdminStaff.findById(req.user.userId).select('+password');

        if (!staff) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Check if email and password have been updated
        if (staff.mustUpdateEmail || staff.mustUpdatePassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please update your email and password before completing setup',
                data: {
                    mustUpdateEmail: staff.mustUpdateEmail,
                    mustUpdatePassword: staff.mustUpdatePassword
                }
            });
        }
        
        await staff.completeFirstLogin();
        
        res.json({
            success: true,
            message: 'First login setup completed successfully'
        });
        
    } catch (error) {
        console.error('Error completing first login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred' 
        });
    }
});

// ===============================
// GET PROFILE
// ===============================
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const staff = await AdminStaff.findById(req.user.userId)
            .select('-password -passwordHistory');
        
        if (!staff) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            data: {
                id: staff._id,
                staffId: staff.staffId,
                name: staff.name,
                email: staff.email,
                phone: staff.phone,
                role: staff.role,
                roleDisplay: AdminStaff.getRoleDisplayName(staff.role),
                department: staff.department,
                isFirstLogin: staff.isFirstLogin,
                mustUpdateEmail: staff.mustUpdateEmail,
                mustUpdatePassword: staff.mustUpdatePassword,
                emailVerified: staff.emailVerified,
                lastLogin: staff.lastLogin,
                lastPasswordChange: staff.lastPasswordChange
            }
        });
        
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred' 
        });
    }
});

// ===============================
// REFRESH TOKEN
// ===============================
router.post('/refresh-token', verifyToken, async (req, res) => {
    try {
        const staff = await AdminStaff.findById(req.user.userId);
        
        if (!staff || !staff.isActive) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found or inactive' 
            });
        }
        
        // Generate new JWT token
        const token = jwt.sign(
            {
                userId: staff._id,
                email: staff.email,
                role: staff.role,
                staffId: staff.staffId,
                isFirstLogin: staff.isFirstLogin,
                tokenVersion: staff.tokenVersion || 0 // SEV-H-013
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            success: true,
            data: {
                token: token
            }
        });
        
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred' 
        });
    }
});

module.exports = router;
