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
        default: 'trainer123' // Default password
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

// Note: Password is stored as plain text as per requirements
// Update timestamp when password is modified
trainerSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.updatedAt = new Date();
    }
    next();
});

// Compare password method (plain text comparison)
trainerSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        // Plain text comparison as per requirements
        return this.password === candidatePassword;
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

module.exports = mongoose.model('Trainer', trainerSchema);
