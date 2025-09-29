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
        type: Number,
        min: 0,
        max: 100,
        default: 0
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
    // Calculate total marks (assuming weights: assignments 30%, CAT 20%, final exam 50%)
    this.totalMarks = (this.assignments * 0.3) + (this.catExam * 0.2) + (this.finalExam * 0.5);
    
    // Determine grade based on total marks
    if (this.totalMarks >= 80) {
        this.grade = 'A';
        this.remarks = 'Excellent';
    } else if (this.totalMarks >= 70) {
        this.grade = 'B';
        this.remarks = 'Very Good';
    } else if (this.totalMarks >= 60) {
        this.grade = 'C';
        this.remarks = 'Good';
    } else if (this.totalMarks >= 50) {
        this.grade = 'D';
        this.remarks = 'Satisfactory';
    } else if (this.totalMarks >= 40) {
        this.grade = 'E';
        this.remarks = 'Pass';
    } else {
        this.grade = 'F';
        this.remarks = 'Fail';
    }
    
    // Mark as complete if all components have been graded
    this.isComplete = (this.assignments > 0 || this.catExam > 0 || this.finalExam > 0);
    
    // Update the updatedAt field
    this.updatedAt = new Date();
    next();
});

const Transcript = mongoose.model('Transcript', transcriptSchema);

module.exports = Transcript;