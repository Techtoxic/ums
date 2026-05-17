const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const trainerSchema = new mongoose.Schema({
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
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        select: false
        // SEV-C-004/SEV-C-005: no default, never returned by default queries.
        // Hashed by the pre-save hook below.
    },
    tokenVersion: {
        type: Number,
        default: 0 // SEV-H-013: bumped on password/email change to revoke JWTs
    },
    phone: {
        type: String,
        trim: true
    },
    department: {
        type: String,
        required: true,
        enum: ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics'],
        index: true
    },
    specialization: {
        type: String,
        trim: true
    },
    qualifications: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// SEV-C-005: Hash password with bcrypt (cost 12) before saving.
// Only re-hash when the password field was actually modified.
trainerSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        this.updatedAt = new Date();
        next();
    } catch (error) {
        next(error);
    }
});

// SEV-H-013: bump tokenVersion (revoking existing JWTs) on credential change.
trainerSchema.pre('save', function(next) {
    if (!this.isNew && (this.isModified('password') || this.isModified('email'))) {
        this.tokenVersion = (this.tokenVersion || 0) + 1;
    }
    next();
});

// Compare password method (bcrypt)
trainerSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Update last login
trainerSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

// Static method to get trainers by department
trainerSchema.statics.getTrainersByDepartment = function(department) {
    return this.find({ 
        department: department, 
        isActive: true 
    }).sort({ name: 1 });
};

// Static method to get all active trainers
trainerSchema.statics.getActiveTrainers = function() {
    return this.find({ 
        isActive: true 
    }).sort({ name: 1 });
};

// Method to get assigned units count
trainerSchema.methods.getAssignedUnitsCount = async function() {
    try {
        const TrainerAssignment = mongoose.model('TrainerAssignment');
        const count = await TrainerAssignment.countDocuments({
            trainerId: this._id,
            status: 'active'
        });
        return count;
    } catch (error) {
        console.error('Error getting assigned units count:', error);
        return 0;
    }
};

// SEV-H-018: strip secret-like fields from any serialised output.
function stripTrainerSecrets(doc, ret) {
    delete ret.password;
    delete ret.tokenVersion;
    return ret;
}
trainerSchema.set('toJSON', { transform: stripTrainerSecrets });
trainerSchema.set('toObject', { transform: stripTrainerSecrets });

module.exports = mongoose.model('Trainer', trainerSchema);
