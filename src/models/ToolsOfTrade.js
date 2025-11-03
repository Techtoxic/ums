const mongoose = require('mongoose');

const toolsOfTradeSchema = new mongoose.Schema({
    trainerId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true,
        ref: 'Trainer'
    },
    unitId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true,
        ref: 'Unit'
    },
    commonUnitId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommonUnit'
    },
    toolType: { 
        type: String, 
        required: true,
        enum: ['course_outline', 'learning_plan', 'record_of_work', 'session_plan', 'exam']
    },
    fileName: { 
        type: String, 
        required: true 
    },
    originalFileName: { 
        type: String, 
        required: true 
    },
    filePath: { 
        type: String, 
        required: true 
    },
    s3Key: {
        type: String,
        // S3 object key - required if using S3
    },
    s3Bucket: {
        type: String,
        // S3 bucket name
    },
    storageType: {
        type: String,
        enum: ['local', 's3'],
        default: 'local'
    },
    fileSize: { 
        type: Number, 
        required: true 
    },
    mimeType: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        default: 'submitted',
        enum: ['submitted', 'under_review', 'approved', 'rejected', 'needs_revision']
    },
    submittedAt: { 
        type: Date, 
        default: Date.now 
    },
    reviewedAt: { 
        type: Date 
    },
    reviewedBy: { 
        type: String,
        default: 'deputy_academics'
    },
    feedback: { 
        type: String 
    },
    academicYear: { 
        type: String, 
        required: true 
    },
    semester: { 
        type: String, 
        required: true 
    }
});

// Index for efficient queries
toolsOfTradeSchema.index({ trainerId: 1, unitId: 1, toolType: 1 });
toolsOfTradeSchema.index({ status: 1 });
toolsOfTradeSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('ToolsOfTrade', toolsOfTradeSchema);
