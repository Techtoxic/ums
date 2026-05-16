const mongoose = require('mongoose');

const attachmentApplicationSchema = new mongoose.Schema({
    studentId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    admissionNumber: { type: String, required: true },
    idNumber: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    kcseGrade: { type: String, required: true },
    course: { type: String, required: true },
    department: { type: String, required: true },
    yearOfStudy: { type: Number, required: true },
    intake: { type: String, required: true },
    admissionType: { type: String, required: true },
    level: { type: Number, required: true },
    county: { type: String, required: true },
    nearestTown: { type: String, required: true },
    applicationDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['submitted', 'under_review', 'approved', 'rejected'], default: 'submitted' },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    comments: { type: String },
    academicYear: { type: String, required: true },
    attachmentCompany: { type: String },
    companyAddress: { type: String },
    companySupervisor: { type: String },
    supervisorContact: { type: String },
    attachmentStartDate: { type: Date },
    attachmentEndDate: { type: Date },
    attachmentDuration: { type: Number },
    unitsCompleted: { type: Number, default: 0 },
    totalUnits: { type: Number, default: 0 },
    isEligible: { type: Boolean, default: false },
    eligibilityCheckedBy: { type: String },
    eligibilityCheckedAt: { type: Date }
});

attachmentApplicationSchema.index({ studentId: 1, academicYear: 1 }, { unique: true });
attachmentApplicationSchema.index({ status: 1, applicationDate: -1 });
attachmentApplicationSchema.index({ department: 1, status: 1 });
attachmentApplicationSchema.index({ county: 1, nearestTown: 1 });

// CORRECTED: Students apply in their FINAL year
// Level 4 courses = max 1 year, so apply in Year 1
// Level 5 courses = max 2 years, so apply in Year 2  
// Level 6 courses = max 3 years, so apply in Year 3
attachmentApplicationSchema.statics.canStudentApply = function(level, yearOfStudy) {
    if (level === 4 && yearOfStudy === 1) return true;  // Level 4: apply in final year (Year 1)
    if (level === 5 && yearOfStudy === 2) return true;  // Level 5: apply in final year (Year 2)
    if (level === 6 && yearOfStudy === 3) return true;  // Level 6: apply in final year (Year 3)
    return false;
};

module.exports = mongoose.model('AttachmentApplication', attachmentApplicationSchema);


