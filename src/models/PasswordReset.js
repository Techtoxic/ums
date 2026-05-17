const mongoose = require('mongoose');
const crypto = require('crypto');

// SEV-H-017: deterministic SHA-256 hex hash for OTP/token storage + lookup.
function hashResetValue(raw) {
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

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
        enum: ['student', 'trainer', 'hod', 'admin', 'deputy', 'finance', 'dean', 'ilo', 'registrar'],
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
    // For OTP method (SEV-H-017: only the SHA-256 hash is stored)
    otpHash: {
        type: String,
        sparse: true
    },
    otpAttempts: {
        type: Number,
        default: 0,
        max: 5 // Maximum 5 attempts to prevent brute force
    },
    // For Token method (SEV-H-017: only the SHA-256 hash is stored)
    tokenHash: {
        type: String,
        sparse: true
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

// Compound indexes (SEV-H-017: no index references a raw OTP/token; those no
// longer exist at rest. Lookups are by hash or by email + recency.)
passwordResetSchema.index({ userId: 1, userType: 1, resetType: 1 });
passwordResetSchema.index({ email: 1, resetType: 1, isUsed: 1 });
passwordResetSchema.index({ email: 1, createdAt: -1 });
passwordResetSchema.index({ tokenHash: 1, isUsed: 1 });
passwordResetSchema.index({ otpHash: 1, isUsed: 1 });

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

// SEV-H-017: virtual setters so existing callers keep using `otp` /
// `resetToken`; only the hash is ever persisted.
passwordResetSchema.statics.hashValue = hashResetValue;
passwordResetSchema.virtual('otp').set(function(raw) {
    this.otpHash = hashResetValue(raw);
});
passwordResetSchema.virtual('resetToken').set(function(raw) {
    this.tokenHash = hashResetValue(raw);
});

// Static methods
passwordResetSchema.statics.findValidReset = function(criteria) {
    const query = { ...criteria };
    // SEV-H-017: translate raw otp/resetToken lookups into hash lookups.
    if (query.otp !== undefined) {
        query.otpHash = hashResetValue(query.otp);
        delete query.otp;
    }
    if (query.resetToken !== undefined) {
        query.tokenHash = hashResetValue(query.resetToken);
        delete query.resetToken;
    }
    return this.findOne({
        ...query,
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

// Generate secure OTP using a cryptographically secure RNG
passwordResetSchema.statics.generateOTP = function() {
    return crypto.randomInt(100000, 1000000).toString();
};

// Generate secure reset token
passwordResetSchema.statics.generateResetToken = function() {
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

// Security: never return the OTP/token hashes in serialised output.
passwordResetSchema.methods.toJSON = function() {
    const resetObj = this.toObject();
    delete resetObj.otpHash;
    delete resetObj.tokenHash;
    return resetObj;
};

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
