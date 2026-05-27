const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiters');
const { PasswordReset, AdminStaff, HOD, Trainer, Student } = require('../db/models');
const config = require('../config/config');
const EmailService = require('../utils/emailService');

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

        if (!['student', 'trainer', 'hod', 'admin', 'finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'].includes(userType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user type'
            });
        }

        // Find user based on type
        let user = null;
        let userData = null;

        if (userType === 'admin') {
            user = await AdminStaff.findOne({ email: email.toLowerCase(), isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department || 'Administration'
                };
            }
        } else if (userType === 'hod') {
            user = await HOD.findOne({ email: email.toLowerCase(), isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department
                };
            }
        } else if (userType === 'trainer') {
            user = await Trainer.findOne({ email: email.toLowerCase(), isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department
                };
            }
        } else if (userType === 'student') {
            user = await Student.findOne({ email: email.toLowerCase() });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    admissionNumber: user.admissionNumber
                };
            }
        } else if (['finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'].includes(userType)) {
            user = await AdminStaff.findOne({ email: email.toLowerCase(), role: userType, isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department || userType
                };
            }
        }

        // Always return the same response to prevent email enumeration
        const standardResponse = {
            success: true,
            message: `If an account with that email exists, you will receive a ${resetMethod === 'otp' ? 'verification code' : 'reset link'} shortly.`
        };

        // If user not found, still return success but don't send email
        if (!user) {
            return res.json(standardResponse);
        }

        // Check rate limiting - max 3 attempts per 15 minutes per email
        const recentAttempts = await PasswordReset.countDocuments({
            email: email.toLowerCase(),
            userType: userType,
            createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) }
        });

        if (recentAttempts >= 3) {
            return res.json(standardResponse); // Don't reveal rate limiting
        }

        // Invalidate any existing reset requests for this user
        await PasswordReset.invalidateUserResets(userData.userId, userType);

        // Create new reset request
        const resetData = {
            userId: userData.userId,
            userType: userType,
            email: email.toLowerCase(),
            resetType: resetMethod,
            ipAddress: req.ip || (req.socket && req.socket.remoteAddress) || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown'
        };

        if (resetMethod === 'otp') {
            resetData.otp = PasswordReset.generateOTP();
        } else {
            resetData.resetToken = PasswordReset.generateResetToken();
        }

        const passwordReset = new PasswordReset(resetData);
        await passwordReset.save();

        // Send email. Do not log recipient email, OTP value, or token.
        try {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || config.baseUrl;
            const baseUrl = `${protocol}://${host}`;

            if (resetMethod === 'otp') {
                await emailService.sendOTPEmail(userData.email, resetData.otp, userData.name, userType);
            } else {
                await emailService.sendResetLinkEmail(userData.email, resetData.resetToken, userData.name, userType, baseUrl);
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

// Verify OTP endpoint
router.post('/auth/verify-otp', authLimiter, async (req, res) => {
    try {
        const { email, otp, userType } = req.body;

        if (!email || !otp || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Email, OTP, and user type are required'
            });
        }

        // Find valid OTP reset request
        const resetRequest = await PasswordReset.findValidReset({
            email: email.toLowerCase(),
            userType: userType,
            resetType: 'otp',
            otp: otp
        });

        if (!resetRequest) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        if (!resetRequest.canAttempt()) {
            return res.status(400).json({
                success: false,
                message: 'Maximum OTP attempts exceeded or OTP expired'
            });
        }

        // Generate session token for password reset
        const sessionToken = PasswordReset.generateResetToken();

        // Create a session token entry (reuse the same document)
        resetRequest.resetToken = sessionToken;
        resetRequest.isUsed = true; // Mark OTP as used
        resetRequest.usedAt = new Date();
        await resetRequest.save();

        // Create new session for password reset
        const sessionReset = new PasswordReset({
            userId: resetRequest.userId,
            userType: userType,
            email: email.toLowerCase(),
            resetType: 'token',
            resetToken: sessionToken,
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes for password reset
        });

        await sessionReset.save();

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

// Reset password endpoint
router.post('/auth/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, newPassword, userType, sessionToken } = req.body;

        // Check if it's a session token (from OTP flow) or reset token (from email link)
        const resetToken = sessionToken || token;

        if (!resetToken || !newPassword || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Token, new password, and user type are required'
            });
        }

        // Strong password rules - must match what AdminStaff routes enforce
        // 8+ characters, uppercase, lowercase, number, special character
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

        // Find valid reset request
        const resetRequest = await PasswordReset.findValidReset({
            resetToken: resetToken,
            userType: userType,
            resetType: 'token'
        });

        if (!resetRequest) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Find and update user password
        let user = null;
        if (userType === 'admin' || ['finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'].includes(userType)) {
            user = await AdminStaff.findById(resetRequest.userId);
        } else if (userType === 'hod') {
            user = await HOD.findById(resetRequest.userId);
        } else if (userType === 'trainer') {
            user = await Trainer.findById(resetRequest.userId);
        } else if (userType === 'student') {
            user = await Student.findById(resetRequest.userId);
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update password
        if (userType === 'student') {
            // For students, password is stored as plain text (phone number)
            user.password = newPassword;
        } else {
            // For HOD and trainers, set the plain password - the model's pre-save hook will hash it
            user.password = newPassword;
        }

        await user.save();

        // Mark reset request as used
        await resetRequest.markAsUsed();

        // Invalidate all other reset requests for this user
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
            resetToken: token,
            userType: type,
            resetType: 'token'
        });

        if (!resetRequest) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Fetch user details to return to frontend
        let userData = { name: 'User', identifier: resetRequest.email };
        try {
            if (type === 'admin') {
                const admin = await AdminStaff.findById(resetRequest.userId).select('name email staffId');
                if (admin) userData = { name: admin.name, identifier: admin.staffId || admin.email };
            } else if (type === 'hod') {
                const hod = await HOD.findById(resetRequest.userId).select('name email department');
                if (hod) userData = { name: hod.name, identifier: hod.department || hod.email };
            } else if (type === 'trainer') {
                const trainer = await Trainer.findById(resetRequest.userId).select('name email');
                if (trainer) userData = { name: trainer.name, identifier: trainer.email };
            } else if (type === 'student') {
                const student = await Student.findById(resetRequest.userId).select('name admissionNumber');
                if (student) userData = { name: student.name, identifier: student.admissionNumber || resetRequest.email };
            }
        } catch (userLookupError) {
            console.error('Error looking up user details:', userLookupError);
        }

        res.json({
            success: true,
            message: 'Token is valid',
            email: resetRequest.email,
            userType: resetRequest.userType,
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
