const mongoose = require('mongoose');

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
    otp: {
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

// Compound indexes
loginOTPSchema.index({ userId: 1, userType: 1, isUsed: 1 });
loginOTPSchema.index({ email: 1, otp: 1, isUsed: 1 });
loginOTPSchema.index({ otp: 1, isVerified: 1 });

// TTL index to automatically delete expired documents
loginOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
loginOTPSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

loginOTPSchema.methods.canAttempt = function() {
    return this.otpAttempts < 5 && !this.isUsed && !this.isExpired();
};

loginOTPSchema.methods.incrementAttempts = function() {
    this.otpAttempts += 1;
    return this.save();
};

loginOTPSchema.methods.markAsVerified = function() {
    this.isVerified = true;
    this.isUsed = true;
    this.verifiedAt = new Date();
    return this.save();
};

// Static methods
loginOTPSchema.statics.findValidOTP = function(criteria) {
    return this.findOne({
        ...criteria,
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

// Generate secure 6-digit OTP
loginOTPSchema.statics.generateOTP = function() {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Security: Prevent OTP from being returned in queries
loginOTPSchema.methods.toJSON = function() {
    const otpObj = this.toObject();
    delete otpObj.otp;
    return otpObj;
};

module.exports = mongoose.model('LoginOTP', loginOTPSchema);
