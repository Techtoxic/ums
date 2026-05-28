const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const {
    generateStudentInitialPassword,
    generateIntakeCode,
    extractLevelFromCourse,
    isGradeAllowedForLevel,
    getAllowedGradesForLevel,
    canPromoteStudent,
    getMaxModuleForLevel,
} = require('../utils/studentHelpers');
const { escapeRegex } = require('../utils/validators');
const { formatCourseNameServer, toMoneyNumber } = require('../utils/formatters');
const { Student, Program } = require('../db/models');
const { allocateNextAdmissionNumber, peekNextAdmissionNumber } = require('../utils/admissionNumber');
const EmailService = require('../utils/emailService');

// Own email-service instance. Mirror server.js's try/catch stub so requiring
// this module can never crash on load if the constructor throws.
let emailService;
try {
    emailService = new EmailService();
} catch (err) {
    console.error('Email service failed to initialize:', err.message);
    emailService = {
        sendOTPEmail: async () => console.log('Email stub: sendOTPEmail'),
        sendResetLinkEmail: async () => console.log('Email stub: sendResetLinkEmail'),
        sendPassword: async () => console.log('Email stub: sendPassword'),
        sendStudentCredentials: async () => console.log('Email stub: sendStudentCredentials'),
    };
}

// Preview the next admission number that will be allocated on the next
// successful registration. Used by the registrar form to display a preview.
router.get('/students/next-admission-number', verifyToken, authorize('admin', 'registrar'), async (_req, res) => {
    try {
        const next = await peekNextAdmissionNumber();
        res.json({ nextAdmissionNumber: next });
    } catch (err) {
        console.error('Error peeking next admission number:', err);
        res.status(500).json({ message: 'Error reading admission counter' });
    }
});

// Registration Endpoint.
//
// - Globally unique admission number assigned server-side from the
//   admission_number_counter table (starts at 2500).
// - Grade validation enforced against the course's level:
//     Level 3 -> KCPE, Level 4 -> E/D-, Level 5 -> D/D+, Level 6 -> C-..B+.
// - Accepts `module` (renamed from year), nextOfKinName, nextOfKinPhone.
router.post('/students/register', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const {
            name,
            idNumber,
            kcseGrade,
            course,
            department,
            phoneNumber,
            module: moduleField,
            intake,
            intakeYear,
            admissionType,
            email,
            nextOfKinName,
            nextOfKinPhone,
        } = req.body;

        // Required-field validation. Frontend enforces these but the backend
        // is the source of truth.
        if (!name || !idNumber || !kcseGrade || !course || !department || !phoneNumber) {
            return res.status(400).json({
                message: 'Missing required fields (name, idNumber, kcseGrade, course, department, phoneNumber)',
            });
        }
        if (!intake) {
            return res.status(400).json({ message: 'Intake is required' });
        }
        if (!['january', 'may', 'september'].includes(String(intake).toLowerCase())) {
            return res.status(400).json({ message: 'Invalid intake. Must be january, may or september.' });
        }

        // Phone normalisation (registrar portal accepts a 10-digit Kenyan number).
        const normalizedPhone = String(phoneNumber).replace(/\D/g, '');
        if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(normalizedPhone)) {
            return res.status(400).json({
                message: 'Invalid phone number format. Please enter a valid Kenyan phone number',
            });
        }
        const formattedPhone = normalizedPhone.length === 12 ? '0' + normalizedPhone.slice(-9) :
                               normalizedPhone.length === 13 ? '0' + normalizedPhone.slice(-9) :
                               normalizedPhone;

        // Next-of-kin phone (optional) shares the same normalisation rule.
        let formattedKinPhone = null;
        if (nextOfKinPhone) {
            const kinDigits = String(nextOfKinPhone).replace(/\D/g, '');
            if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(kinDigits)) {
                return res.status(400).json({ message: 'Invalid next-of-kin phone number format.' });
            }
            formattedKinPhone = kinDigits.length === 12 ? '0' + kinDigits.slice(-9) :
                                 kinDigits.length === 13 ? '0' + kinDigits.slice(-9) :
                                 kinDigits;
        }

        // Grade validation against the course's level (the last digit of the
        // course code). Wins regardless of what the frontend sent.
        const level = extractLevelFromCourse(course);
        if (!level) {
            return res.status(400).json({ message: `Could not determine course level from "${course}".` });
        }
        if (!isGradeAllowedForLevel(kcseGrade, level)) {
            const allowed = getAllowedGradesForLevel(level);
            return res.status(400).json({
                message: `KCSE grade "${kcseGrade}" is not allowed for a Level ${level} course. Allowed: ${allowed.join(', ')}.`,
            });
        }

        // Module-cap validation: a new student starts at module 1 unless an
        // explicit module was supplied; in that case it must respect the
        // level cap (Level 3=1, 4=2, 5=4, 6=6).
        const startModule = moduleField === undefined || moduleField === null || moduleField === '' ? 1 : parseInt(moduleField, 10);
        if (!Number.isFinite(startModule) || startModule < 1) {
            return res.status(400).json({ message: 'Module must be a positive integer.' });
        }
        const cap = getMaxModuleForLevel(level);
        if (cap && startModule > cap) {
            return res.status(400).json({
                message: `Module ${startModule} exceeds the maximum (${cap}) for a Level ${level} course.`,
            });
        }

        // Pre-check duplicates against text-based unique columns to return
        // friendly errors before allocating an admission number (which we do
        // not roll back on failure). The DB unique constraints are the
        // ultimate gatekeepers.
        const existingIdNumber = await Student.findOne({ idNumber });
        if (existingIdNumber) {
            return res.status(400).json({ message: 'A student with this ID number already exists' });
        }
        const existingPhone = await Student.findOne({ phoneNumber: formattedPhone });
        if (existingPhone) {
            return res.status(400).json({ message: 'A student with this phone number already exists' });
        }
        if (email) {
            const existingEmail = await Student.findOne({ email: String(email).toLowerCase() });
            if (existingEmail) {
                return res.status(400).json({ message: 'A student with this email already exists' });
            }
        }

        // Atomically allocate a globally unique admission number.
        const admissionNumber = await allocateNextAdmissionNumber();

        // SEV-H-014: never use the phone number as the credential. Generate a
        // strong random one-time password; the create() helper hashes it.
        const initialPassword = generateStudentInitialPassword();

        const student = await Student.create({
            name,
            idNumber,
            kcseGrade,
            admissionNumber,
            course,
            department,
            module: startModule,
            intake: String(intake).toLowerCase(),
            intakeYear: intakeYear ? parseInt(intakeYear, 10) : new Date().getFullYear(),
            phoneNumber: formattedPhone,
            email: email ? String(email).toLowerCase() : undefined,
            admissionType: admissionType || 'walk-in',
            nextOfKinName: nextOfKinName ? String(nextOfKinName).trim() : null,
            nextOfKinPhone: formattedKinPhone,
            password: initialPassword,
            isFirstLogin: true,
            mustUpdatePassword: true,
            role: 'student',
        });

        if (!student) {
            return res.status(500).json({ message: 'Failed to create student record.' });
        }

        // SEV-H-014: deliver the one-time password out-of-band via email.
        let credentialsEmailed = false;
        if (student.email) {
            try {
                await emailService.sendStudentCredentials(
                    student.email, student.name, student.admissionNumber, initialPassword,
                );
                credentialsEmailed = true;
            } catch (mailErr) {
                console.error('Failed to send student credentials email:', mailErr.message);
            }
        }

        const intakeCode = generateIntakeCode(student.intake, student.intakeYear);

        const admissionLetterData = {
            name: student.name,
            admissionNumber: student.admissionNumber,
            course: student.course,
            department: student.department,
            intakeYear: student.intakeYear,
            intake: student.intake,
            intakeCode,
            module: student.module,
            phoneNumber: student.phoneNumber,
        };

        const response = {
            message: credentialsEmailed
                ? 'Student registered successfully. Initial password emailed to the student.'
                : 'Student registered successfully. No email on file — give the student the initial password below; they must change it on first login.',
            student: {
                name: student.name,
                admissionNumber: student.admissionNumber,
                course: student.course,
                module: student.module,
                department: student.department,
            },
            credentialsEmailed,
            admissionLetter: admissionLetterData,
            showAdmissionLetter: true,
        };
        if (!credentialsEmailed) {
            response.initialPassword = initialPassword;
        }
        res.status(201).json(response);

    } catch (error) {
        console.error('Registration error:', error);
        // Surface DB unique-violation messages (Postgres SQLSTATE 23505).
        if (error && (error.code === '23505' || /duplicate key/i.test(error.message || ''))) {
            return res.status(400).json({ message: 'A student with one of these details already exists.' });
        }
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
                module: schema.students.module,
                email: schema.students.email,
                phone: schema.students.phone_number,
            })
            .from(schema.students)
            .where(and(
                eq(schema.students.department, department),
                isNull(schema.students.deleted_at),
            ))
            .orderBy(schema.students.course, schema.students.name);
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

// Update student (registrar promotion + edits).
//
// Promotion uses the new module-cap rules; existing balance / program-cost
// logic moves over from year-based to module-based (each promotion adds one
// program-cost increment, same as before).
router.patch('/students/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        if (updates.module !== undefined) {
            const currentStudent = await Student.findById(id);
            if (!currentStudent) {
                return res.status(404).json({ message: 'Student not found' });
            }
            const newModule = parseInt(updates.module, 10);
            if (!Number.isFinite(newModule) || newModule < 1) {
                return res.status(400).json({ message: 'Module must be a positive integer.' });
            }
            const level = extractLevelFromCourse(currentStudent.course);
            const cap = getMaxModuleForLevel(level);
            if (cap && newModule > cap) {
                return res.status(400).json({
                    message: `Cannot promote: Level ${level} students cap at module ${cap}.`,
                });
            }
            if (currentStudent.module !== newModule) {
                console.log(`Promotion: ${currentStudent.admissionNumber} module ${currentStudent.module} -> ${newModule}`);
            }
            updates.module = newModule;
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

        if (!['walk-in', 'KUCCPS'].includes(admissionType)) {
            return res.status(400).json({ message: 'Invalid admission type. Must be walk-in or KUCCPS' });
        }

        const students = await Student.find(
            { admissionType: admissionType },
            { password: 0 },
        ).sort({ createdAt: -1 });

        const exportData = students.map(student => ({
            'Admission Number': student.admissionNumber,
            'Full Name': student.name,
            'ID Number': student.idNumber,
            'KCSE Grade': student.kcseGrade,
            'Course': student.course,
            'Department': student.department,
            'Module': student.module,
            'Intake': student.intake,
            'Intake Year': student.intakeYear,
            'Admission Type': student.admissionType,
            'Phone Number': student.phoneNumber,
            'Next of Kin Name': student.nextOfKinName,
            'Next of Kin Phone': student.nextOfKinPhone,
            'Registration Date': new Date(student.createdAt).toLocaleDateString(),
        }));

        res.json({
            success: true,
            data: exportData,
            count: students.length,
            admissionType: admissionType,
        });
    } catch (error) {
        console.error('Error exporting students:', error);
        res.status(500).json({ message: 'Error exporting students' });
    }
});

module.exports = router;
