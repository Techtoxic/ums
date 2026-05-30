const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiters');
const { PasswordReset, AdminStaff, HOD, Trainer, Student } = require('../db/models');
const config = require('../config/config');
const EmailService = require('../utils/emailService');

// Reset lifetimes.
const OTP_TTL_MS = 10 * 60 * 1000;      // OTP code valid 10 minutes
const LINK_TTL_MS = 60 * 60 * 1000;     // email reset link valid 60 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;  // post-OTP reset session token valid 30 minutes

const ROLE_TYPES = ['student', 'trainer', 'hod', 'admin', 'finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'];

// Own email-service instance. Mirror server.js's try/catch stub so requiring
// this module can never crash on load if the constructor throws.
let emailService;
try {
    emailService = new EmailService();
} catch (err) {
    console.error('Email service failed to initialize:', err.message);
    // Create stub for build phase
    emailService = {
        sendOTPEmail: async () => console.log('Email stub: sendOTPEmail'),
        sendResetLinkEmail: async () => console.log('Email stub: sendResetLinkEmail'),
        sendPassword: async () => console.log('Email stub: sendPassword'),
        sendStudentCredentials: async () => console.log('Email stub: sendStudentCredentials')
    };
}

// Resolve a (email, userType) pair to the user + the data we email. Returns null
// when no matching active account exists. user.id is the uuid stored on the
// reset row; user_role = userType disambiguates which table to update later.
async function resolveUser(email, userType) {
    const lower = email.toLowerCase();
    if (userType === 'hod') {
        return HOD.findOne({ email: lower, isActive: true });
    }
    if (userType === 'trainer') {
        return Trainer.findOne({ email: lower, isActive: true });
    }
    if (userType === 'student') {
        return Student.findOne({ email: lower });
    }
    if (userType === 'admin') {
        return AdminStaff.findOne({ email: lower, isActive: true });
    }
    // finance / registrar / dean / ilo / deputy / cibec all live in `users`.
    return AdminStaff.findOne({ email: lower, role: userType, isActive: true });
}

// Forgot password endpoint - Initiate password reset (OTP or Token)
router.post('/auth/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email, resetMethod, userType } = req.body;

        if (!email || !resetMethod || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Email, reset method, and user type are required'
            });
        }

        if (!['otp', 'token'].includes(resetMethod)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset method. Use "otp" or "token"'
            });
        }

        if (!ROLE_TYPES.includes(userType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user type'
            });
        }

        const user = await resolveUser(email, userType);

        // Always return the same response to prevent email enumeration.
        const standardResponse = {
            success: true,
            message: `If an account with that email exists, you will receive a ${resetMethod === 'otp' ? 'verification code' : 'reset link'} shortly.`
        };

        // If user not found, still return success but don't send anything.
        if (!user) {
            return res.json(standardResponse);
        }

        // Rate limit: max 3 reset requests per 15 minutes per (email, role).
        const recentAttempts = await PasswordReset.countDocuments({
            email: email.toLowerCase(),
            userRole: userType,
            createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) }
        });
        if (recentAttempts >= 3) {
            return res.json(standardResponse); // Don't reveal rate limiting
        }

        // Invalidate any still-active reset requests for this user.
        await PasswordReset.invalidateUserResets(user.id, userType);

        // Generate the raw secret, store ONLY its hash.
        const isOtp = resetMethod === 'otp';
        const rawSecret = isOtp ? PasswordReset.generateOTP() : PasswordReset.generateResetToken();
        await PasswordReset.create({
            userId: user.id,
            userRole: userType,
            email: email.toLowerCase(),
            resetType: resetMethod,
            tokenHash: PasswordReset.hashValue(rawSecret),
            expiresAt: new Date(Date.now() + (isOtp ? OTP_TTL_MS : LINK_TTL_MS)),
        });

        // Send email. Never log recipient email, OTP value, or token.
        try {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || config.baseUrl;
            const baseUrl = `${protocol}://${host}`;

            if (isOtp) {
                await emailService.sendOTPEmail(user.email, rawSecret, user.name, userType);
            } else {
                await emailService.sendResetLinkEmail(user.email, rawSecret, user.name, userType, baseUrl);
            }
        } catch (emailError) {
            console.error('Password reset email failed to send:', emailError.message);
        }

        res.json(standardResponse);

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.'
        });
    }
});

// Verify OTP endpoint — validates the code, consumes the OTP row, and issues a
// short-lived reset_type='token' session token (hashed) for the reset step.
router.post('/auth/verify-otp', authLimiter, async (req, res) => {
    try {
        const { email, otp, userType } = req.body;

        if (!email || !otp || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Email, OTP, and user type are required'
            });
        }

        // Load the active OTP row by email+role (NOT by hash), so a wrong guess
        // can still be counted against the attempts cap.
        const resetRequest = await PasswordReset.findOtpRequest({
            email: email.toLowerCase(),
            userRole: userType,
        });

        if (!resetRequest) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Attempts cap (expiry is already enforced by findOtpRequest).
        if (!resetRequest.canAttempt()) {
            await resetRequest.markAsUsed(); // burn it so no further guesses work
            return res.status(400).json({
                success: false,
                message: 'Maximum OTP attempts exceeded. Please request a new code.'
            });
        }

        // Constant-time compare against the stored hash.
        if (!PasswordReset.compareHash(otp, resetRequest.tokenHash)) {
            await resetRequest.incrementAttempts();
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Success: consume the OTP row, then issue ONE new hashed session token.
        await resetRequest.markAsUsed();

        const sessionToken = PasswordReset.generateResetToken();
        await PasswordReset.create({
            userId: resetRequest.userId,
            userRole: userType,
            email: email.toLowerCase(),
            resetType: 'token',
            tokenHash: PasswordReset.hashValue(sessionToken),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        });

        res.json({
            success: true,
            message: 'OTP verified successfully',
            sessionToken: sessionToken
        });

    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.'
        });
    }
});

// Look up the account behind a reset row, by user_role.
async function findUserByRole(userId, userType) {
    if (userType === 'hod') return HOD.findById(userId);
    if (userType === 'trainer') return Trainer.findById(userId);
    if (userType === 'student') return Student.findById(userId);
    // admin + finance/registrar/dean/ilo/deputy/cibec all live in `users`.
    return AdminStaff.findById(userId);
}

// Reset password endpoint
router.post('/auth/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, newPassword, userType, sessionToken } = req.body;

        // Either a session token (OTP flow) or a reset token (email link).
        const resetToken = sessionToken || token;

        if (!resetToken || !newPassword || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Token, new password, and user type are required'
            });
        }

        // Strong password rules — must match what the AdminStaff routes enforce:
        // 8+ characters, uppercase, lowercase, number, special character.
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
            });
        }

        // Validate the hashed reset/session token.
        const resetRequest = await PasswordReset.findValidReset({
            token: resetToken,
            userRole: userType,
            resetType: 'token'
        });

        if (!resetRequest) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        const user = await findUserByRole(resetRequest.userId, userType);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Set the plaintext password; the Student/users facades hash it (bcrypt)
        // in their pre-save hook. No account type stores raw passwords.
        user.password = newPassword;
        await user.save();

        // Consume the token and invalidate any other active resets for this user.
        await resetRequest.markAsUsed();
        await PasswordReset.invalidateUserResets(resetRequest.userId, userType);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.'
        });
    }
});

// Validate reset token endpoint (for email links)
router.get('/auth/validate-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const type = req.query.type || req.query.userType;

        if (!token || !type) {
            return res.status(400).json({
                success: false,
                message: 'Token and user type are required'
            });
        }

        const resetRequest = await PasswordReset.findValidReset({
            token: token,
            userRole: type,
            resetType: 'token'
        });

        if (!resetRequest) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Fetch user details to return to the frontend (best-effort).
        let userData = { name: 'User', identifier: resetRequest.email };
        try {
            const user = await findUserByRole(resetRequest.userId, type);
            if (user) {
                const identifier = type === 'student'
                    ? (user.admissionNumber || resetRequest.email)
                    : type === 'admin'
                        ? (user.staffId || user.email)
                        : (user.department || user.email);
                userData = { name: user.name, identifier };
            }
        } catch (userLookupError) {
            console.error('Error looking up user details:', userLookupError.message);
        }

        res.json({
            success: true,
            message: 'Token is valid',
            email: resetRequest.email,
            userType: resetRequest.userRole,
            user: userData
        });

    } catch (error) {
        console.error('Error validating reset token:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.'
        });
    }
});

module.exports = router;
