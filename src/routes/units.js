const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull, ilike } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const { DEPT_TEXT_TO_SHORT } = require('../utils/formatters');
const { getMaxModuleForLevel } = require('../utils/studentHelpers');
const { Unit, Student, StudentUnitRegistration } = require('../db/models');

// Get units by course code (for student portal)
router.get('/units/course/:courseCode', async (req, res) => {
    try {
        const { courseCode } = req.params;
        const { studentId } = req.query; // Optional admission number for registration status

        // Validate course code
        if (!courseCode || courseCode.trim() === '') {
            return res.status(400).json({ message: 'Course code is required' });
        }

        // Fetch the course's units. A unit belongs to a program via program_id;
        // "units for course AC6" = units whose program has programs.code = 'AC6'.
        // Program codes are stored uppercase, so match on .toUpperCase().
        //
        // Legacy support: older students (imported via registrar) have their
        // `course` field stored as a long snake_case key like "applied_biology_6"
        // rather than the short program code "AB6". In that case the direct code
        // lookup returns nothing, so we fall back to matching by program name —
        // converting e.g. "applied_biology_6" -> "Applied Biology Level 6" and
        // doing a case-insensitive name match against programs.name.
        const _unitSelectFields = {
            _id: schema.units.id,
            unitCode: schema.units.code,
            unitName: schema.units.name,
            module: schema.units.module,
            year: schema.units.year,
            semester: schema.units.semester,
            isCommon: schema.units.is_common,
            courseCode: schema.programs.code,
            courseName: schema.programs.name,
            courseLevel: schema.programs.level,
        };

        // Primary lookup: exact program code match (handles "AB6", "ICT5", etc.)
        let unitRows = await db
            .select(_unitSelectFields)
            .from(schema.units)
            .innerJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
            .where(and(
                eq(schema.programs.code, courseCode.toUpperCase()),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.units.module, schema.units.code);

        // Fallback: if nothing found and the key looks like a legacy snake_case key
        // (contains underscores), normalise it to a program name and match on that.
        // "applied_biology_6" -> "Applied Biology Level 6"
        if (unitRows.length === 0 && courseCode.includes('_')) {
            const normalizedName = courseCode
                .replace(/_(\d+)$/, ' Level $1')   // trailing _6 -> " Level 6"
                .replace(/_/g, ' ')                  // remaining _ -> spaces
                .replace(/\w/g, l => l.toUpperCase()); // Title Case

            unitRows = await db
                .select(_unitSelectFields)
                .from(schema.units)
                .innerJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
                .where(and(
                    ilike(schema.programs.name, normalizedName),
                    isNull(schema.units.deleted_at),
                ))
                .orderBy(schema.units.module, schema.units.code);
        }

        // -------------------------------------------------------------------
        // Module visibility: students only see modules up to their current
        // module of study. Modules they have already passed are shown but
        // flagged as history (isHistory: true). Units in future modules are
        // completely hidden.
        //
        // When no studentId is supplied (e.g. unauthenticated preview),
        // fall back to the level-based cap so only valid modules show.
        // -------------------------------------------------------------------

        // Resolve the student record once — used for both module filtering
        // and registration status (avoids a second DB round-trip).
        let studentRecord = null;
        let registeredUnitIds = new Set();
        if (studentId) {
            studentRecord = await Student.findOne({ admissionNumber: studentId });
            if (studentRecord) {
                const regs = await StudentUnitRegistration.find({ studentId: studentRecord.id });
                registeredUnitIds = new Set(regs.map(r => r.unitId));
            }
        }

        // Determine the effective module ceiling:
        //   - When the student is known: their current module of study.
        //   - Fallback: the course-level cap (L3→1, L4→2, L5→4, L6→6) so
        //     surplus seeded modules never leak to unauthenticated callers.
        const courseLevel = unitRows.length ? unitRows[0].courseLevel : null;
        const levelCap = getMaxModuleForLevel(courseLevel);
        const studentModule = studentRecord ? Number(studentRecord.module || 1) : null;

        // Apply the ceiling filter. A null levelCap means no restriction.
        const effectiveCap = studentModule !== null ? studentModule : levelCap;
        const visibleRows = effectiveCap == null
            ? unitRows
            : unitRows.filter(u => u.module == null || u.module <= effectiveCap);

        // Build the final unit list. Past modules are marked isHistory so the
        // frontend can render them in a collapsed "History" section instead of
        // as active/registerable units.
        const units = visibleRows.map(u => ({
            ...u,
            department: u.isCommon ? 'common' : 'department',
            type: u.isCommon ? 'common' : 'department',
            isRegistered: registeredUnitIds.has(u._id),
            // isHistory: true when this module has already been passed
            // (module number is strictly less than the student's current module).
            isHistory: studentModule !== null && u.module != null && u.module < studentModule,
        }));

        if (units.length === 0) {
            return res.status(404).json({ message: 'No units found for this course' });
        }

        res.json({
            success: true,
            courseCode: courseCode,
            studentModule: studentModule,
            totalUnits: units.length,
            departmentUnits: units.filter(u => !u.isCommon).length,
            commonUnits: units.filter(u => u.isCommon).length,
            registeredUnits: units.filter(u => u.isRegistered).length,
            historyUnits: units.filter(u => u.isHistory).length,
            units: units,
        });
    } catch (error) {
        console.error('Error fetching units by course:', error);
        res.status(500).json({ message: 'Server error while fetching units' });
    }
});

// Get units by department (for admin use)
router.get('/units/department/:department', verifyToken, authorize('admin', 'registrar', 'hod', 'deputy'), async (req, res) => {
    try {
        const { department } = req.params;
        const validDepartments = ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics', 'business_administration'];
        if (!validDepartments.includes(department)) {
            return res.status(400).json({ message: 'Invalid department' });
        }
        const shortCode = DEPT_TEXT_TO_SHORT[department];
        if (!shortCode) {
            // Known department code with no row in `departments` table (e.g. business_administration).
            return res.json({ success: true, department, totalUnits: 0, units: [] });
        }
        const rows = await db
            .select({
                _id: schema.units.id,
                unitCode: schema.units.code,
                unitName: schema.units.name,
                year: schema.units.year,
                semester: schema.units.semester,
                isCommon: schema.units.is_common,
                courseCode: schema.programs.code,
                courseName: schema.programs.name,
            })
            .from(schema.units)
            .innerJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
            .innerJoin(schema.departments, eq(schema.departments.id, schema.programs.department_id))
            .where(and(
                eq(schema.departments.code, shortCode),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.programs.code, schema.units.code);
        // Tag each unit with the requested department text code for frontend compatibility.
        const units = rows.map(r => ({ ...r, department }));
        res.json({
            success: true,
            department,
            totalUnits: units.length,
            units,
        });
    } catch (error) {
        console.error('Error fetching units by department:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching units' });
    }
});

// Get all units (for admin use with pagination)
router.get('/units', verifyToken, authorize('admin', 'registrar', 'hod', 'deputy'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const units = await Unit.find({ isActive: true })
            .sort({ courseCode: 1, unitCode: 1 })
            .skip(skip)
            .limit(limit);

        const total = await Unit.countDocuments({ isActive: true });

        res.json({
            success: true,
            units: units,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalUnits: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching all units:', error);
        res.status(500).json({ message: 'Server error while fetching units' });
    }
});

// Get all courses — DB-sourced from the programs table (Rule 7: no hardcoded lists).
// `department` is the snake_case key (reverse of DEPT_TEXT_TO_SHORT) so existing
// consumers that key on it keep working.
router.get('/courses', async (req, res) => {
    try {
        const shortToText = {};
        for (const [text, short] of Object.entries(DEPT_TEXT_TO_SHORT)) shortToText[short] = text;

        const rows = await db
            .select({
                code: schema.programs.code,
                name: schema.programs.name,
                level: schema.programs.level,
                deptCode: schema.departments.code,
            })
            .from(schema.programs)
            .leftJoin(schema.departments, eq(schema.departments.id, schema.programs.department_id))
            .where(isNull(schema.programs.deleted_at))
            .orderBy(schema.programs.code);

        const courses = rows.map(r => ({
            code: r.code,
            name: r.name,
            department: shortToText[r.deptCode] || null,
            level: r.level,
        }));
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ message: 'Error fetching courses' });
    }
});

module.exports = router;
