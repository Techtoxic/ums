const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull, desc, inArray, sql } = require('drizzle-orm');
const { verifyToken, authorize, verifyOwnership, signToken, setAuthCookie, setCsrfCookie, generateCsrfToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { isValidId } = require('../utils/validators');
const userService = require('../services/userService');
const { Trainer } = require('../db/models');

// Trainer Authentication
router.post('/trainers/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const genericFail = { message: 'Invalid email or password' };

        // V2 Path B: direct Drizzle via userService.
        const emailLower = String(email).toLowerCase();
        const trainer = await userService.findActiveByEmail(emailLower);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(401).json(genericFail);
        }

        const isPasswordValid = await userService.comparePassword(trainer, password);
        if (!isPasswordValid) {
            return res.status(401).json(genericFail);
        }

        await userService.updateLastLogin(trainer.id);

        // Count of unit assignments for this trainer (one-off — doesn't warrant
        // a dedicated service function).
        const assignedUnitsCount = await db
            .select({ count: sql`count(*)::int` })
            .from(schema.trainerAssignments)
            .where(eq(schema.trainerAssignments.trainer_id, trainer.id))
            .then(rows => rows[0]?.count || 0);

        const token = signToken({
            userId: String(trainer.id),
            email: trainer.email,
            role: 'trainer',
            tokenVersion: trainer.token_version || 0 // SEV-H-013
        });

        setAuthCookie(res, token);
        setCsrfCookie(res, generateCsrfToken());
        res.json({
            message: 'Login successful',
            token,
            trainer: {
                _id: trainer.id,                          // V1-compat alias
                name: trainer.name,
                email: trainer.email,
                department: trainer.department,
                specialization: trainer.specialization || null,  // not in V2 users table
                assignedUnitsCount
            }
        });
    } catch (error) {
        console.error('Trainer login error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update trainer email
router.put('/trainers/:trainerId/email', verifyToken, authorize('admin', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Check if email already exists
        const existingTrainer = await Trainer.findOne({ email: email.toLowerCase(), _id: { $ne: trainerId } });
        if (existingTrainer) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Update trainer email
        const trainer = await Trainer.findByIdAndUpdate(
            trainerId,
            { email: email.toLowerCase(), updatedAt: new Date() },
            { new: true }
        );

        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }

        res.json({
            message: 'Email updated successfully',
            trainer: {
                _id: trainer._id,
                name: trainer.name,
                email: trainer.email,
                phone: trainer.phone,
                department: trainer.department,
                specialization: trainer.specialization
            }
        });
    } catch (error) {
        console.error('Error updating trainer email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get trainer assignments - Clean production version
router.get('/trainers/:trainerId/assignments', verifyToken, authorize('admin', 'hod', 'registrar', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;

        // Validate trainerId format
        if (!isValidId(trainerId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid trainer ID format'
            });
        }

        // Verify trainer exists
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({
                success: false,
                message: 'Trainer not found'
            });
        }

        // A trainer's assignments come ONLY from trainer_assignments. Common units
        // are assigned to a PROGRAM (common_unit_assignments has no trainer_id),
        // so there is no "common assignments by trainer" — that half is gone.
        // Join trainer_assignments → units (on unit_id), then units → programs
        // (for a course code / department-ish label). Exclude soft-deleted units.
        const conds = [
            eq(schema.trainerAssignments.trainer_id, trainerId),
            isNull(schema.units.deleted_at),
        ];
        // Optional narrowing by academic_year / semester when supplied as query
        // params; absent → all of the trainer's assignments (no settings lookup).
        const academicYear = req.query.academicYear;
        const semester = req.query.semester;
        if (academicYear !== undefined && academicYear !== '' && !Number.isNaN(Number(academicYear))) {
            conds.push(eq(schema.trainerAssignments.academic_year, Number(academicYear)));
        }
        if (semester !== undefined && semester !== '' && !Number.isNaN(Number(semester))) {
            conds.push(eq(schema.trainerAssignments.semester, Number(semester)));
        }

        const rows = await db
            .select({
                assignmentId: schema.trainerAssignments.id,
                academicYear: schema.trainerAssignments.academic_year,
                semester: schema.trainerAssignments.semester,
                hours: schema.trainerAssignments.hours,
                createdAt: schema.trainerAssignments.created_at,
                unitId: schema.units.id,
                unitCode: schema.units.code,
                unitName: schema.units.name,
                unitYear: schema.units.year,
                isCommon: schema.units.is_common,
                programCode: schema.programs.code,
                programName: schema.programs.name,
            })
            .from(schema.trainerAssignments)
            .innerJoin(schema.units, eq(schema.units.id, schema.trainerAssignments.unit_id))
            .leftJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
            .where(and(...conds))
            .orderBy(desc(schema.trainerAssignments.created_at));

        // Shape each row to what the trainer dashboard renders. The frontend
        // requires unitId.unitCode, unitId.unitName and a truthy status (else it
        // filters the card out), reads top-level courseCode for its course stat,
        // and renders unitId.level + the assignment createdAt date. There is no
        // status column in V2, so it is synthesized as 'active'. Real columns are
        // mapped to the legacy names: units.code→unitCode, units.name→unitName,
        // units.year→level, programs.code→courseCode, programs.name→department.
        const assignments = rows.map(r => ({
            _id: r.assignmentId,
            type: r.isCommon ? 'common' : 'department',
            status: 'active',
            courseCode: r.programCode || 'N/A',
            academicYear: r.academicYear,
            semester: r.semester,
            hours: r.hours,
            createdAt: r.createdAt,
            unitId: {
                id: r.unitId,
                _id: r.unitId,
                unitCode: r.unitCode,
                unitName: r.unitName,
                courseCode: r.programCode || 'N/A',
                level: r.unitYear,
                year: r.unitYear,
                isCommon: r.isCommon,
                department: r.programName || 'N/A',
            },
        }));

        console.log(`Fetched ${assignments.length} assignments for trainer ${trainer.name}`);

        res.json({
            success: true,
            count: assignments.length,
            assignments
        });
    } catch (error) {
        console.error('Error fetching trainer assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching assignments',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update trainer profile
router.put('/trainers/:trainerId/profile', verifyToken, authorize('admin', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { email, phone } = req.body;

        // Validate trainerId format
        if (!isValidId(trainerId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid trainer ID format'
            });
        }

        // Find trainer
        // SEV-C-005: load select:false password so the trainer.save() below
        // does not fail required-field validation on profile update.
        const trainer = await Trainer.findById(trainerId).select('+password');
        if (!trainer) {
            return res.status(404).json({
                success: false,
                message: 'Trainer not found'
            });
        }

        // Update fields if provided
        if (email && email !== trainer.email) {
            // Check if email is already in use
            const existingTrainer = await Trainer.findOne({ email: email, _id: { $ne: trainerId } });
            if (existingTrainer) {
                return res.status(400).json({
                    success: false,
                    message: 'Email address is already in use'
                });
            }
            trainer.email = email;
        }

        if (phone !== undefined) {
            trainer.phone = phone || null;
        }

        await trainer.save();

        console.log(`Updated profile for trainer: ${trainer.name}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            trainer: {
                _id: trainer._id,
                name: trainer.name,
                email: trainer.email,
                phone: trainer.phone,
                department: trainer.department,
                specialization: trainer.specialization
            }
        });

    } catch (error) {
        console.error('Error updating trainer profile:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while updating profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get students for trainer's assigned units/courses (only enrolled students)
router.get('/trainers/:trainerId/students', verifyToken, authorize('admin', 'hod', 'registrar', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;

        if (!isValidId(trainerId)) {
            return res.status(400).json({ message: 'Invalid trainer id' });
        }

        // A trainer's students = students registered in any unit the trainer is
        // assigned to. Path: trainer_assignments → unit_ids → unit_registrations
        // → student_ids → students. Common units are assigned to a PROGRAM
        // (common_unit_assignments has no trainer_id), so there is no
        // "common assignments by trainer" — a trainer's units come only from
        // trainer_assignments.

        // Optional narrowing by academic_year / semester when supplied as query
        // params; absent → all of the trainer's assignments (no settings lookup).
        const assignmentConds = [eq(schema.trainerAssignments.trainer_id, trainerId)];
        const academicYear = req.query.academicYear;
        const semester = req.query.semester;
        if (academicYear !== undefined && academicYear !== '' && !Number.isNaN(Number(academicYear))) {
            assignmentConds.push(eq(schema.trainerAssignments.academic_year, Number(academicYear)));
        }
        if (semester !== undefined && semester !== '' && !Number.isNaN(Number(semester))) {
            assignmentConds.push(eq(schema.trainerAssignments.semester, Number(semester)));
        }

        const assignmentRows = await db
            .select({ unitId: schema.trainerAssignments.unit_id })
            .from(schema.trainerAssignments)
            .where(and(...assignmentConds));

        const unitIds = [...new Set(assignmentRows.map(r => r.unitId))];
        if (unitIds.length === 0) {
            return res.json({ students: [], courseStats: {} });
        }

        // Students registered in any of those units.
        const registrationRows = await db
            .select({ studentId: schema.unitRegistrations.student_id })
            .from(schema.unitRegistrations)
            .where(inArray(schema.unitRegistrations.unit_id, unitIds));

        const studentIds = [...new Set(registrationRows.map(r => r.studentId))];
        if (studentIds.length === 0) {
            return res.json({ students: [], courseStats: {} });
        }

        // Fetch the enrolled students (unique by id via the studentIds set).
        const students = await db
            .select({
                id: schema.students.id,
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
                inArray(schema.students.id, studentIds),
                isNull(schema.students.deleted_at),
            ));

        // Group by course and count. The response preserves the existing
        // { students: { [course]: [...] }, courseStats: { [course]: count } }
        // shape that the trainer dashboard consumes (it flattens students by course).
        const studentsByCourse = {};
        const courseStats = {};
        for (const student of students) {
            const course = student.course;
            if (!studentsByCourse[course]) studentsByCourse[course] = [];
            studentsByCourse[course].push(student);
            courseStats[course] = (courseStats[course] || 0) + 1;
        }

        res.json({ students: studentsByCourse, courseStats });

    } catch (error) {
        console.error('Error fetching trainer students:', error);
        res.status(500).json({ message: 'Failed to fetch trainer students' });
    }
});

// Create a trainer (admin only). A trainer profile is intentionally minimal:
// name, department, phone, email. The account is seeded with a known default
// password and flagged is_first_login so the trainer is forced to set their own
// password (and verify email) on first sign-in.
const bcrypt = require('bcryptjs');
const DEFAULT_TRAINER_PASSWORD = 'trainer123';
router.post('/trainers', verifyToken, authorize('admin'), async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const department = (req.body.department || '').trim() || null;
        let phone = (req.body.phone || '').trim() || null;

        if (!name || !email) {
            return res.status(400).json({ message: 'Name and email are required' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        // Email must be unique across all users (any role).
        const existing = await userService.findByEmail(email);
        if (existing) {
            return res.status(409).json({ message: 'A user with that email already exists' });
        }

        const passwordHash = await bcrypt.hash(DEFAULT_TRAINER_PASSWORD, 12);
        const now = new Date();
        const rows = await db
            .insert(schema.users)
            .values({
                role: 'trainer',
                name,
                email,
                password: passwordHash,
                department,
                phone,
                is_active: true,
                is_first_login: true,
                must_update_password: true,
                created_at: now,
                updated_at: now,
            })
            .returning({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                department: schema.users.department,
                phone: schema.users.phone,
            });

        const trainer = rows[0];
        console.log(`Admin created trainer: ${trainer.name} (${trainer.email})`);
        res.status(201).json({
            success: true,
            message: 'Trainer added successfully',
            trainer,
            defaultPassword: DEFAULT_TRAINER_PASSWORD,
        });
    } catch (error) {
        console.error('Error creating trainer:', error);
        res.status(500).json({ message: 'Internal server error while creating trainer' });
    }
});

module.exports = router;
