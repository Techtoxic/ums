const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { toMoneyNumber } = require('../utils/formatters');
const { getFeePerModule } = require('../utils/studentHelpers');
const { Student, Payment, Program, Unit, CommonUnit, SystemSettings, StudentUnitRegistration } = require('../db/models');

// Check if student can register (fee threshold check) - MUST be before /:id route
router.get('/students/:studentId/can-register', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    console.log('CAN-REGISTER API called for student:', req.params.studentId);
    try {
        const { studentId } = req.params;

        // Get fee threshold
        const feeThreshold = await SystemSettings.getSetting('fee_threshold', 50000);

        // Find student
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Calculate outstanding balance using the same method as the dashboard
        const payments = await Payment.find({ studentId: student.id }).sort({ date: -1 });
        const paidAmount = payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0); // SEV-H-016

        // Program cost is looked up directly from the DB by course CODE
        // (student.course holds the program code, e.g. 'AC6'). No hardcoded map.
        const program = student.course ? await Program.findOne({ code: String(student.course).toUpperCase() }) : null;
        // Students are billed per module: gate on the current module's fee
        // (annual program_cost / 3, rounded up), matching the student portal.
        const annualCost = program ? toMoneyNumber(program.programCost) : 67189;
        const totalFees = getFeePerModule(annualCost); // SEV-H-016: numeric for comparison

        const outstandingBalance = totalFees - paidAmount;
        const canRegister = outstandingBalance < feeThreshold;

        res.json({
            canRegister,
            outstandingBalance,
            feeThreshold,
            totalFees,
            paidAmount
        });

    } catch (error) {
        console.error('Error checking registration eligibility:', error);
        res.status(500).json({ message: 'Error checking registration eligibility' });
    }
});

// Get student's unit registrations
router.get('/students/:studentId/registrations', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { status = 'registered' } = req.query;

        const registrations = await StudentUnitRegistration.getStudentRegistrations(studentId, status);
        res.json(registrations);
    } catch (error) {
        console.error('Error fetching student registrations:', error);
        res.status(500).json({ message: 'Error fetching student registrations' });
    }
});

// Register student for units
router.post('/students/register-units', verifyToken, authorize('admin', 'registrar', 'student'), async (req, res) => {
    try {
        const { studentId } = req.body;
        const { unitIds, commonUnitIds, academicYear, semester } = req.body;

        // SEV-H-007: a student may only register units for themselves. studentId
        // here is an admission number; trust the verified token, not the body.
        if (!['admin', 'registrar'].includes(req.user.role)) {
            if (!studentId || String(studentId) !== String(req.user.admissionNumber)) {
                return res.status(403).json({ message: 'You can only register units for your own account.' });
            }
        }

        // Get fee threshold
        const feeThreshold = await SystemSettings.getSetting('fee_threshold', 50000);

        // Check student's outstanding balance (you'll need to implement this based on your payment system)
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Calculate outstanding balance using the same method as the dashboard
        const payments = await Payment.find({ studentId: student.id }).sort({ date: -1 });
        const paidAmount = payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0); // SEV-H-016

        // Program cost is looked up directly from the DB by course CODE
        // (student.course holds the program code, e.g. 'AC6'). No hardcoded map.
        const program = student.course ? await Program.findOne({ code: String(student.course).toUpperCase() }) : null;
        // Students are billed per module: gate on the current module's fee
        // (annual program_cost / 3, rounded up), matching the student portal.
        const annualCost = program ? toMoneyNumber(program.programCost) : 67189;
        const totalFees = getFeePerModule(annualCost); // SEV-H-016: numeric for comparison

        const outstandingBalance = totalFees - paidAmount;

        console.log('Backend register-units balance calculation:', {
            studentId,
            studentCourse: student.course,
            programName: program ? program.programName : null,
            programFound: !!program,
            actualProgramCost: toMoneyNumber(program?.programCost),
            finalProgramCost: totalFees,
            paidAmount,
            outstandingBalance,
            feeThreshold,
            paymentsCount: payments.length,
            canRegister: outstandingBalance < feeThreshold
        });

        // Check if student can register based on fee threshold
        if (outstandingBalance >= feeThreshold) {
            return res.status(400).json({
                message: `Cannot register units. Outstanding balance of ${outstandingBalance} exceeds threshold of ${feeThreshold}`,
                outstandingBalance,
                feeThreshold
            });
        }

        const registrations = [];
        const errors = [];

        // Register department units
        if (unitIds && unitIds.length > 0) {
            for (const unitId of unitIds) {
                try {
                    const unit = await Unit.findById(unitId);
                    if (!unit) {
                        errors.push(`Unit with ID ${unitId} not found`);
                        continue;
                    }

                    const registrationData = {
                        studentId,
                        unitId,
                        courseCode: unit.courseCode,
                        unitCode: unit.unitCode,
                        unitName: unit.unitName,
                        unitType: 'department',
                        academicYear,
                        semester
                    };

                    const registration = await StudentUnitRegistration.registerStudent(registrationData);
                    registrations.push(registration);
                } catch (error) {
                    errors.push(`Error registering unit ${unitId}: ${error.message}`);
                }
            }
        }

        // Register common units
        if (commonUnitIds && commonUnitIds.length > 0) {
            for (const commonUnitId of commonUnitIds) {
                try {
                    const commonUnit = await CommonUnit.findById(commonUnitId);
                    if (!commonUnit) {
                        errors.push(`Common unit with ID ${commonUnitId} not found`);
                        continue;
                    }

                    const registrationData = {
                        studentId,
                        unitId: commonUnitId,  // Use unitId instead of commonUnitId for consistency
                        courseCode: commonUnit.courseCode,
                        unitCode: commonUnit.unitCode,
                        unitName: commonUnit.unitName,
                        unitType: 'common',
                        academicYear,
                        semester
                    };

                    const registration = await StudentUnitRegistration.registerStudent(registrationData);
                    registrations.push(registration);
                } catch (error) {
                    errors.push(`Error registering common unit ${commonUnitId}: ${error.message}`);
                }
            }
        }

        res.json({
            message: `Successfully registered ${registrations.length} units`,
            registrations,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error registering student for units:', error);
        res.status(500).json({ message: 'Error registering student for units' });
    }
});

module.exports = router;
