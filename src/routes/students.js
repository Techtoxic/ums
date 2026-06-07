const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, or, ne, gt, gte, lt, lte, isNull, isNotNull, sql, desc, asc, ilike } = require('drizzle-orm');
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
const {
    getCourseCode,
    getCourseDisplayName,
    getDepartmentDisplayName,
} = require('../utils/courseCodes');
const { Student, Program } = require('../db/models');
const {
    peekNextAdmissionNumberFor,
    peekNextGlobalNumber,
    allocateAdmissionNumberFor,
} = require('../utils/admissionNumber');
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

// ---------------------------------------------------------------------------
// Shared pagination helper. Returns { page, limit, all } resolved from the
// query string with safe defaults. `limit=all` / `all=1` => no LIMIT applied.
// ---------------------------------------------------------------------------
function parsePagination(query, { defaultLimit = 20, maxLimit = 200 } = {}) {
    const rawAll = String(query.all || query.limit || '').toLowerCase();
    const all = rawAll === 'all' || query.all === '1' || query.all === 'true';
    let page = parseInt(query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    let limit;
    if (all) {
        limit = null;
    } else {
        limit = parseInt(query.limit, 10);
        if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
        if (limit > maxLimit) limit = maxLimit;
    }
    return { page, limit, all };
}

// Build a Drizzle WHERE expression for the students-list filters. Returns
// undefined when there are no filters so callers can skip a .where() chain.
function buildStudentsListWhere(query) {
    const conds = [isNull(schema.students.deleted_at)];

    const { search, department, module: moduleFilter, intake, course, intakeYear, admissionType, status } = query;

    if (department && department !== 'all' && department !== '') {
        conds.push(eq(schema.students.department, department));
    }
    if (moduleFilter && moduleFilter !== 'all' && moduleFilter !== '') {
        const n = parseInt(moduleFilter, 10);
        if (Number.isFinite(n)) conds.push(eq(schema.students.module, n));
    }
    if (intake && intake !== 'all' && intake !== '') {
        // Postgres intake enum is lowercased.
        conds.push(eq(schema.students.intake, String(intake).toLowerCase()));
    }
    if (course && course !== 'all' && course !== '') {
        conds.push(eq(schema.students.course, course));
    }
    if (intakeYear && intakeYear !== 'all' && intakeYear !== '') {
        const y = parseInt(intakeYear, 10);
        if (Number.isFinite(y)) conds.push(eq(schema.students.intake_year, y));
    }
    if (admissionType && admissionType !== 'all' && admissionType !== '') {
        conds.push(eq(schema.students.admission_type, admissionType));
    }
    if (status && status !== 'all' && status !== '') {
        conds.push(eq(schema.students.status, status));
    }

    if (search && String(search).trim() !== '') {
        const needle = '%' + String(search).trim().replace(/[%_]/g, m => '\\' + m) + '%';
        conds.push(or(
            ilike(schema.students.name, needle),
            ilike(schema.students.admission_number, needle),
            ilike(schema.students.id_number, needle),
            ilike(schema.students.phone_number, needle),
            ilike(schema.students.email, needle),
        ));
    }
    return and(...conds);
}

// Project a students row into the camelCase shape the frontend expects.
const STUDENT_LIST_COLUMNS = {
    _id:                schema.students.id,
    id:                 schema.students.id,
    admissionNumber:    schema.students.admission_number,
    name:               schema.students.name,
    idNumber:           schema.students.id_number,
    kcseGrade:          schema.students.kcse_grade,
    course:             schema.students.course,
    department:         schema.students.department,
    module:             schema.students.module,
    intake:             schema.students.intake,
    intakeYear:         schema.students.intake_year,
    phoneNumber:        schema.students.phone_number,
    email:              schema.students.email,
    admissionType:      schema.students.admission_type,
    nextOfKinName:      schema.students.next_of_kin_name,
    nextOfKinPhone:     schema.students.next_of_kin_phone,
    role:               schema.students.role,
    isActive:           schema.students.is_active,
    status:             schema.students.status,
    createdAt:          schema.students.created_at,
    updatedAt:          schema.students.updated_at,
};

// Annotate each student row with the human-readable course/department labels.
// This keeps every consumer (registrar table, dean view, admin list, exports,
// admission letters) consistent without duplicating the formatting logic.
function decorateStudent(row) {
    if (!row) return row;
    return {
        ...row,
        courseName: getCourseDisplayName(row.course),
        courseCode: getCourseCode(row.course) || row.course,
        departmentName: getDepartmentDisplayName(row.department),
    };
}

// ---------------------------------------------------------------------------
// Routes — order matters: more specific paths first so /students/:id does
// not swallow /students/next-admission-number etc.
// ---------------------------------------------------------------------------

// Preview the next admission number for a (course, intake, intakeYear) triple.
// When all three params are present the response is the composed admission
// number (e.g. "BM5/2503/J26"); otherwise the legacy raw global number is
// returned so existing clients keep working until they upgrade.
router.get('/students/next-admission-number', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { course, intake, intakeYear } = req.query;
        if (course && intake && intakeYear) {
            const next = await peekNextAdmissionNumberFor(course, intake, intakeYear);
            return res.json({
                nextAdmissionNumber: next,
                globalNumber: next.split('/')[1] || null,
                courseCode: getCourseCode(course),
                intakeCode: generateIntakeCode(intake, parseInt(intakeYear, 10)),
            });
        }
        const next = await peekNextGlobalNumber();
        res.json({ nextAdmissionNumber: next });
    } catch (err) {
        const code = err.statusCode || 500;
        if (code === 400) return res.status(400).json({ message: err.message });
        console.error('Error peeking next admission number:', err);
        res.status(500).json({ message: 'Error reading admission counter' });
    }
});

// Registration Endpoint.
//
// - Admission number is allocated server-side in the canonical format
//   <COURSE_CODE>/<GLOBAL_SEQ>/<INTAKE_CODE>  (e.g. "BM5/2503/J26").
// - The global counter starts at 2500 and is incremented atomically.
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

        // Resolve the course code up-front so we fail fast if it's unknown.
        const courseCode = getCourseCode(course);
        if (!courseCode) {
            return res.status(400).json({ message: `Unknown course "${course}".` });
        }

        const resolvedIntakeYear = intakeYear ? parseInt(intakeYear, 10) : new Date().getFullYear();
        if (!Number.isFinite(resolvedIntakeYear) || resolvedIntakeYear < 2000 || resolvedIntakeYear > 2100) {
            return res.status(400).json({ message: 'Invalid intake year.' });
        }

        // Phone normalisation.
        const normalizedPhone = String(phoneNumber).replace(/\D/g, '');
        if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(normalizedPhone)) {
            return res.status(400).json({
                message: 'Invalid phone number format. Please enter a valid Kenyan phone number',
            });
        }
        const formattedPhone = normalizedPhone.length === 12 ? '0' + normalizedPhone.slice(-9) :
                               normalizedPhone.length === 13 ? '0' + normalizedPhone.slice(-9) :
                               normalizedPhone;

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

        // Atomically allocate the composed admission number.
        const admissionNumber = await allocateAdmissionNumberFor(course, intake, resolvedIntakeYear);

        // Default login credential = the student's phone number. This matches the
        // seeded test students (whose password IS their phone number) so every
        // newly admitted student can log in with their admission number + phone
        // number whether or not an email is on file. The login endpoint also
        // normalises the typed phone, so any common Kenyan format works.
        const initialPassword = formattedPhone;

        const student = await Student.create({
            name,
            idNumber,
            kcseGrade,
            admissionNumber,
            course,
            department,
            module: startModule,
            intake: String(intake).toLowerCase(),
            intakeYear: resolvedIntakeYear,
            phoneNumber: formattedPhone,
            email: email ? String(email).toLowerCase() : undefined,
            admissionType: admissionType || 'walk-in',
            nextOfKinName: nextOfKinName ? String(nextOfKinName).trim() : null,
            nextOfKinPhone: formattedKinPhone,
            password: initialPassword,
            role: 'student',
            // First-login: the initial password is the phone number, so force a
            // password change before the student can use the portal.
            isFirstLogin: true,
            mustUpdatePassword: true,
        });

        if (!student) {
            return res.status(500).json({ message: 'Failed to create student record.' });
        }

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
            courseName: getCourseDisplayName(student.course),
            courseCode: getCourseCode(student.course) || student.course,
            department: student.department,
            departmentName: getDepartmentDisplayName(student.department),
            intakeYear: student.intakeYear,
            intake: student.intake,
            intakeCode,
            module: student.module,
            phoneNumber: student.phoneNumber,
            email: student.email || null,
            kcseGrade: student.kcseGrade,
            admissionType: student.admissionType,
        };

        const response = {
            message: credentialsEmailed
                ? 'Student registered successfully. Login credentials (admission number + phone number) emailed to the student.'
                : 'Student registered successfully. The student logs in with their admission number and phone number as the password.',
            student: {
                _id: student._id,
                id: student._id,
                name: student.name,
                admissionNumber: student.admissionNumber,
                course: student.course,
                courseName: getCourseDisplayName(student.course),
                module: student.module,
                department: student.department,
                departmentName: getDepartmentDisplayName(student.department),
                intake: student.intake,
                intakeYear: student.intakeYear,
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
        if (error && (error.code === '23505' || /duplicate key/i.test(error.message || ''))) {
            return res.status(400).json({ message: 'A student with one of these details already exists.' });
        }
        if (error && error.statusCode === 400) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error registering student' });
    }
});

// Get students by department (for HOD). Supports pagination + module filter
// like the main /students endpoint.
router.get('/students/department/:department', verifyToken, authorize('admin', 'registrar', 'hod', 'dean'), async (req, res) => {
    try {
        const { department } = req.params;
        const { page, limit, all } = parsePagination(req.query, { defaultLimit: 20 });
        const where = buildStudentsListWhere({ ...req.query, department });

        // Count first, then slice.
        const countRows = await db.select({ c: sql`count(*)` }).from(schema.students).where(where);
        const total = Number(countRows[0]?.c || 0);

        let q = db.select(STUDENT_LIST_COLUMNS).from(schema.students).where(where)
            .orderBy(asc(schema.students.course), asc(schema.students.name));
        if (!all && limit) q = q.limit(limit).offset((page - 1) * limit);
        const rows = await q;
        const decorated = rows.map(decorateStudent);

        // Build per-course grouping for HOD dashboard backward-compat.
        const studentsByCourse = {};
        const courseStats = {};
        for (const s of decorated) {
            const code = s.course;
            if (!studentsByCourse[code]) studentsByCourse[code] = [];
            studentsByCourse[code].push(s);
        }
        for (const code of Object.keys(studentsByCourse)) {
            courseStats[code] = {
                totalStudents: studentsByCourse[code].length,
                courseName: getCourseDisplayName(code) || (formatCourseNameServer ? formatCourseNameServer(code) : code),
            };
        }

        const effectiveLimit = all ? total : (limit || total);
        const totalPages = effectiveLimit ? Math.max(1, Math.ceil(total / effectiveLimit)) : 1;

        res.json({
            students: studentsByCourse,
            studentsList: decorated,
            courseStats,
            totalStudents: total,
            totalCourses: Object.keys(studentsByCourse).length,
            total,
            page,
            limit: effectiveLimit,
            totalPages,
        });
    } catch (error) {
        console.error('Error fetching department students:', error);
        res.status(500).json({ message: 'Failed to fetch department students' });
    }
});

// Export Students by Admission Type (locked PDF/CSV upstream — this endpoint
// just returns the cleaned data).
router.get('/students/export/:admissionType', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { admissionType } = req.params;
        if (!['walk-in', 'KUCCPS'].includes(admissionType)) {
            return res.status(400).json({ message: 'Invalid admission type. Must be walk-in or KUCCPS' });
        }
        const where = and(
            isNull(schema.students.deleted_at),
            eq(schema.students.admission_type, admissionType),
        );
        const rows = await db.select(STUDENT_LIST_COLUMNS).from(schema.students).where(where)
            .orderBy(desc(schema.students.created_at));
        const exportData = rows.map(s => ({
            'Admission Number': s.admissionNumber,
            'Full Name': s.name,
            'ID Number': s.idNumber,
            'KCSE Grade': s.kcseGrade,
            'Course': getCourseDisplayName(s.course),
            'Course Code': getCourseCode(s.course) || s.course,
            'Department': getDepartmentDisplayName(s.department),
            'Module': s.module,
            'Intake': s.intake,
            'Intake Year': s.intakeYear,
            'Admission Type': s.admissionType,
            'Phone Number': s.phoneNumber,
            'Next of Kin Name': s.nextOfKinName,
            'Next of Kin Phone': s.nextOfKinPhone,
            'Registration Date': s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '',
        }));
        res.json({
            success: true,
            data: exportData,
            count: rows.length,
            admissionType,
        });
    } catch (error) {
        console.error('Error exporting students:', error);
        res.status(500).json({ message: 'Error exporting students' });
    }
});

// Stats summary — cheap aggregates for dashboards (registrar/admin/finance).
// Avoids streaming the full student list just to compute a count.
router.get('/students/stats', verifyToken, authorize('admin', 'registrar', 'dean', 'finance', 'deputy'), async (req, res) => {
    try {
        const where = isNull(schema.students.deleted_at);
        const totalRow = await db.select({ c: sql`count(*)` }).from(schema.students).where(where);
        const total = Number(totalRow[0]?.c || 0);

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const todayRow = await db.select({ c: sql`count(*)` }).from(schema.students)
            .where(and(where, gte(schema.students.created_at, todayStart)));
        const monthRow = await db.select({ c: sql`count(*)` }).from(schema.students)
            .where(and(where, gte(schema.students.created_at, monthStart)));

        // Distinct course and department counts.
        const distinctCourse = await db.selectDistinct({ v: schema.students.course }).from(schema.students).where(where);
        const distinctDept = await db.selectDistinct({ v: schema.students.department }).from(schema.students).where(where);

        // Module distribution (used for the filter dropdown options).
        const moduleRows = await db.select({
            m: schema.students.module,
            c: sql`count(*)`,
        }).from(schema.students).where(where).groupBy(schema.students.module).orderBy(asc(schema.students.module));
        const moduleDistribution = moduleRows.map(r => ({ module: Number(r.m), count: Number(r.c) }));

        // Department distribution (used for the dashboard tile).
        const deptRows = await db.select({
            d: schema.students.department,
            c: sql`count(*)`,
        }).from(schema.students).where(where).groupBy(schema.students.department).orderBy(asc(schema.students.department));
        const departmentDistribution = deptRows.map(r => ({
            department: r.d,
            departmentName: getDepartmentDisplayName(r.d),
            count: Number(r.c),
        }));

        // Latest admission number for the registrar's "Latest #" tile.
        const latestRow = await db.select({
            admissionNumber: schema.students.admission_number,
            createdAt: schema.students.created_at,
        }).from(schema.students).where(where).orderBy(desc(schema.students.created_at)).limit(1);

        res.json({
            totalStudents: total,
            studentsAdmittedToday: Number(todayRow[0]?.c || 0),
            studentsAdmittedThisMonth: Number(monthRow[0]?.c || 0),
            activeCourses: distinctCourse.filter(r => r.v).length,
            departments: distinctDept.filter(r => r.v).length,
            moduleDistribution,
            departmentDistribution,
            latestAdmissionNumber: latestRow[0]?.admissionNumber || null,
        });
    } catch (error) {
        console.error('Error fetching student stats:', error);
        res.status(500).json({ message: 'Error fetching student stats' });
    }
});

// Get All Students Endpoint — PAGINATED.
//
// Query params (all optional):
//   page       (default 1)
//   limit      (default 20, max 200, or 'all' / all=1 to return everything)
//   search     full-text-ish substring on name/admission#/id#/phone/email
//   department department code (e.g. 'computing_informatics')
//   module     1..6
//   intake     january | may | september
//   intakeYear integer year
//   course     canonical course key
//   admissionType walk-in | KUCCPS
//   status     active | on_leave | deferred | graduated | dropped_out | dismissed
//
// Response shape:
//   { students: Student[], total, page, totalPages, limit }
router.get('/students', verifyToken, authorize('admin', 'registrar', 'dean', 'finance', 'deputy', 'hod'), async (req, res) => {
    try {
        const { page, limit, all } = parsePagination(req.query, { defaultLimit: 20 });
        const where = buildStudentsListWhere(req.query);

        const countRows = await db.select({ c: sql`count(*)` }).from(schema.students).where(where);
        const total = Number(countRows[0]?.c || 0);

        let q = db.select(STUDENT_LIST_COLUMNS).from(schema.students).where(where)
            .orderBy(desc(schema.students.created_at));
        if (!all && limit) q = q.limit(limit).offset((page - 1) * limit);
        const rows = await q;
        const decorated = rows.map(decorateStudent);

        const effectiveLimit = all ? Math.max(total, 1) : (limit || Math.max(total, 1));
        const totalPages = effectiveLimit ? Math.max(1, Math.ceil(total / effectiveLimit)) : 1;

        res.json({
            students: decorated,
            total,
            page,
            limit: effectiveLimit,
            totalPages,
        });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Error fetching students' });
    }
});

// Get a single student by UUID. Back-office staff only — trainers see their own
// students via /trainers/:id/students (scoped), so trainer is intentionally NOT
// allowed here (prevented reading arbitrary student PII by id).
router.get('/students/:id', verifyToken, authorize('admin', 'registrar', 'dean', 'finance', 'deputy', 'hod'), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: 'Student not found' });
        delete student.password;
        res.json(decorateStudent(student));
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ message: 'Error fetching student' });
    }
});

// Update a student (registrar promotion + edits).
//
// Promotion uses the module-cap rules; balance / program-cost logic moves
// over from year-based to module-based (each promotion adds one program-cost
// increment, same as before).
async function handleStudentUpdate(req, res) {
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

        // SEV-H-014: never allow the client to overwrite the admission number,
        // role, password, or token version through this endpoint.
        delete updates.admissionNumber;
        delete updates.role;
        delete updates.password;
        delete updates.tokenVersion;
        delete updates._id;
        delete updates.id;

        const student = await Student.findByIdAndUpdate(id, updates, { new: true });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json(decorateStudent(student));
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ message: 'Error updating student' });
    }
}

router.patch('/students/:id', verifyToken, authorize('admin', 'registrar'), handleStudentUpdate);
// Compat: the registrar edit modal uses PUT for non-promotion edits.
router.put('/students/:id', verifyToken, authorize('admin', 'registrar'), handleStudentUpdate);

module.exports = router;
