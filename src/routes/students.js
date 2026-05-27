const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const { generateStudentInitialPassword, generateIntakeCode } = require('../utils/studentHelpers');
const { escapeRegex } = require('../utils/validators');
const { formatCourseNameServer, toMoneyNumber } = require('../utils/formatters');
const { Student, Program } = require('../db/models');
const EmailService = require('../utils/emailService');

// Own email-service instance. Mirror server.js's try/catch stub so requiring
// this module can never crash on load if the constructor throws.
let emailService;
try {
    emailService = new EmailService();
} catch (err) {
    console.error('Email service failed to initialize:', err.message);
    // Create stub for build phase
    emailService = {
        sendOTPEmail: async () => console.log('Email stub: sendOTPEmail'),
        sendResetLinkEmail: async () => console.log('Email stub: sendResetLinkEmail'),
        sendPassword: async () => console.log('Email stub: sendPassword'),
        sendStudentCredentials: async () => console.log('Email stub: sendStudentCredentials')
    };
}

// Registration Endpoint
router.post('/students/register', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { name, idNumber, kcseGrade, admissionNumber, course, department, phoneNumber, year, intake, intakeYear, admissionType, email } = req.body;

        const normalizedPhone = phoneNumber.replace(/\D/g, '');

        if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(normalizedPhone)) {
            return res.status(400).json({
                message: 'Invalid phone number format. Please enter a valid Kenyan phone number'
            });
        }

        const formattedPhone = normalizedPhone.length === 12 ? '0' + normalizedPhone.slice(-9) :
                              normalizedPhone.length === 13 ? '0' + normalizedPhone.slice(-9) :
                              normalizedPhone;

        const existingIdNumber = await Student.findOne({ idNumber });
        const existingPhone = await Student.findOne({ phoneNumber: formattedPhone });
        const existingAdmission = await Student.findOne({ admissionNumber });

        if (existingIdNumber) {
            return res.status(400).json({
                message: 'A student with this ID number already exists'
            });
        }
        if (existingPhone) {
            return res.status(400).json({
                message: 'A student with this phone number already exists'
            });
        }
        if (existingAdmission) {
            return res.status(400).json({
                message: 'A student with this admission number already exists'
            });
        }

        // SEV-H-014: never use the phone number as the credential. Generate a
        // strong random one-time password; the pre-save hook hashes it.
        const initialPassword = generateStudentInitialPassword();

        const student = new Student({
            name,
            idNumber,
            kcseGrade,
            admissionNumber,
            course,
            department,
            year: year || 1,
            intake: intake || 'september',
            intakeYear: intakeYear || new Date().getFullYear(),
            phoneNumber: formattedPhone,
            email: email ? String(email).toLowerCase() : undefined,
            admissionType: admissionType || 'walk-in',  // Default to walk-in if not provided
            password: initialPassword,  // hashed by the pre-save hook
            isFirstLogin: true,
            mustUpdatePassword: true,
            role: 'student'
        });

        await student.save();

        // SEV-H-014: deliver the one-time password out-of-band via email.
        let credentialsEmailed = false;
        if (student.email) {
            try {
                await emailService.sendStudentCredentials(
                    student.email, student.name, student.admissionNumber, initialPassword
                );
                credentialsEmailed = true;
            } catch (mailErr) {
                console.error('Failed to send student credentials email:', mailErr.message);
            }
        }

        // Prepare admission letter data
        const admissionLetterData = {
            name: student.name,
            admissionNumber: student.admissionNumber,
            course: student.course,
            department: student.department,
            intakeYear: student.intakeYear,
            phoneNumber: student.phoneNumber,
            intake: student.intake
        };

        // SEV-H-014: if the student has no email on file (or delivery failed),
        // return the one-time password ONCE so the registrar can hand it over
        // securely. When it was emailed, never echo it back.
        const response = {
            message: credentialsEmailed
                ? 'Student registered successfully. Initial password emailed to the student.'
                : 'Student registered successfully. No email on file — give the student the initial password below; they must change it on first login.',
            student: {
                name: student.name,
                admissionNumber: student.admissionNumber,
                course: student.course
            },
            credentialsEmailed,
            admissionLetter: admissionLetterData,
            showAdmissionLetter: true
        };
        if (!credentialsEmailed) {
            response.initialPassword = initialPassword;
        }
        res.status(201).json(response);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error registering student' });
    }
});

// Get students by department (for HOD)
router.get('/students/department/:department', verifyToken, authorize('admin', 'registrar', 'hod', 'dean'), async (req, res) => {
    try {
        const { department } = req.params;
        const rows = await db
            .select({
                _id: schema.students.id,
                name: schema.students.name,
                admissionNumber: schema.students.admission_number,
                course: schema.students.course,
                intake: schema.students.intake,
                year: schema.students.year,
                email: schema.students.email,
                phone: schema.students.phone_number,
            })
            .from(schema.students)
            .where(and(
                eq(schema.students.department, department),
                isNull(schema.students.deleted_at),
            ))
            .orderBy(schema.students.course, schema.students.name);
        // Group by course code. courseStats matches V1 shape so the HOD
        // dashboard's existing rendering code keeps working unchanged.
        const studentsByCourse = {};
        const courseStats = {};
        for (const s of rows) {
            const code = s.course;
            if (!studentsByCourse[code]) studentsByCourse[code] = [];
            studentsByCourse[code].push(s);
        }
        for (const code of Object.keys(studentsByCourse)) {
            courseStats[code] = {
                totalStudents: studentsByCourse[code].length,
                courseName: formatCourseNameServer ? formatCourseNameServer(code) : code,
            };
        }
        res.json({
            students: studentsByCourse,
            courseStats,
            totalStudents: rows.length,
            totalCourses: Object.keys(studentsByCourse).length,
        });
    } catch (error) {
        console.error('Error fetching department students:', error);
        res.status(500).json({ message: 'Failed to fetch department students' });
    }
});

// Get Latest Admission Number Endpoint with Intake Support
router.get('/students/latest-admission/:courseCode/:intake/:intakeYear', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { courseCode, intake, intakeYear } = req.params;

        // Generate intake code for this specific intake
        const intakeCode = generateIntakeCode(intake, parseInt(intakeYear));

        // Find latest admission number for this course and intake combination
        // SEV-H-019: courseCode comes from req.params; escape regex metachars.
        const latestStudent = await Student.findOne({
            admissionNumber: { $regex: `^${escapeRegex(courseCode)}/\\d{4}/${escapeRegex(intakeCode)}$` }
        }).sort({ admissionNumber: -1 });

        if (latestStudent) {
            res.json({
                latestNumber: latestStudent.admissionNumber,
                intakeCode: intakeCode
            });
        } else {
            res.json({
                latestNumber: null,
                intakeCode: intakeCode
            });
        }
    } catch (error) {
        console.error('Error fetching latest admission number:', error);
        res.status(500).json({ message: 'Error fetching latest admission number' });
    }
});

// Legacy endpoint for backward compatibility
router.get('/students/latest-admission/:courseCode', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { courseCode } = req.params;

        // Default to current September intake
        const currentYear = new Date().getFullYear();
        const defaultIntake = 'september';
        const intakeCode = generateIntakeCode(defaultIntake, currentYear);

        // SEV-H-019: courseCode comes from req.params; escape regex metachars.
        const latestStudent = await Student.findOne({
            admissionNumber: { $regex: `^${escapeRegex(courseCode)}/\\d{4}/${escapeRegex(intakeCode)}$` }
        }).sort({ admissionNumber: -1 });

        if (latestStudent) {
        res.json({
                latestNumber: latestStudent.admissionNumber,
                intakeCode: intakeCode
            });
        } else {
            res.json({
                latestNumber: null,
                intakeCode: intakeCode
            });
        }
    } catch (error) {
        console.error('Error fetching latest admission number:', error);
        res.status(500).json({ message: 'Error fetching latest admission number' });
    }
});

// Get All Students Endpoint - PROTECTED (Admin/Registrar only)
router.get('/students', verifyToken, authorize('admin', 'registrar', 'dean', 'finance', 'deputy'), async (req, res) => {
    try {
        const students = await Student.find({}, { password: 0 });
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Error fetching students' });
    }
});

// Update student
router.patch('/students/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Handle year promotion with balance update
        if (updates.year !== undefined) {
            // Get the current student to check if year is actually changing (promotion)
            const currentStudent = await Student.findById(id);

            if (currentStudent) {
                console.log(`Checking promotion: Current Year=${currentStudent.year}, New Year=${updates.year}, Course=${currentStudent.course}`);

                if (currentStudent.year !== updates.year) {
                    // Student is being promoted to a new year
                    console.log(`Student ${currentStudent.admissionNumber} is being promoted from Year ${currentStudent.year} to Year ${updates.year}`);

                    // Map course code to program name
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
                        'hospitality_management_5': 'Hospitality Management Level 5',
                        'hospitality_management_6': 'Hospitality Management Level 6',
                        'food_beverage_production_management_5': 'Food & Beverage Production Management Level 5',
                        'food_beverage_production_management_6': 'Food & Beverage Production Management Level 6',
                        'business_management_6': 'Business Management Level 6',
                        'supply_chain_management_6': 'Supply Chain Management Level 6',
                        'human_resource_management_6': 'Human Resource Management Level 6',
                        'journalism_mass_communication_6': 'Journalism & Mass Communication Level 6',
                        'information_communication_technology_6': 'Information Communication Technology Level 6',
                        'information_technology_5': 'Information Technology Level 5',
                        'computer_science_6': 'Computer Science Level 6'
                    };

                    const programName = courseToProgram[currentStudent.course];
                    console.log(`Looking for program: ${programName} for course: ${currentStudent.course}`);

                    // Get the program cost for their course
                    const program = programName ? await Program.findOne({ programName }) : null;

                    if (program) {
                        const programCostNum = toMoneyNumber(program.programCost); // SEV-H-016
                        console.log(`Program found: ${program.name}, Cost: KES ${programCostNum}`);

                        if (programCostNum > 0) {
                            // SEV-H-016 TODO: `balance` is NOT a field on the Student
                            // schema, so this write is dropped by Drizzle strict mode
                            // and is not persisted today. A correct fix (a Decimal128
                            // Student.balance updated via an atomic $inc inside a
                            // replica-set transaction) needs a data-model decision and
                            // is deferred to Stage 3 — see STAGE2A_REPORT.md.
                            const existingBalance = toMoneyNumber(currentStudent.balance || 0);
                            const newBalance = existingBalance + programCostNum;
                            updates.balance = newBalance;

                            console.log(`Adding program cost KES ${programCostNum.toLocaleString()} to existing balance KES ${existingBalance.toLocaleString()}`);
                            console.log(`New balance will be: KES ${newBalance.toLocaleString()}`);
                        } else {
                            console.warn(`Program cost is not set or is zero for ${program.name}`);
                        }
                    } else {
                        console.warn(`Program not found for course: ${currentStudent.course} (mapped to: ${programName})`);
                    }
                } else {
                    console.log(`Year not changed (both are ${updates.year}), no balance update needed`);
                }
            }
        }

        const student = await Student.findByIdAndUpdate(id, updates, { new: true });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json(student);
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ message: 'Error updating student' });
    }
});

// Export Students by Admission Type
router.get('/students/export/:admissionType', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { admissionType } = req.params;

        // Validate admission type
        if (!['walk-in', 'KUCCPS'].includes(admissionType)) {
            return res.status(400).json({ message: 'Invalid admission type. Must be walk-in or KUCCPS' });
        }

        const students = await Student.find(
            { admissionType: admissionType },
            { password: 0 }
        ).sort({ createdAt: -1 });

        // Format data for export
        const exportData = students.map(student => ({
            'Admission Number': student.admissionNumber,
            'Full Name': student.name,
            'ID Number': student.idNumber,
            'KCSE Grade': student.kcseGrade,
            'Course': student.course,
            'Department': student.department,
            'Year of Study': student.year,
            'Intake': student.intake,
            'Intake Year': student.intakeYear,
            'Admission Type': student.admissionType,
            'Phone Number': student.phoneNumber,
            'Registration Date': new Date(student.createdAt).toLocaleDateString()
        }));

        res.json({
            success: true,
            data: exportData,
            count: students.length,
            admissionType: admissionType
        });
    } catch (error) {
        console.error('Error exporting students:', error);
        res.status(500).json({ message: 'Error exporting students' });
    }
});

module.exports = router;
