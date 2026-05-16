const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipientId: { 
        type: String, 
        required: true 
    },
    recipientType: { 
        type: String, 
        required: true,
        enum: ['trainer', 'hod', 'student', 'deputy', 'cibec', 'registrar', 'ilo', 'finance', 'admin']
    },
    title: { 
        type: String, 
        required: true 
    },
    message: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String, 
        required: true,
        enum: ['tool_request', 'tool_approved', 'tool_rejected', 'tool_revision_needed', 'general', 'student_upload', 'payment', 'registration', 'system']
    },
    relatedId: { 
        type: String // ID of related tool request, assignment, etc.
    },
    isRead: { 
        type: Boolean, 
        default: false 
    },
    readAt: { 
        type: Date 
    },
    priority: { 
        type: String, 
        default: 'medium',
        enum: ['low', 'medium', 'high', 'urgent']
    },
    expiresAt: { 
        type: Date 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Index for efficient queries
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
















