const mongoose = require('mongoose');

const studentNoteSchema = new mongoose.Schema({
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
    noteType: {
        type: String,
        required: true,
        enum: ['private', 'public'],
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['welfare', 'academic', 'disciplinary', 'health', 'financial', 'general'],
        default: 'general'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    createdBy: {
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        userRole: { type: String, required: true }
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp before saving
studentNoteSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Indexes for efficient queries
studentNoteSchema.index({ studentId: 1, noteType: 1 });
studentNoteSchema.index({ studentId: 1, isRead: 1 });
studentNoteSchema.index({ createdAt: -1 });

// Static method to get student notes
studentNoteSchema.statics.getStudentNotes = function(studentId, noteType = null) {
    const query = { studentId };
    if (noteType) query.noteType = noteType;
    return this.find(query).sort({ createdAt: -1 });
};

// Static method to get unread public notes for a student
studentNoteSchema.statics.getUnreadPublicNotes = function(studentId) {
    return this.find({
        studentId,
        noteType: 'public',
        isRead: false
    }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('StudentNote', studentNoteSchema);


