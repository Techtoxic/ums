const mongoose = require('mongoose');

const commonUnitSchema = new mongoose.Schema({
    unitCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    unitName: {
        type: String,
        required: true,
        trim: true
    },
    courseCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    courseName: {
        type: String,
        required: true,
        trim: true
    },
    level: {
        type: String,
        required: true,
        enum: ['certificate', 'diploma', 'degree']
    },
    description: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
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

// Update the updatedAt field before saving
commonUnitSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to get all active common units
commonUnitSchema.statics.getActiveUnits = function() {
    return this.find({ isActive: true }).sort({ unitName: 1 });
};

// Static method to find unit by code
commonUnitSchema.statics.findByCode = function(unitCode) {
    return this.findOne({ unitCode: unitCode.toUpperCase(), isActive: true });
};

module.exports = mongoose.model('CommonUnit', commonUnitSchema);

