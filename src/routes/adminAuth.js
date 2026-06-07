const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { and, eq, ne } = require('drizzle-orm');

// V2: admin auth uses dedicated Drizzle-backed service layers — no dependency
// on the V1 facade shim for users or OTPs.
const userService = require('../services/userService');
const otpService = require('../services/otpService');
const { db, schema } = require('../db');
const EmailService = require('../utils/emailService');
const config = require('../config/config');
const { setAuthCookie, setCsrfCookie, generateCsrfToken } = require('../middleware/auth');

const emailService = new EmailService();
const { users } = schema;

// SEV-C-001: strict per-IP brute-force limiter for the entire admin auth surface
// (login, OTP verification, email-change OTP, etc.). Mounted on the router so
// every current and future route under /api/admin/auth is throttled.
// skipSuccessfulRequests:true counts ONLY failed attempts so a shared campus IP
// does not lock out legitimate staff; credential-guessing (which fails) is still
// throttled. Tune via ADMIN_AUTH_RATE_LIMIT_MAX.
const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (() => { const n = parseInt(process.env.ADMIN_AUTH_RATE_LIMIT_MAX, 10); return Number.isInteger(n) && n > 0 ? n : 20; })(),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.'
    }
});
router.use(adminAuthLimiter);

// JWT secret sourced from validated config (server refuses to boot if missing)
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

// Inline replacement for V1's AdminStaff.getRoleDisplayName static.
function roleDisplayName(role) {
    const map = {
        admin:     'Administrator',
        registrar: 'Registrar',
        finance:   'Finance Officer',
        dean:      'Dean of Students',
        deputy:    'Deputy Principal',
        ilo:       'Industry Liaison Officer',
        cibec:     'CBET Officer',
        hod:       'Head of Department',
        trainer:   'Trainer',
    };
    return map[role] || role;
}

// Build a camelCase, secret-stripped response shape from a raw user row.
function publicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        staffId: row.staff_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        roleDisplay: roleDisplayName(row.role),
        department: row.department,
        isFirstLogin: row.is_first_login,
        mustUpdateEmail: row.must_update_email,
        mustUpdatePassword: row.must_update_password,
        emailVerified: row.email_verified,
        lastLogin: row.last_login,
        lastPasswordChange: row.last_password_change,
    };
}

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

        // Find any active admin-staff/HOD/trainer by email (case-insensitive).
        // V1 looked up AdminStaff only; the V2 unified users table holds every
        // role, so the lookup is by email + is_active and we let the role on
        // the returned row drive subsequent behavior.
        const staff = await userService.findActiveByEmail(email);

        if (!staff) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // SECURITY: the staff login is for back-office roles only. Trainers and
        // students have their own login flows; reject them here with the same
        // generic message so the response does not leak that the account exists.
        const STAFF_LOGIN_ROLES = new Set(['admin', 'registrar', 'finance', 'dean', 'deputy', 'ilo', 'cibec', 'hod']);
        if (!STAFF_LOGIN_ROLES.has(staff.role)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is locked
        if (userService.isLocked(staff)) {
            return res.status(423).json({
                success: false,
                message: 'Account is locked due to too many failed attempts. Please try again later.'
            });
        }

        // Verify password
        const isPasswordValid = await userService.comparePassword(staff, password);

        if (!isPasswordValid) {
            await userService.incrementLoginAttempts(staff.id);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Reset login attempts on successful password verification
        await userService.resetLoginAttempts(staff.id);

        // First-login flow removed: login always proceeds to normal OTP
        // verification with the existing credentials (no forced email/password
        // change step).

        // Invalidate any previous OTPs for this user, then issue a fresh one.
        await otpService.invalidateUserOtps(staff.id, staff.role);
        const { rawCode } = await otpService.createOtp({
            userId: staff.id,
            userRole: staff.role,
            email: staff.email,
        });

        // Send the raw code via email. Do NOT log OTPs, email addresses, or names.
        try {
            await emailService.sendLoginOTP(staff.email, rawCode, staff.name, staff.role);
        } catch (emailError) {
            console.error('Login OTP email failed to send:', emailError.message);
        }

        res.json({
            success: true,
            message: 'OTP sent to your email',
            data: {
                userId: staff.id,
                email: staff.email,
                isFirstLogin: staff.is_first_login,
                mustUpdateEmail: staff.must_update_email,
                mustUpdatePassword: staff.must_update_password
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

        const staff = await userService.findActiveByEmail(oldEmail);
        if (!staff) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Verify password
        const isPasswordValid = await userService.comparePassword(staff, password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if new email is already in use by another account.
        // Direct Drizzle query — small one-off, doesn't warrant a service function.
        const conflicts = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, newEmail.toLowerCase()), ne(users.id, staff.id)))
            .limit(1);
        if (conflicts.length) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use'
            });
        }

        // Update email (clears must_update_email, bumps token_version).
        // We also need to clear email_verified — userService.updateEmail does
        // the must_update_email + token_version part; the email_verified reset
        // is route-specific, applied via a follow-up direct write.
        const updated = await userService.updateEmail(staff.id, newEmail);
        await db
            .update(users)
            .set({ email_verified: false, updated_at: new Date() })
            .where(eq(users.id, staff.id));

        const fresh = updated || staff;

        // Invalidate prior OTPs and issue a fresh one for the new email.
        await otpService.invalidateUserOtps(fresh.id, fresh.role);
        const { rawCode } = await otpService.createOtp({
            userId: fresh.id,
            userRole: fresh.role,
            email: fresh.email,
        });

        // Send OTP to new email
        try {
            await emailService.sendLoginOTP(fresh.email, rawCode, fresh.name, fresh.role);
        } catch (emailError) {
            console.error('Email sending failed:', emailError.message);
        }

        res.json({
            success: true,
            message: 'Email updated successfully. OTP sent to your new email.',
            data: {
                userId: fresh.id,
                email: fresh.email,
                isFirstLogin: fresh.is_first_login,
                mustUpdateEmail: fresh.must_update_email,
                mustUpdatePassword: fresh.must_update_password
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

        // SEV-C-001 + SEV-H-017: hashed-compare the supplied code against the
        // most recent unconsumed, unexpired OTP for this email. Atomic attempt
        // counting and 5-strike record consumption live inside otpService.
        const result = await otpService.verifyOtp({ email, code: otp });

        if (!result.valid) {
            // Constant error message regardless of reason — don't leak whether
            // the OTP existed, expired, was capped, or was simply wrong.
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Get staff details by the user_id stored on the OTP record.
        const staff = await userService.findById(result.userId);

        if (!staff || !staff.is_active) {
            return res.status(401).json({
                success: false,
                message: 'User account not found or inactive'
            });
        }

        // Update last login
        await userService.updateLastLogin(staff.id);

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: staff.id,
                email: staff.email,
                role: staff.role,
                staffId: staff.staff_id,
                isFirstLogin: staff.is_first_login,
                tokenVersion: staff.token_version || 0 // SEV-H-013
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        setAuthCookie(res, token);
        setCsrfCookie(res, generateCsrfToken());
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token: token,
                user: publicUser(staff)
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

        // Check if email is already taken by another account
        const conflicts = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, newEmail.toLowerCase()), ne(users.id, req.user.userId)))
            .limit(1);
        if (conflicts.length) {
            return res.status(400).json({
                success: false,
                message: 'Email is already in use by another account'
            });
        }

        const staff = await userService.findById(req.user.userId);
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const updated = await userService.updateEmail(staff.id, newEmail);
        // Reset email_verified flag (the change requires re-verification).
        await db
            .update(users)
            .set({ email_verified: false, updated_at: new Date() })
            .where(eq(users.id, staff.id));

        res.json({
            success: true,
            message: 'Email updated successfully',
            data: {
                email: updated ? updated.email : newEmail.toLowerCase()
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

        const staff = await userService.findById(req.user.userId);
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await userService.comparePassword(staff, currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Check if new password is same as current
        const isSameAsCurrent = await userService.comparePassword(staff, newPassword);
        if (isSameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: 'New password cannot be the same as current password'
            });
        }

        // NOTE: V1's "last 5 passwords" history check is not available in V2
        // until a password_history column / table is added (see report).

        await userService.updatePassword(staff.id, newPassword);

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
        const staff = await userService.findById(req.user.userId);

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if email and password have been updated
        if (staff.must_update_email || staff.must_update_password) {
            return res.status(400).json({
                success: false,
                message: 'Please update your email and password before completing setup',
                data: {
                    mustUpdateEmail: staff.must_update_email,
                    mustUpdatePassword: staff.must_update_password
                }
            });
        }

        await userService.completeFirstLogin(staff.id);

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
        const staff = await userService.findById(req.user.userId);

        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: publicUser(staff)
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
        const staff = await userService.findById(req.user.userId);

        if (!staff || !staff.is_active) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
            });
        }

        // Generate new JWT token
        const token = jwt.sign(
            {
                userId: staff.id,
                email: staff.email,
                role: staff.role,
                staffId: staff.staff_id,
                isFirstLogin: staff.is_first_login,
                tokenVersion: staff.token_version || 0 // SEV-H-013
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
