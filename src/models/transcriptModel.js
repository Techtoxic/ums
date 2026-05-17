const mongoose = require('mongoose');

// Transcript Schema
const transcriptSchema = new mongoose.Schema({
    student: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    studentAdmissionNumber: {
        type: String,
        required: true,
        index: true
    },
    unit: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true
    },
    unitCode: {
        type: String,
        required: true
    },
    unitName: {
        type: String,
        required: true
    },
    trainer: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trainer',
        required: true
    },
    trainerName: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    semester: {
        type: Number,
        required: true
    },
    assignments: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    catExam: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    finalExam: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    totalMarks: {
        type: mongoose.Schema.Types.Decimal128, // SEV-H-016: exact grade total
        default: mongoose.Types.Decimal128.fromString('0')
    },
    grade: {
        type: String,
        enum: ['A', 'B', 'C', 'D', 'E', 'F', 'N/A'],
        default: 'N/A'
    },
    remarks: {
        type: String,
        default: ''
    },
    isComplete: {
        type: Boolean,
        default: false
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

// Pre-save middleware to calculate total marks and grade
transcriptSchema.pre('save', function(next) {
    // SEV-H-016: compute in Number space, round to 2dp, store as Decimal128.
    const total = Math.round(
        ((this.assignments * 0.3) + (this.catExam * 0.2) + (this.finalExam * 0.5)) * 100
    ) / 100;
    this.totalMarks = mongoose.Types.Decimal128.fromString(total.toFixed(2));

    // Determine grade based on the numeric total
    if (total >= 80) {
        this.grade = 'A';
        this.remarks = 'Excellent';
    } else if (total >= 70) {
        this.grade = 'B';
        this.remarks = 'Very Good';
    } else if (total >= 60) {
        this.grade = 'C';
        this.remarks = 'Good';
    } else if (total >= 50) {
        this.grade = 'D';
        this.remarks = 'Satisfactory';
    } else if (total >= 40) {
        this.grade = 'E';
        this.remarks = 'Pass';
    } else {
        this.grade = 'F';
        this.remarks = 'Fail';
    }

    // SEV-H-016: a transcript is complete only when ALL components are entered
    // (was an OR bug that flagged completion on any single non-zero score).
    this.isComplete = (this.assignments > 0 && this.catExam > 0 && this.finalExam > 0);
    
    // Update the updatedAt field
    this.updatedAt = new Date();
    next();
});

// SEV-H-016: emit totalMarks as a plain string, not the raw {$numberDecimal}.
transcriptSchema.set('toJSON', {
    transform: function(doc, ret) {
        if (ret.totalMarks !== undefined && ret.totalMarks !== null && typeof ret.totalMarks === 'object') {
            ret.totalMarks = ret.totalMarks.toString();
        }
        return ret;
    }
});

const Transcript = mongoose.model('Transcript', transcriptSchema);

module.exports = Transcript;