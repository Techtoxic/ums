const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { toDecimal128 } = require('../utils/formatters');
const { Payment, Student } = require('../db/models');
const { db, schema } = require('../db');
const { eq, desc } = require('drizzle-orm');

// Shape a joined payment row for the frontend. `studentId` is exposed as the
// ADMISSION NUMBER (the finance dashboard correlates payments to students by
// admission number), while the DB stores student_id as the student uuid.
function shapePaymentRow(r) {
    return {
        _id: r.id,
        id: r.id,
        studentId: r.admissionNumber,        // admission number for display/matching
        studentUuid: r.studentUuid,          // the real FK (uuid)
        amount: r.amount,
        paymentMode: r.paymentMode,
        bankName: r.bankName,
        referenceNumber: r.referenceNumber,
        reference: r.referenceNumber,
        recordedBy: r.recordedBy,
        paymentDate: r.paymentDate,
        createdAt: r.createdAt,
    };
}

const _paymentJoinFields = {
    id: schema.payments.id,
    studentUuid: schema.payments.student_id,
    admissionNumber: schema.students.admission_number,
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

        const payment = await Payment.create({
            studentId: student.id,
            amount: toDecimal128(amount), // SEV-H-016: store exact money
            paymentMode,
            bankName: bankName || null,
            referenceNumber,
            recordedBy: req.user.userId, // actor from the verified token
            paymentDate: paymentDate || new Date()
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
