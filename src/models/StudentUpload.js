const mongoose = require('mongoose');

const studentUploadSchema = new mongoose.Schema({
    studentId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    studentName: {
        type: String,
        required: true
    },
    admissionNumber: {
        type: String,
        required: true,
        index: true
    },
    course: {
        type: String,
        required: true,
        index: true
    },
    department: {
        type: String,
        required: true,
        index: true
    },
    year: {
        type: Number,
        required: true
    },
    
    // Upload type and category
    uploadType: {
        type: String,
        required: true,
        enum: ['profile_photo', 'kcse_results', 'kcpe_results', 'assessment', 'practical'],
        index: true
    },
    
    // For unit-related uploads (assessments and practicals)
    unitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit'
    },
    unitCode: {
        type: String,
        trim: true,
        index: true
    },
    unitName: {
        type: String,
        trim: true
    },
    
    // For assessments
    assessmentNumber: {
        type: Number,
        min: 1,
        max: 3
    },
    
    // For practicals (1, 2, 3)
    practicalNumber: {
        type: Number,
        min: 1,
        max: 3
    },
    
    // File information
    fileName: {
        type: String,
        required: true
    },
    originalFileName: {
        type: String,
        required: true
    },
    s3Key: {
        type: String,
        required: true,
        index: true
    },
    s3Bucket: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    
    // Status tracking
    status: {
        type: String,
        enum: ['uploaded', 'replaced', 'deleted', 'pending'],
        default: 'uploaded',
        index: true
    },
    
    // Version control
    version: {
        type: Number,
        default: 1
    },
    replacedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentUpload'
    },
    replaces: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentUpload'
    },
    
    // Academic period
    academicYear: {
        type: String,
        required: true
    },
    semester: {
        type: String,
        required: true
    },
    
    // Timestamps
    uploadedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    
    // Metadata for CIBEC
    viewedBy: [{
        userId: String,
        viewedAt: Date
    }],
    downloadedBy: [{
        userId: String,
        downloadedAt: Date
    }]
});

// Update timestamp before saving
studentUploadSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Compound indexes for efficient queries
studentUploadSchema.index({ studentId: 1, uploadType: 1, status: 1 });
studentUploadSchema.index({ unitId: 1, uploadType: 1 });
studentUploadSchema.index({ course: 1, department: 1 });
studentUploadSchema.index({ academicYear: 1, semester: 1 });
studentUploadSchema.index({ uploadedAt: -1 });

// Unique constraint for profile photo (only one active)
// Using sparse index to allow only one profile photo per student
studentUploadSchema.index(
    { studentId: 1, uploadType: 1, status: 1 },
    { 
        unique: true, 
        sparse: true,
        partialFilterExpression: { 
            uploadType: 'profile_photo',
            status: 'uploaded'
        },
        name: 'unique_profile_photo'
    }
);

// Unique constraint for KCSE results (only one active)
studentUploadSchema.index(
    { studentId: 1, status: 1 },
    { 
        unique: true, 
        sparse: true,
        partialFilterExpression: { 
            uploadType: 'kcse_results',
            status: 'uploaded'
        },
        name: 'unique_kcse_results'
    }
);

// Unique constraint for KCPE results (only one active)
studentUploadSchema.index(
    { studentId: 1, status: 1 },
    { 
        unique: true, 
        sparse: true,
        partialFilterExpression: { 
            uploadType: 'kcpe_results',
            status: 'uploaded'
        },
        name: 'unique_kcpe_results'
    }
);

// Unique constraint for unit assessments (only one active per assessment number)
studentUploadSchema.index(
    { studentId: 1, unitId: 1, assessmentNumber: 1, status: 1 },
    { 
        unique: true, 
        sparse: true,
        partialFilterExpression: { 
            uploadType: 'assessment',
            status: 'uploaded'
        },
        name: 'unique_unit_assessment'
    }
);

// Unique constraint for unit practicals (only one active per practical number)
studentUploadSchema.index(
    { studentId: 1, unitId: 1, practicalNumber: 1, status: 1 },
    { 
        unique: true, 
        sparse: true,
        partialFilterExpression: { 
            uploadType: 'practical',
            status: 'uploaded'
        },
        name: 'unique_unit_practical'
    }
);

// Static methods
studentUploadSchema.statics.getStudentUploads = function(studentId, status = 'uploaded') {
    return this.find({ studentId, status })
        .populate('unitId')
        .sort({ uploadedAt: -1 });
};

studentUploadSchema.statics.getUnitUploads = function(unitId, status = 'uploaded') {
    return this.find({ unitId, status })
        .sort({ uploadedAt: -1 });
};

studentUploadSchema.statics.getCIBECUploads = function(filters = {}) {
    const query = { status: filters.status || 'uploaded' };
    
    if (filters.course) query.course = filters.course;
    if (filters.department) query.department = filters.department;
    if (filters.unitCode) query.unitCode = filters.unitCode;
    if (filters.year) query.year = parseInt(filters.year);
    if (filters.uploadType) query.uploadType = filters.uploadType;
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.semester) query.semester = filters.semester;
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.admissionNumber) query.admissionNumber = filters.admissionNumber;
    
    // Filter by course level (e.g., level 4, 5, or 6)
    if (filters.courseLevel) {
        // Courses end with _4, _5, or _6
        query.course = new RegExp(`_${filters.courseLevel}$`);
    }
    
    return this.find(query)
        .populate('unitId')
        .sort({ uploadedAt: -1 });
};

// Instance method to replace file
studentUploadSchema.methods.replaceWith = async function(newUploadId) {
    this.status = 'replaced';
    this.replacedBy = newUploadId;
    this.updatedAt = Date.now();
    return await this.save();
};

module.exports = mongoose.model('StudentUpload', studentUploadSchema);


