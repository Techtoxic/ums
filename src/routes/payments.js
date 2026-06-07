const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { toDecimal128 } = require('../utils/formatters');
const { Payment, Student } = require('../db/models');
const { db, schema } = require('../db');
const { eq, and, desc } = require('drizzle-orm');
const { getCourseDisplayName, getDepartmentDisplayName } = require('../utils/courseCodes');
const { getCurrentAcademicYearLabel } = require('../utils/academicPeriod');

// Shape a joined payment row for the frontend. `studentId` is exposed as the
// ADMISSION NUMBER (the finance dashboard correlates payments to students by
// admission number), while the DB stores student_id as the student uuid.
//
// Each row is enriched with the student's course/department/module and the
// academic year of the payment so receipts can render those fields directly
// (the receipt PDF no longer depends on a second /students fetch — that fetch
// was being blocked for the finance role, leaving Department/Program as "N/A").
function shapePaymentRow(r) {
    return {
        _id: r.id,
        id: r.id,
        studentId: r.admissionNumber,        // admission number for display/matching
        studentUuid: r.studentUuid,          // the real FK (uuid)
        studentName: r.studentName,
        course: r.course,
        courseName: getCourseDisplayName(r.course),
        department: r.department,
        departmentName: getDepartmentDisplayName(r.department),
        module: r.module,
        intake: r.intake,
        intakeYear: r.intakeYear,
        amount: r.amount,
        paymentMode: r.paymentMode,
        bankName: r.bankName,
        referenceNumber: r.referenceNumber,
        reference: r.referenceNumber,
        recordedBy: r.recordedBy,
        paymentDate: r.paymentDate,
        academicYear: getCurrentAcademicYearLabel(r.paymentDate ? new Date(r.paymentDate) : new Date()),
        createdAt: r.createdAt,
    };
}

const _paymentJoinFields = {
    id: schema.payments.id,
    studentUuid: schema.payments.student_id,
    admissionNumber: schema.students.admission_number,
    studentName: schema.students.name,
    course: schema.students.course,
    department: schema.students.department,
    module: schema.students.module,
    intake: schema.students.intake,
    intakeYear: schema.students.intake_year,
    amount: schema.payments.amount,
    paymentMode: schema.payments.payment_mode,
    bankName: schema.payments.bank_name,
    referenceNumber: schema.payments.reference_number,
    recordedBy: schema.payments.recorded_by,
    paymentDate: schema.payments.payment_date,
    createdAt: schema.payments.created_at,
};

// Create a new payment
router.post('/payments', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const {
            studentId,
            amount,
            paymentMode,
            bankName,
            receiptNumber,
            mpesaTransactionId,
            bursaryReference,
            reference,
            paymentDate
        } = req.body;

        console.log('Processing payment:', { studentId, amount, paymentMode, reference });

        if (!studentId || !amount || !paymentMode || !reference) {
            return res.status(400).json({ message: 'Please provide all required payment details' });
        }

        // Validate amount: must be a positive, finite, sane number (guards against
        // negative/NaN/overflow values corrupting balances).
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0 || amt > 100000000) {
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        // Validate payment mode specific details
        if (paymentMode === 'bank' && (!bankName || !receiptNumber)) {
            return res.status(400).json({ message: 'Bank name and receipt number are required for bank transfers' });
        }

        if (paymentMode === 'mpesa' && !mpesaTransactionId) {
            return res.status(400).json({ message: 'M-Pesa transaction ID is required for M-Pesa payments' });
        }

        if (paymentMode === 'bursary' && !bursaryReference) {
            return res.status(400).json({ message: 'Bursary reference is required for bursary payments' });
        }

        // studentId arrives as an ADMISSION NUMBER (e.g. "AC6/0001/S25"); resolve
        // it to the student uuid before writing the student_id uuid column.
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // The payments table has a single reference_number column (no per-mode
        // columns), so fold the mode-specific reference into it.
        const referenceNumber = receiptNumber || mpesaTransactionId || bursaryReference || reference;

        // Double-submission / replay guard: reject a payment that re-uses the same
        // reference for the same student + mode (double-click, retry, replay).
        const dup = await db
            .select({ id: schema.payments.id })
            .from(schema.payments)
            .where(and(
                eq(schema.payments.student_id, student.id),
                eq(schema.payments.reference_number, referenceNumber),
                eq(schema.payments.payment_mode, paymentMode),
            ))
            .limit(1);
        if (dup.length) {
            return res.status(409).json({ message: 'A payment with this reference has already been recorded for this student.' });
        }

        const payment = await Payment.create({
            studentId: student.id,
            amount: toDecimal128(amount), // SEV-H-016: store exact money
            paymentMode,
            bankName: bankName || null,
            referenceNumber,
            recordedBy: req.user.userId, // actor from the verified token
            // The client sends an ISO string; Drizzle's timestamp column needs a
            // Date object (it calls .toISOString() on the value), so coerce it.
            paymentDate: paymentDate ? new Date(paymentDate) : new Date()
        });

        console.log('Payment saved successfully:', payment._id);

        res.status(201).json({
            message: 'Payment recorded successfully',
            payment
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            console.error('Payment validation error:', messages);
            return res.status(400).json({ message: messages.join(', ') });
        }

        console.error('Error recording payment:', error);
        res.status(500).json({ message: 'Error recording payment' });
    }
});

// Get all payments - PROTECTED (Finance/Admin only)
router.get('/payments', verifyToken, authorize('admin', 'finance', 'registrar'), async (req, res) => {
    try {
        const rows = await db.select(_paymentJoinFields)
            .from(schema.payments)
            .leftJoin(schema.students, eq(schema.students.id, schema.payments.student_id))
            .orderBy(desc(schema.payments.payment_date));
        res.json(rows.map(shapePaymentRow));
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Error fetching payments' });
    }
});

// Get payments for a specific student
router.get('/payments/student/:studentId', verifyToken, authorize('admin', 'finance', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const student = await Student.findOne({ admissionNumber: req.params.studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        const rows = await db.select(_paymentJoinFields)
            .from(schema.payments)
            .leftJoin(schema.students, eq(schema.students.id, schema.payments.student_id))
            .where(eq(schema.payments.student_id, student.id))
            .orderBy(desc(schema.payments.payment_date));
        res.json(rows.map(shapePaymentRow));
    } catch (error) {
        console.error('Error fetching student payments:', error);
        res.status(500).json({ message: 'Error fetching student payments' });
    }
});

module.exports = router;
