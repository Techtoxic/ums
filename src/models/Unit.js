const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
    unitName: {
        type: String,
        required: true,
        trim: true
    },
    unitCode: {
        type: String,
        required: true,
        trim: true
    },
    courseCode: {
        type: String,
        required: true,
        trim: true,
        index: true // For faster queries by course
    },
    department: {
        type: String,
        required: true,
        enum: ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics'],
        index: true
    },
    level: {
        type: Number,
        required: true,
        min: 4,
        max: 6
    },
    description: {
        type: String,
        default: ''
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

// Compound index for efficient queries
unitSchema.index({ courseCode: 1, level: 1 });

// Update timestamp before saving
unitSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Static method to get units by course code
unitSchema.statics.getUnitsByCourse = function(courseCode) {
    return this.find({ 
        courseCode: courseCode, 
        isActive: true 
    }).sort({ unitCode: 1 });
};

// Static method to get units by department
unitSchema.statics.getUnitsByDepartment = function(department) {
    return this.find({ 
        department: department, 
        isActive: true 
    }).sort({ courseCode: 1, unitCode: 1 });
};

module.exports = mongoose.model('Unit', unitSchema);