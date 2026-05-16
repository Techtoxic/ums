const mongoose = require('mongoose');

const commonUnitAssignmentSchema = new mongoose.Schema({
    commonUnitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommonUnit',
        required: true
    },
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trainer',
        required: true
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HOD',
        required: true
    },
    assignedByDepartment: {
        type: String,
        required: true,
        enum: ['applied_science', 'agriculture', 'building_civil', 'business_liberal', 'electromechanical', 'hospitality', 'computing_informatics']
    },
    trainerDepartment: {
        type: String,
        required: true,
        enum: ['applied_science', 'agriculture', 'building_civil', 'business_liberal', 'electromechanical', 'hospitality', 'computing_informatics']
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'completed'],
        default: 'active'
    },
    notes: {
        type: String,
        trim: true
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
commonUnitAssignmentSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for efficient queries
commonUnitAssignmentSchema.index({ trainerId: 1, status: 1 });
commonUnitAssignmentSchema.index({ commonUnitId: 1, status: 1 });
commonUnitAssignmentSchema.index({ assignedByDepartment: 1, status: 1 });
commonUnitAssignmentSchema.index({ trainerDepartment: 1, status: 1 });

// Static method to get assignments by trainer
commonUnitAssignmentSchema.statics.getAssignmentsByTrainer = function(trainerId, status = 'active') {
    return this.find({ trainerId, status })
        .populate('commonUnitId')
        .populate('trainerId', 'name email department')
        .populate('assignedBy', 'name department')
        .sort({ assignedAt: -1 });
};

// Static method to get assignments by common unit
commonUnitAssignmentSchema.statics.getAssignmentsByCommonUnit = function(commonUnitId, status = 'active') {
    return this.find({ commonUnitId, status })
        .populate('commonUnitId')
        .populate('trainerId', 'name email department')
        .populate('assignedBy', 'name department')
        .sort({ assignedAt: -1 });
};

// Static method to get assignments by department
commonUnitAssignmentSchema.statics.getAssignmentsByDepartment = function(department, status = 'active') {
    return this.find({ assignedByDepartment: department, status })
        .populate('commonUnitId')
        .populate('trainerId', 'name email department')
        .populate('assignedBy', 'name department')
        .sort({ assignedAt: -1 });
};

// Static method to get all trainer departments for common unit filtering
commonUnitAssignmentSchema.statics.getTrainerDepartments = function() {
    return this.distinct('trainerDepartment');
};

// Instance method to check if assignment can be modified
commonUnitAssignmentSchema.methods.canModify = function() {
    return this.status === 'active';
};

module.exports = mongoose.model('CommonUnitAssignment', commonUnitAssignmentSchema);

