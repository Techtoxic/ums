const mongoose = require('mongoose');

// Password Reset Schema for OTP and Token-based resets
const passwordResetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    userType: {
        type: String,
        required: true,
        enum: ['student', 'trainer', 'hod'],
        index: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    resetType: {
        type: String,
        required: true,
        enum: ['otp', 'token'],
        index: true
    },
    // For OTP method
    otp: {
        type: String,
        sparse: true // Only required for OTP type
    },
    otpAttempts: {
        type: Number,
        default: 0,
        max: 5 // Maximum 5 attempts to prevent brute force
    },
    // For Token method
    resetToken: {
        type: String,
        sparse: true // Only required for token type
    },
    // Security fields
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        required: true
    },
    isUsed: {
        type: Boolean,
        default: false,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    usedAt: {
        type: Date
    }
});

// Compound indexes for better query performance
passwordResetSchema.index({ userId: 1, userType: 1, resetType: 1 });
passwordResetSchema.index({ email: 1, resetType: 1, isUsed: 1 });
passwordResetSchema.index({ resetToken: 1, isUsed: 1 });
passwordResetSchema.index({ otp: 1, email: 1, isUsed: 1 });

// TTL index to automatically delete expired documents
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
passwordResetSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

passwordResetSchema.methods.canAttempt = function() {
    return this.otpAttempts < 5 && !this.isUsed && !this.isExpired();
};

passwordResetSchema.methods.incrementAttempts = function() {
    this.otpAttempts += 1;
    return this.save();
};

passwordResetSchema.methods.markAsUsed = function() {
    this.isUsed = true;
    this.usedAt = new Date();
    return this.save();
};

// Static methods
passwordResetSchema.statics.findValidReset = function(criteria) {
    return this.findOne({
        ...criteria,
        isUsed: false,
        expiresAt: { $gt: new Date() }
    });
};

passwordResetSchema.statics.invalidateUserResets = function(userId, userType) {
    return this.updateMany(
        { 
            userId: userId, 
            userType: userType,
            isUsed: false 
        },
        { 
            isUsed: true,
            usedAt: new Date()
        }
    );
};

// Generate secure OTP
passwordResetSchema.statics.generateOTP = function() {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate secure reset token
passwordResetSchema.statics.generateResetToken = function() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
};

// Pre-save middleware to set expiration
passwordResetSchema.pre('save', function(next) {
    if (this.isNew && !this.expiresAt) {
        // OTP expires in 10 minutes, token expires in 1 hour
        const expirationTime = this.resetType === 'otp' ? 10 : 60;
        this.expiresAt = new Date(Date.now() + expirationTime * 60 * 1000);
    }
    next();
});

// Also set expiration during validation if not set
passwordResetSchema.pre('validate', function(next) {
    if (!this.expiresAt) {
        // OTP expires in 10 minutes, token expires in 1 hour
        const expirationTime = this.resetType === 'otp' ? 10 : 60;
        this.expiresAt = new Date(Date.now() + expirationTime * 60 * 1000);
    }
    next();
});

// Security: Prevent sensitive data from being returned in queries
passwordResetSchema.methods.toJSON = function() {
    const resetObj = this.toObject();
    delete resetObj.otp;
    delete resetObj.resetToken;
    return resetObj;
};

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
