const mongoose = require('mongoose');

const studentUnitRegistrationSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    unitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true
    },
    commonUnitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommonUnit',
        required: false
    },
    courseCode: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    unitCode: {
        type: String,
        required: true,
        trim: true
    },
    unitName: {
        type: String,
        required: true,
        trim: true
    },
    unitType: {
        type: String,
        enum: ['department', 'common'],
        required: true
    },
    academicYear: {
        type: String,
        required: true,
        trim: true
    },
    semester: {
        type: String,
        required: true,
        trim: true
    },
    registrationDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['registered', 'dropped', 'completed'],
        default: 'registered'
    },
    grade: {
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
studentUnitRegistrationSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Compound indexes for efficient queries
studentUnitRegistrationSchema.index({ studentId: 1, status: 1 });
studentUnitRegistrationSchema.index({ unitId: 1, status: 1 });
studentUnitRegistrationSchema.index({ commonUnitId: 1, status: 1 });
studentUnitRegistrationSchema.index({ courseCode: 1, status: 1 });
studentUnitRegistrationSchema.index({ unitCode: 1, status: 1 });
studentUnitRegistrationSchema.index({ academicYear: 1, semester: 1 });

// Ensure a student can only register for a unit once per academic period
studentUnitRegistrationSchema.index(
    { studentId: 1, unitCode: 1, academicYear: 1, semester: 1 }, 
    { unique: true }
);

// Static method to get student registrations
studentUnitRegistrationSchema.statics.getStudentRegistrations = function(studentId, status = 'registered') {
    return this.find({ studentId, status, isActive: true })
        .populate('unitId')
        .populate('commonUnitId')
        .sort({ registrationDate: -1 });
};

// Static method to get unit registrations
studentUnitRegistrationSchema.statics.getUnitRegistrations = function(unitId, status = 'registered') {
    return this.find({ unitId, status, isActive: true })
        .sort({ registrationDate: -1 });
};

// Static method to get common unit registrations
studentUnitRegistrationSchema.statics.getCommonUnitRegistrations = function(commonUnitId, status = 'registered') {
    return this.find({ commonUnitId, status, isActive: true })
        .sort({ registrationDate: -1 });
};

// Static method to check if student is registered for a unit
studentUnitRegistrationSchema.statics.isStudentRegistered = function(studentId, unitCode, academicYear, semester) {
    return this.findOne({
        studentId,
        unitCode,
        academicYear,
        semester,
        status: 'registered',
        isActive: true
    });
};

// Static method to register student for a unit
studentUnitRegistrationSchema.statics.registerStudent = async function(registrationData) {
    try {
        // Check if already registered
        const existing = await this.isStudentRegistered(
            registrationData.studentId,
            registrationData.unitCode,
            registrationData.academicYear,
            registrationData.semester
        );
        
        if (existing) {
            throw new Error('Student is already registered for this unit');
        }
        
        // Create registration
        const registration = new this(registrationData);
        return await registration.save();
    } catch (error) {
        throw error;
    }
};

// Static method to get students registered for trainer's units
studentUnitRegistrationSchema.statics.getStudentsForTrainer = function(trainerUnits, status = 'registered') {
    const unitCodes = trainerUnits.map(unit => unit.courseCode || unit.unitCode);
    
    return this.find({
        unitCode: { $in: unitCodes },
        status,
        isActive: true
    }).distinct('studentId');
};

// Instance method to drop registration
studentUnitRegistrationSchema.methods.dropRegistration = function() {
    this.status = 'dropped';
    this.updatedAt = Date.now();
    return this.save();
};

module.exports = mongoose.model('StudentUnitRegistration', studentUnitRegistrationSchema);














