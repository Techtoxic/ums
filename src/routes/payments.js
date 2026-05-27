const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { toDecimal128 } = require('../utils/formatters');
const { Payment, Student } = require('../db/models');

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

        const payment = new Payment({
            studentId,
            amount: toDecimal128(amount), // SEV-H-016: store exact money
            paymentMode,
            bankName,
            receiptNumber,
            mpesaTransactionId,
            bursaryReference,
            reference,
            paymentDate: paymentDate || new Date()
        });

        await payment.save();

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
        const payments = await Payment.find().sort({ paymentDate: -1 });
        res.json(payments);
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
        const payments = await Payment.find({ studentId: student.id }).sort({ paymentDate: -1 });
        res.json(payments);
    } catch (error) {
        console.error('Error fetching student payments:', error);
        res.status(500).json({ message: 'Error fetching student payments' });
    }
});

module.exports = router;
