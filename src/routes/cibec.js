const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const { StudentUpload, AuditLog, Student } = require('../db/models');
const { db, schema } = require('../db');
const { eq, and, isNull, isNotNull, desc, asc, sql, gte, lte } = require('drizzle-orm');
const { getCourseDisplayName } = require('../utils/courseCodes');

const U = schema.studentUploads;

// Reviewer roles allowed to browse the evidence store.
const REVIEWER_ROLES = ['admin', 'cibec', 'registrar'];

// Best-effort reviewer-read audit (never throws / never blocks the response).
function logReviewerRead(req, action, details) {
    try {
        AuditLog.logAction({
            userId: req.user.userId,
            userType: req.user.role,
            action,
            details,
        });
    } catch (_) { /* logAction is itself never-throw; this is belt-and-braces */ }
}

// Parse "2025/2026" or "2025" → 2025 (the academic-year START year stored as int).
function toYearInt(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = parseInt(String(val).split('/')[0], 10);
    return Number.isFinite(n) ? n : null;
}
function toInt(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = parseInt(String(val), 10);
    return Number.isFinite(n) ? n : null;
}

// Expected assessment slots for a unit, mirroring the student upload UI exactly:
//   common unit  → Assessment 1-3 only
//   department   → Assessment 1-3, Practical 1-3, Combined Video
function expectedSlots(isCommon) {
    const slots = [
        { key: 'assessment1', label: 'Assessment 1', uploadType: 'assessment', number: 1 },
        { key: 'assessment2', label: 'Assessment 2', uploadType: 'assessment', number: 2 },
        { key: 'assessment3', label: 'Assessment 3', uploadType: 'assessment', number: 3 },
    ];
    if (!isCommon) {
        slots.push(
            { key: 'practical1', label: 'Practical 1', uploadType: 'practical', number: 1 },
            { key: 'practical2', label: 'Practical 2', uploadType: 'practical', number: 2 },
            { key: 'practical3', label: 'Practical 3', uploadType: 'practical', number: 3 },
            { key: 'combined_video', label: 'Combined Video', uploadType: 'combined_video', number: null },
        );
    }
    return slots;
}
// Slot key for an uploaded row (matches expectedSlots keys).
function rowSlotKey(r) {
    if (r.uploadType === 'assessment') return `assessment${r.assessmentNumber}`;
    if (r.uploadType === 'practical') return `practical${r.practicalNumber}`;
    if (r.uploadType === 'combined_video') return 'combined_video';
    return r.uploadType; // student-level types
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cibec/tree — the derived folder hierarchy as counts, lazy-loaded.
// Spine (DECISION 1): Course → Intake → Module → Unit → Student → slot.
// ?level=course|intake|module|unit|student|slot selects the depth; branch params
// (course, intakeYear, module, unitId, admissionNumber) narrow it. Each node is
// { key, label, count, hasChildren }; slot leaves also carry { uploadId, ... }.
// Built entirely from GROUP BY over student_uploads WHERE status='uploaded'.
// ───────────────────────────────────────────────────────────────────────────
router.get('/cibec/tree', verifyToken, authorize(...REVIEWER_ROLES), async (req, res) => {
    try {
        const level = req.query.level || 'academicYear';
        const academicYear = toYearInt(req.query.academicYear);
        const course = req.query.course || null;
        const intakeYear = toYearInt(req.query.intakeYear);
        const moduleNo = toInt(req.query.module);
        const unitId = req.query.unitId || null;
        const admissionNumber = req.query.admissionNumber || null;

        // Branch filter shared by every level below the root.
        const conds = [eq(U.status, 'uploaded')];
        if (academicYear != null) conds.push(eq(U.academic_year, academicYear));
        if (course) conds.push(eq(U.course, course));
        if (intakeYear != null) conds.push(eq(U.intake_year, intakeYear));
        if (moduleNo != null) conds.push(eq(U.module, moduleNo));
        // '__no_unit__' is the sentinel for profile/other docs that carry no unit
        // (KCPE results, profile photos, …) — match unit_id IS NULL, not equality.
        if (unitId === '__no_unit__') conds.push(isNull(U.unit_id));
        else if (unitId) conds.push(eq(U.unit_id, unitId));
        if (admissionNumber) conds.push(eq(U.admission_number, admissionNumber));
        const where = and(...conds);
        const cnt = sql`count(*)::int`;

        let nodes = [];
        if (level === 'academicYear') {
            // Top level (DECISION): wrap everything under the academic year the
            // document was uploaded in, so each year is its own folder.
            const rows = await db.select({ key: U.academic_year, count: cnt })
                .from(U).where(where).groupBy(U.academic_year).orderBy(desc(U.academic_year));
            nodes = rows.map(r => ({
                key: String(r.key ?? ''),
                label: r.key != null ? `AY ${r.key}/${r.key + 1}` : 'No academic year',
                count: r.count, hasChildren: true, level: 'academicYear', academicYear: r.key,
            }));
        } else if (level === 'course') {
            // Label the course node with the PROGRAM NAME (join programs on the
            // course code), not the raw code.
            const rows = await db.select({ key: U.course, name: schema.programs.name, count: cnt })
                .from(U).leftJoin(schema.programs, eq(schema.programs.code, U.course))
                .where(where).groupBy(U.course, schema.programs.name).orderBy(asc(U.course));
            // Prefer the program name from the code join; fall back to the helper
            // (handles snake_case course keys like "applied_biology_6"); else raw.
            nodes = rows.filter(r => r.key).map(r => ({
                key: r.key,
                label: r.name || getCourseDisplayName(r.key) || r.key,
                count: r.count, hasChildren: true, level: 'course',
            }));
        } else if (level === 'intake') {
            const rows = await db.select({ year: U.intake_year, intake: U.intake, count: cnt })
                .from(U).where(where).groupBy(U.intake_year, U.intake)
                .orderBy(desc(U.intake_year), asc(U.intake));
            nodes = rows.map(r => ({
                key: String(r.year),
                label: `${r.intake ? r.intake.charAt(0).toUpperCase() + r.intake.slice(1) + ' ' : ''}${r.year ?? '—'}`,
                count: r.count, hasChildren: true, level: 'intake', intakeYear: r.year, intake: r.intake,
            }));
        } else if (level === 'module') {
            const rows = await db.select({ key: U.module, count: cnt })
                .from(U).where(where).groupBy(U.module).orderBy(asc(U.module));
            nodes = rows.map(r => ({ key: String(r.key ?? ''), label: r.key != null ? `Module ${r.key}` : 'No module', count: r.count, hasChildren: true, level: 'module' }));
        } else if (level === 'unit') {
            const rows = await db.select({ key: U.unit_id, code: U.unit_code, name: U.unit_name, count: cnt })
                .from(U).where(where).groupBy(U.unit_id, U.unit_code, U.unit_name).orderBy(asc(U.unit_code));
            nodes = rows.map(r => {
                // Docs with no unit (KCPE results, profile photos, …) group under a
                // single "Profile / Other Documents" node instead of a blank "—".
                const noUnit = !r.key;
                return {
                    key: noUnit ? '__no_unit__' : r.key,
                    label: noUnit ? 'Profile / Other Documents' : `${r.code ? r.code + ' · ' : ''}${r.name || '—'}`,
                    count: r.count, hasChildren: true, level: 'unit',
                    unitId: noUnit ? '__no_unit__' : r.key, unitCode: r.code, unitName: r.name,
                };
            });
        } else if (level === 'student') {
            const rows = await db.select({ key: U.admission_number, name: U.student_name, count: cnt })
                .from(U).where(where).groupBy(U.admission_number, U.student_name).orderBy(asc(U.admission_number));
            nodes = rows.map(r => ({
                key: r.key, label: `${r.key || '—'}${r.name ? ' · ' + r.name : ''}`,
                count: r.count, hasChildren: true, level: 'student', admissionNumber: r.key, studentName: r.name,
            }));
        } else if (level === 'slot') {
            // Leaves: the actual current documents for this student+unit branch.
            const rows = await db.select({
                id: U.id, uploadType: U.upload_type, assessmentNumber: U.assessment_number,
                practicalNumber: U.practical_number, version: U.version, unitCode: U.unit_code,
                originalFileName: U.original_file_name, uploadedAt: U.uploaded_at,
            }).from(U).where(where)
              .orderBy(asc(U.upload_type), asc(U.assessment_number), asc(U.practical_number));
            const labelFor = (r) => {
                if (r.uploadType === 'assessment') return `Assessment ${r.assessmentNumber}`;
                if (r.uploadType === 'practical') return `Practical ${r.practicalNumber}`;
                if (r.uploadType === 'combined_video') return 'Combined Video';
                return String(r.uploadType || 'Document').replace(/_/g, ' ');
            };
            nodes = rows.map(r => ({
                key: r.id, uploadId: r.id, label: `${labelFor(r)} · v${r.version}`,
                count: 1, hasChildren: false, level: 'slot',
                uploadType: r.uploadType, version: r.version, fileName: r.originalFileName, uploadedAt: r.uploadedAt,
            }));
        } else {
            return res.status(400).json({ message: `Unknown tree level: ${level}` });
        }

        logReviewerRead(req, 'browse', { level, course, intakeYear, module: moduleNo, unitId, admissionNumber, count: nodes.length });
        res.json({ success: true, level, count: nodes.length, nodes });
    } catch (error) {
        console.error('Error building CIBEC tree:', error);
        res.status(500).json({ message: 'Error building browse tree' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cibec/completeness?unitId=&intakeYear=&module=&academicYear=&semester=
// The gap matrix: every student REGISTERED for the unit (roster from
// unit_registrations) × the expected slots for that unit type, each cell
// { present, uploadId, version }. "Missing" therefore reflects who was supposed
// to submit, not merely who did.
// ───────────────────────────────────────────────────────────────────────────
router.get('/cibec/completeness', verifyToken, authorize(...REVIEWER_ROLES), async (req, res) => {
    try {
        const unitId = req.query.unitId;
        if (!unitId) return res.status(400).json({ message: 'unitId is required' });
        const intakeYear = toYearInt(req.query.intakeYear);
        const academicYear = toYearInt(req.query.academicYear);
        const semester = toInt(req.query.semester);

        // 1. Unit (type drives the expected slots).
        const unitRows = await db.select({
            id: schema.units.id, code: schema.units.code, name: schema.units.name, isCommon: schema.units.is_common,
        }).from(schema.units).where(eq(schema.units.id, unitId)).limit(1);
        if (!unitRows.length) return res.status(404).json({ message: 'Unit not found' });
        const unit = unitRows[0];
        const slots = expectedSlots(unit.isCommon);

        // 2. Roster: students registered for this unit (+ optional year/semester/intake).
        const regConds = [eq(schema.unitRegistrations.unit_id, unitId), isNull(schema.students.deleted_at)];
        if (academicYear != null) regConds.push(eq(schema.unitRegistrations.academic_year, academicYear));
        if (semester != null) regConds.push(eq(schema.unitRegistrations.semester, semester));
        if (intakeYear != null) regConds.push(eq(schema.students.intake_year, intakeYear));
        // GROUP BY the student so a cross-period retake (a second unit_registrations
        // row for the same student+unit) does not double-count them in the matrix /
        // completion %. One row per student = the true roster.
        const roster = await db.select({
            studentId: schema.students.id,
            admissionNumber: schema.students.admission_number,
            name: schema.students.name,
        }).from(schema.unitRegistrations)
          .innerJoin(schema.students, eq(schema.students.id, schema.unitRegistrations.student_id))
          .where(and(...regConds))
          .groupBy(schema.students.id, schema.students.admission_number, schema.students.name)
          .orderBy(asc(schema.students.admission_number));

        // 3. Current uploads for this unit cohort, keyed by student+slot.
        const upConds = [eq(U.unit_id, unitId), eq(U.status, 'uploaded')];
        if (academicYear != null) upConds.push(eq(U.academic_year, academicYear));
        if (semester != null) upConds.push(eq(U.semester, semester));
        const uploads = await db.select({
            studentId: U.student_id, uploadType: U.upload_type,
            assessmentNumber: U.assessment_number, practicalNumber: U.practical_number,
            id: U.id, version: U.version,
        }).from(U).where(and(...upConds));
        const cellMap = {}; // `${studentId}|${slotKey}` -> { uploadId, version }
        for (const r of uploads) {
            cellMap[`${r.studentId}|${rowSlotKey(r)}`] = { uploadId: r.id, version: r.version };
        }

        // 4. Build the matrix + completion %.
        let present = 0;
        const students = roster.map(stu => {
            const cells = {};
            for (const slot of slots) {
                const hit = cellMap[`${stu.studentId}|${slot.key}`];
                cells[slot.key] = hit ? { present: true, uploadId: hit.uploadId, version: hit.version } : { present: false };
                if (hit) present++;
            }
            return { studentId: stu.studentId, admissionNumber: stu.admissionNumber, name: stu.name, cells };
        });
        const total = roster.length * slots.length;
        const percent = total > 0 ? Math.round((present / total) * 100) : 0;

        logReviewerRead(req, 'completeness', { unitId, intakeYear, academicYear, semester, students: students.length, percent });
        res.json({
            success: true,
            unit: { id: unit.id, code: unit.code, name: unit.name, isCommon: unit.isCommon },
            slots: slots.map(s => ({ key: s.key, label: s.label })),
            students,
            completion: { present, total, percent },
        });
    } catch (error) {
        console.error('Error building completeness matrix:', error);
        res.status(500).json({ message: 'Error building completeness matrix' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cibec/intakes — distinct cohorts (intake_year + intake), newest first.
// ───────────────────────────────────────────────────────────────────────────
router.get('/cibec/intakes', verifyToken, authorize(...REVIEWER_ROLES), async (req, res) => {
    try {
        const rows = await db.selectDistinct({ intakeYear: U.intake_year, intake: U.intake })
            .from(U).where(eq(U.status, 'uploaded'))
            .orderBy(desc(U.intake_year), asc(U.intake));
        const intakes = rows.filter(r => r.intakeYear != null).map(r => ({
            intakeYear: r.intakeYear, intake: r.intake,
            label: `${r.intake ? r.intake.charAt(0).toUpperCase() + r.intake.slice(1) + ' ' : ''}${r.intakeYear}`,
        }));
        res.json({ success: true, intakes });
    } catch (error) {
        console.error('Error fetching intakes:', error);
        res.status(500).json({ message: 'Error fetching intakes' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cibec/filters — distinct dropdown values for the reviewer UI.
// ───────────────────────────────────────────────────────────────────────────
router.get('/cibec/filters', verifyToken, authorize(...REVIEWER_ROLES), async (req, res) => {
    try {
        const base = eq(U.status, 'uploaded');
        const distinct = (cols, order) => db.selectDistinct(cols).from(U).where(base).orderBy(...order);
        const [courses, departments, modules, units, years, semesters, types, intakes] = await Promise.all([
            distinct({ value: U.course }, [asc(U.course)]),
            distinct({ value: U.department }, [asc(U.department)]),
            distinct({ value: U.module }, [asc(U.module)]),
            distinct({ unitId: U.unit_id, code: U.unit_code, name: U.unit_name }, [asc(U.unit_code)]),
            distinct({ value: U.academic_year }, [desc(U.academic_year)]),
            distinct({ value: U.semester }, [asc(U.semester)]),
            distinct({ value: U.upload_type }, [asc(U.upload_type)]),
            distinct({ intakeYear: U.intake_year, intake: U.intake }, [desc(U.intake_year)]),
        ]);
        res.json({
            success: true,
            filters: {
                courses: courses.map(r => r.value).filter(v => v != null),
                departments: departments.map(r => r.value).filter(v => v != null),
                modules: modules.map(r => r.value).filter(v => v != null),
                units: units.filter(r => r.unitId).map(r => ({ unitId: r.unitId, code: r.code, name: r.name })),
                academicYears: years.map(r => r.value).filter(v => v != null),
                semesters: semesters.map(r => r.value).filter(v => v != null),
                uploadTypes: types.map(r => r.value).filter(v => v != null),
                intakes: intakes.filter(r => r.intakeYear != null).map(r => ({ intakeYear: r.intakeYear, intake: r.intake })),
            },
        });
    } catch (error) {
        console.error('Error fetching filters:', error);
        res.status(500).json({ message: 'Error fetching filters' });
    }
});

// Get all uploads with filters (CIBEC) — flat power-search.
router.get('/cibec/uploads', verifyToken, authorize('admin', 'cibec', 'registrar'), async (req, res) => {
    try {
        const filters = {
            course: req.query.course,
            department: req.query.department,
            unitCode: req.query.unitCode,
            module: req.query.module,
            courseLevel: req.query.courseLevel,
            uploadType: req.query.uploadType,
            academicYear: req.query.academicYear,
            semester: req.query.semester,
            studentId: req.query.studentId,
            admissionNumber: req.query.admissionNumber,
            intake: req.query.intake,
            intakeYear: req.query.intakeYear,
            status: req.query.status || 'uploaded'
        };

        // getCIBECUploads filters + orders in SQL and ignores unknown keys safely.
        const uploads = await StudentUpload.getCIBECUploads(filters);

        logReviewerRead(req, 'search', { filters, resultCount: uploads.length });

        res.json({
            success: true,
            count: uploads.length,
            uploads
        });
    } catch (error) {
        console.error('Error fetching CIBEC uploads:', error);
        res.status(500).json({ message: 'Error fetching uploads' });
    }
});

// Get CIBEC statistics — real Drizzle GROUP BY counts (no shim .aggregate()).
router.get('/cibec/statistics', verifyToken, authorize('admin', 'cibec', 'registrar', 'dean'), async (req, res) => {
    try {
        const academicYear = toYearInt(req.query.academicYear);
        const semester = toInt(req.query.semester);

        const conds = [eq(U.status, 'uploaded')];
        if (academicYear != null) conds.push(eq(U.academic_year, academicYear));
        if (semester != null) conds.push(eq(U.semester, semester));
        const where = and(...conds);
        const cnt = sql`count(*)::int`;

        const [totalRow, byType, byDepartment, byCourse, recentUploads] = await Promise.all([
            db.select({ c: cnt }).from(U).where(where),
            db.select({ key: U.upload_type, count: cnt }).from(U).where(where).groupBy(U.upload_type).orderBy(desc(cnt)),
            db.select({ key: U.department, count: cnt }).from(U).where(where).groupBy(U.department).orderBy(desc(cnt)),
            db.select({ key: U.course, count: cnt }).from(U).where(where).groupBy(U.course).orderBy(desc(cnt)),
            db.select({
                id: U.id, uploadType: U.upload_type, unitCode: U.unit_code, unitName: U.unit_name,
                studentName: U.student_name, admissionNumber: U.admission_number,
                course: U.course, version: U.version, uploadedAt: U.uploaded_at,
            }).from(U).where(where).orderBy(desc(U.uploaded_at)).limit(10),
        ]);

        res.json({
            success: true,
            statistics: {
                totalUploads: totalRow[0] ? totalRow[0].c : 0,
                byType: byType.map(r => ({ key: r.key, count: r.count })),
                byDepartment: byDepartment.map(r => ({ key: r.key, count: r.count })),
                byCourse: byCourse.map(r => ({ key: r.key, count: r.count })),
                recentUploads,
            }
        });
    } catch (error) {
        console.error('Error fetching CIBEC statistics:', error);
        res.status(500).json({ message: 'Error fetching statistics' });
    }
});

// Get student's all uploads (CIBEC view)
router.get('/cibec/student/:studentId/uploads', verifyToken, authorize('admin', 'cibec', 'registrar'), async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Query by the resolved student uuid, not the admission number param.
        const uploads = await StudentUpload.find(
            { studentId: student.id, status: 'uploaded' },
            null,
            { sort: { uploadedAt: -1 } }
        );

        logReviewerRead(req, 'view', {
            studentName: student.name,
            admissionNumber: student.admissionNumber,
            uploadCount: uploads.length,
        });

        res.json({
            success: true,
            student: {
                studentId: student.admissionNumber,
                name: student.name,
                course: student.course,
                department: student.department,
                module: student.module
            },
            uploads
        });
    } catch (error) {
        console.error('Error fetching student uploads for CIBEC:', error);
        res.status(500).json({ message: 'Error fetching student uploads' });
    }
});

// Get audit logs (CIBEC) — real query via the options arg (no chained no-ops).
router.get('/cibec/audit-logs', verifyToken, authorize('admin', 'cibec'), async (req, res) => {
    try {
        const { dateFrom, dateTo, action, userId } = req.query;
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

        // audit_logs has no `timestamp` column — it is created_at. Build the WHERE
        // with the real column so the date filter actually applies.
        const conds = [];
        if (dateFrom) conds.push(gte(schema.auditLogs.created_at, new Date(dateFrom)));
        if (dateTo) conds.push(lte(schema.auditLogs.created_at, new Date(dateTo)));
        if (action) conds.push(eq(schema.auditLogs.action, action));
        if (userId) conds.push(eq(schema.auditLogs.actor_id, userId));

        let q = db.select().from(schema.auditLogs);
        if (conds.length) q = q.where(conds.length === 1 ? conds[0] : and(...conds));
        const logs = await q.orderBy(desc(schema.auditLogs.created_at)).limit(limit);

        res.json({
            success: true,
            count: logs.length,
            logs
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
});

module.exports = router;
