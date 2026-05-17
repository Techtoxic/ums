const mongoose = require('mongoose');
const crypto = require('crypto');

// SEV-H-017: deterministic SHA-256 hex hash used for OTP storage + verification.
function hashOtpValue(raw) {
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Login OTP Schema for two-factor authentication
const loginOTPSchema = new mongoose.Schema({
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
    // SEV-H-017: only the SHA-256 hash of the OTP is ever stored at rest.
    otpHash: {
        type: String,
        required: true
    },
    otpAttempts: {
        type: Number,
        default: 0,
        max: 5 // Maximum 5 attempts
    },
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
    isVerified: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true,
        default: function() {
            // OTP expires in 10 minutes
            return new Date(Date.now() + 10 * 60 * 1000);
        }
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    verifiedAt: {
        type: Date
    }
});

// Compound indexes (SEV-H-017: no index references the raw OTP - it no
// longer exists at rest. Lookups are by email + recency.)
loginOTPSchema.index({ userId: 1, userType: 1, isUsed: 1 });
loginOTPSchema.index({ email: 1, createdAt: -1 });

// TTL index to automatically delete expired documents
loginOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

loginOTPSchema.statics.hashValue = hashOtpValue;

// Virtual setter so existing callers can keep doing `new LoginOTP({ otp })`
// or `doc.otp = value`; only the hash is persisted.
loginOTPSchema.virtual('otp').set(function(raw) {
    this.otpHash = hashOtpValue(raw);
});

// Compare a supplied raw OTP against the stored hash.
loginOTPSchema.methods.verifyOtp = function(raw) {
    return !!this.otpHash && this.otpHash === hashOtpValue(raw);
};

// Instance methods
loginOTPSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

loginOTPSchema.methods.canAttempt = function() {
    return this.otpAttempts < 5 && !this.isUsed && !this.isExpired();
};

loginOTPSchema.methods.incrementAttempts = async function() {
    // Atomic increment so concurrent guesses cannot race past the cap.
    const updated = await this.constructor.findOneAndUpdate(
        { _id: this._id },
        { $inc: { otpAttempts: 1 } },
        { new: true }
    );
    if (updated) {
        this.otpAttempts = updated.otpAttempts;
    }
    return this;
};

loginOTPSchema.methods.markAsVerified = function() {
    this.isVerified = true;
    this.isUsed = true;
    this.verifiedAt = new Date();
    return this.save();
};

// Static methods
loginOTPSchema.statics.findValidOTP = function(criteria) {
    const query = { ...criteria };
    // SEV-H-017: translate a raw otp lookup into a hash lookup.
    if (query.otp !== undefined) {
        query.otpHash = hashOtpValue(query.otp);
        delete query.otp;
    }
    return this.findOne({
        ...query,
        isUsed: false,
        isVerified: false,
        expiresAt: { $gt: new Date() }
    });
};

loginOTPSchema.statics.invalidateUserOTPs = function(userId, userType) {
    return this.updateMany(
        { 
            userId: userId, 
            userType: userType,
            isUsed: false 
        },
        { 
            isUsed: true
        }
    );
};

// Generate secure 6-digit OTP using a cryptographically secure RNG
loginOTPSchema.statics.generateOTP = function() {
    return crypto.randomInt(100000, 1000000).toString();
};

// Security: never return the OTP hash in serialised output.
loginOTPSchema.methods.toJSON = function() {
    const otpObj = this.toObject();
    delete otpObj.otpHash;
    return otpObj;
};

module.exports = mongoose.model('LoginOTP', loginOTPSchema);
