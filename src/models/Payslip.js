const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema({
    trainerId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    trainerName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    month: {
        type: String,
        required: true,
        trim: true
    },
    year: {
        type: Number,
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    period: {
        type: String,
        required: true // e.g., "January 2025", "Feb 2025"
    },
    description: {
        type: String,
        default: 'Monthly Salary'
    },
    generatedBy: {
        userId: { type: String, required: true },
        userName: { type: String, required: true }
    },
    isViewed: {
        type: Boolean,
        default: false
    },
    viewedAt: {
        type: Date
    },
    status: {
        type: String,
        enum: ['generated', 'viewed', 'downloaded'],
        default: 'generated'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound indexes
payslipSchema.index({ trainerId: 1, year: 1, month: 1 });
payslipSchema.index({ createdAt: -1 });

// Static method to get trainer payslips
payslipSchema.statics.getTrainerPayslips = function(trainerId) {
    return this.find({ trainerId }).sort({ createdAt: -1 });
};

// Static method to get payslips by period
payslipSchema.statics.getPayslipsByPeriod = function(month, year) {
    return this.find({ month, year }).sort({ trainerName: 1 });
};

module.exports = mongoose.model('Payslip', payslipSchema);


