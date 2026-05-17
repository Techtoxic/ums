const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminStaffSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        enum: ['admin', 'deputy', 'finance', 'dean', 'ilo', 'registrar'],
        index: true
    },
    staffId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Invalid email format'
        }
    },
    password: {
        type: String,
        required: true,
        select: false // SEV-H-018: never returned by default queries
        // SEV-C-004: no default. A document cannot be saved without an
        // explicitly-set password; the pre-save hook hashes it.
    },
    tokenVersion: {
        type: Number,
        default: 0 // SEV-H-013: bumped on password/email/role change to revoke JWTs
    },
    phone: {
        type: String,
        trim: true
    },
    department: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isFirstLogin: {
        type: Boolean,
        default: true
    },
    mustUpdateEmail: {
        type: Boolean,
        default: true
    },
    mustUpdatePassword: {
        type: Boolean,
        default: true
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date
    },
    lastPasswordChange: {
        type: Date
    },
    passwordHistory: {
        type: [{ password: String, changedAt: Date }],
        select: false, // SEV-H-018: never returned by default queries
        default: []
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminStaff'
    }
});

// Indexes for better query performance
adminStaffSchema.index({ staffId: 1, isActive: 1 });
adminStaffSchema.index({ email: 1, isActive: 1 });
adminStaffSchema.index({ role: 1, isActive: 1 });

// Virtual for account locked status
adminStaffSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving
adminStaffSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        this.updatedAt = new Date();
        
        // Track password change
        if (!this.isNew) {
            this.lastPasswordChange = new Date();
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

// SEV-H-013: bump tokenVersion (revoking all existing JWTs) whenever the
// password, email or role changes on an EXISTING, fully-onboarded account.
// During first-login setup the email and password are changed in sequence
// using a single token (FirstLogin.html, not editable in this pass), so
// bumping mid-setup would lock the user out. The account has no real session
// to protect until setup completes, so the bump is deferred until then.
adminStaffSchema.pre('save', function(next) {
    if (!this.isNew && !this.isFirstLogin &&
        (this.isModified('password') || this.isModified('email') || this.isModified('role'))) {
        this.tokenVersion = (this.tokenVersion || 0) + 1;
    }
    next();
});

// Compare password method
adminStaffSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Increment login attempts
adminStaffSchema.methods.incLoginAttempts = function() {
    // If we have a previous lock that has expired, restart at 1
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }
    
    // Otherwise increment attempts
    const updates = { $inc: { loginAttempts: 1 } };
    
    // Lock account after 5 failed attempts for 2 hours
    const maxAttempts = 5;
    const lockTime = 2 * 60 * 60 * 1000; // 2 hours
    
    if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + lockTime };
    }
    
    return this.updateOne(updates);
};

// Reset login attempts
adminStaffSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 }
    });
};

// Update last login
adminStaffSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

// Mark first login as complete
adminStaffSchema.methods.completeFirstLogin = function() {
    this.isFirstLogin = false;
    this.mustUpdateEmail = false;
    this.mustUpdatePassword = false;
    return this.save();
};

// Verify if password was used before
adminStaffSchema.methods.isPasswordReused = async function(newPassword) {
    if (!this.passwordHistory || this.passwordHistory.length === 0) {
        return false;
    }
    
    // Check last 5 passwords
    const recentPasswords = this.passwordHistory.slice(-5);
    
    for (const historyEntry of recentPasswords) {
        const isMatch = await bcrypt.compare(newPassword, historyEntry.password);
        if (isMatch) {
            return true;
        }
    }
    
    return false;
};

// Static method to get role display name
adminStaffSchema.statics.getRoleDisplayName = function(roleCode) {
    const roleNames = {
        'admin': 'Administrator',
        'deputy': 'Deputy Principal',
        'finance': 'Finance Officer',
        'dean': 'Dean of Students',
        'ilo': 'Industry Liaison Officer',
        'registrar': 'Registrar'
    };
    return roleNames[roleCode] || roleCode;
};

// Static method to get all roles
adminStaffSchema.statics.getAllRoles = function() {
    return [
        { code: 'admin', name: 'Administrator' },
        { code: 'deputy', name: 'Deputy Principal' },
        { code: 'finance', name: 'Finance Officer' },
        { code: 'dean', name: 'Dean of Students' },
        { code: 'ilo', name: 'Industry Liaison Officer' },
        { code: 'registrar', name: 'Registrar' }
    ];
};

// SEV-H-018: strip secret-like fields from any serialised output, even if a
// query explicitly selected them.
function stripSecrets(doc, ret) {
    delete ret.password;
    delete ret.passwordHistory;
    delete ret.tokenVersion;
    delete ret.otpHash;
    delete ret.tokenHash;
    return ret;
}
adminStaffSchema.set('toJSON', { virtuals: true, transform: stripSecrets });
adminStaffSchema.set('toObject', { virtuals: true, transform: stripSecrets });

module.exports = mongoose.model('AdminStaff', adminStaffSchema);
