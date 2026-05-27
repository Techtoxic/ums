const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { toMoneyNumber } = require('../utils/formatters');
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

        // Get program cost using the same mapping as frontend
        const courseToProgram = {
            'applied_biology_6': 'Applied Biology Level 6',
            'analytical_chemistry_6': 'Analytical Chemistry Level 6',
            'science_lab_technology_5': 'Science Lab Technology Level 5',
            'science_laboratory_technology_5': 'Science Lab Technology Level 5',
            'general_agriculture_4': 'General Agriculture Level 4',
            'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
            'building_construction_4': 'Building Construction Level 4',
            'building_construction_5': 'Building Construction Level 5',
            'plumbing_4': 'Plumbing Level 4',
            'plumbing_5': 'Plumbing Level 5',
            'electrical_engineering_4': 'Electrical Engineering Level 4',
            'electrical_engineering_5': 'Electrical Engineering Level 5',
            'electrical_engineering_6': 'Electrical Engineering Level 6',
            'automotive_engineering_5': 'Automotive Engineering Level 5',
            'automotive_engineering_6': 'Automotive Engineering Level 6',
            'food_beverage_4': 'Food and Beverage Level 4',
            'food_beverage_5': 'Food & Beverage Level 5',
            'food_beverage_6': 'Food & Beverage Level 6',
            'hospitality_management_4': 'Hospitality Management Level 4',
            'hospitality_management_5': 'Hospitality Management Level 5',
            'hospitality_management_6': 'Hospitality Management Level 6',
            'business_administration_4': 'Business Administration Level 4',
            'business_administration_5': 'Business Administration Level 5',
            'business_administration_6': 'Business Administration Level 6',
            'liberal_studies_4': 'Liberal Studies Level 4',
            'liberal_studies_5': 'Liberal Studies Level 5',
            'liberal_studies_6': 'Liberal Studies Level 6',
            'computing_informatics_4': 'Computing & Informatics Level 4',
            'computing_informatics_5': 'Computing & Informatics Level 5',
            'computing_informatics_6': 'Computing & Informatics Level 6'
        };

        const programName = courseToProgram[student.course];
        const program = programName ? await Program.findOne({ programName: programName }) : null;
        const totalFees = program ? toMoneyNumber(program.programCost) : 67189; // SEV-H-016: numeric for comparison

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

        // Get program cost using the same mapping as frontend
        const courseToProgram = {
            'applied_biology_6': 'Applied Biology Level 6',
            'analytical_chemistry_6': 'Analytical Chemistry Level 6',
            'science_lab_technology_5': 'Science Lab Technology Level 5',
            'science_laboratory_technology_5': 'Science Lab Technology Level 5',
            'general_agriculture_4': 'General Agriculture Level 4',
            'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
            'building_construction_4': 'Building Construction Level 4',
            'building_construction_5': 'Building Construction Level 5',
            'plumbing_4': 'Plumbing Level 4',
            'plumbing_5': 'Plumbing Level 5',
            'electrical_engineering_4': 'Electrical Engineering Level 4',
            'electrical_engineering_5': 'Electrical Engineering Level 5',
            'electrical_engineering_6': 'Electrical Engineering Level 6',
            'automotive_engineering_5': 'Automotive Engineering Level 5',
            'automotive_engineering_6': 'Automotive Engineering Level 6',
            'food_beverage_4': 'Food and Beverage Level 4',
            'food_beverage_5': 'Food & Beverage Level 5',
            'food_beverage_6': 'Food & Beverage Level 6',
            'hospitality_management_4': 'Hospitality Management Level 4',
            'hospitality_management_5': 'Hospitality Management Level 5',
            'hospitality_management_6': 'Hospitality Management Level 6',
            'business_administration_4': 'Business Administration Level 4',
            'business_administration_5': 'Business Administration Level 5',
            'business_administration_6': 'Business Administration Level 6',
            'liberal_studies_4': 'Liberal Studies Level 4',
            'liberal_studies_5': 'Liberal Studies Level 5',
            'liberal_studies_6': 'Liberal Studies Level 6',
            'computing_informatics_4': 'Computing & Informatics Level 4',
            'computing_informatics_5': 'Computing & Informatics Level 5',
            'computing_informatics_6': 'Computing & Informatics Level 6'
        };

        const programName = courseToProgram[student.course];
        const program = programName ? await Program.findOne({ programName: programName }) : null;
        const totalFees = program ? toMoneyNumber(program.programCost) : 67189; // SEV-H-016: numeric for comparison

        const outstandingBalance = totalFees - paidAmount;

        console.log('Backend register-units balance calculation:', {
            studentId,
            studentCourse: student.course,
            programName: programName,
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
