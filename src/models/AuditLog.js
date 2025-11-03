const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    userType: {
        type: String,
        required: true,
        enum: ['student', 'cibec', 'admin', 'trainer', 'hod', 'deputy', 'registrar'],
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'upload', 
            'replace', 
            'delete', 
            'view', 
            'download',
            'presign',
            'search',
            'filter'
        ],
        index: true
    },
    
    // Related entities
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentUpload',
        index: true
    },
    studentId: {
        type: String,
        index: true
    },
    
    // Action details
    details: {
        type: mongoose.Schema.Types.Mixed
    },
    
    // Request metadata
    ipAddress: String,
    userAgent: String,
    
    // Timestamp
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, action: 1 });
auditLogSchema.index({ fileId: 1, action: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userType: 1, action: 1 });

// Static method to create log entry
auditLogSchema.statics.logAction = async function(logData) {
    const log = new this(logData);
    return await log.save();
};

// Static method to get user activity
auditLogSchema.statics.getUserActivity = function(userId, limit = 100) {
    return this.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('fileId');
};

// Static method to get file access history
auditLogSchema.statics.getFileHistory = function(fileId) {
    return this.find({ fileId })
        .sort({ timestamp: -1 })
        .limit(50);
};

// Static method to get CIBEC activity
auditLogSchema.statics.getCIBECActivity = function(dateFrom, dateTo) {
    const query = { userType: 'cibec' };
    
    if (dateFrom || dateTo) {
        query.timestamp = {};
        if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
        if (dateTo) query.timestamp.$lte = new Date(dateTo);
    }
    
    return this.find(query)
        .sort({ timestamp: -1 })
        .limit(1000);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);


