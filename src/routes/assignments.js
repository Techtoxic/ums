const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull, inArray } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const { isValidId } = require('../utils/validators');
const { DEPT_TEXT_TO_SHORT } = require('../utils/formatters');
const { resolveAcademicPeriod } = require('../utils/academicPeriod');

// Get trainer assignments by department
router.get('/assignments/department/:department', verifyToken, authorize('admin', 'hod', 'registrar'), async (req, res) => {
    try {
        const { department } = req.params;
        const validDepartments = ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics', 'business_administration'];
        if (!validDepartments.includes(department)) {
            return res.status(400).json({ message: 'Invalid department' });
        }
        const shortCode = DEPT_TEXT_TO_SHORT[department];
        if (!shortCode) {
            // Known department code with no row in `departments` (e.g. business_administration).
            return res.json([]);
        }
        // JOIN trainer_assignments → units → programs → departments and
        // trainer_assignments → users. Filter to assignments whose unit lives
        // in a program in the requested department.
        const rows = await db
            .select({
                assignmentId:   schema.trainerAssignments.id,
                assignedAt:     schema.trainerAssignments.created_at,
                hours:          schema.trainerAssignments.hours,
                unitUid:        schema.units.id,
                unitCode:       schema.units.code,
                unitName:       schema.units.name,
                courseCode:     schema.programs.code,
                trainerUid:     schema.users.id,
                trainerName:    schema.users.name,
                trainerEmail:   schema.users.email,
            })
            .from(schema.trainerAssignments)
            .innerJoin(schema.units,       eq(schema.units.id,       schema.trainerAssignments.unit_id))
            .innerJoin(schema.programs,    eq(schema.programs.id,    schema.units.program_id))
            .innerJoin(schema.departments, eq(schema.departments.id, schema.programs.department_id))
            .innerJoin(schema.users,       eq(schema.users.id,       schema.trainerAssignments.trainer_id))
            .where(and(
                eq(schema.departments.code, shortCode),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.programs.code, schema.units.code);
        // Reshape into V1 Mongoose-populate format so the frontend
        // (assignment.unitId.unitCode, assignment.trainerId.name) keeps working unchanged.
        const assignments = rows.map(r => ({
            _id: r.assignmentId,
            assignedAt: r.assignedAt,
            hours: r.hours,          // integer or null
            unitId: {
                _id:        r.unitUid,
                unitCode:   r.unitCode,
                unitName:   r.unitName,
                courseCode: r.courseCode,
            },
            trainerId: {
                _id:   r.trainerUid,
                name:  r.trainerName,
                email: r.trainerEmail,
            },
        }));
        res.json(assignments);
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ message: 'Failed to fetch assignments' });
    }
});

// Resolve the snake_case department of a user row by id (authoritative — never
// trust a department sent in the request body). Returns null if not found.
async function getUserDepartment(userId) {
    if (!userId) return null;
    const [row] = await db
        .select({ department: schema.users.department })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
    return row ? row.department : null;
}

// Assign units to trainer
router.post('/assignments/assign', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { trainerId } = req.body;
        // assignedBy / department are sent by the HOD UI but have no columns — ignore.

        // Accept BOTH request shapes (backward-compatible):
        //   old: { unitIds: [uuid, ...] }                       — no hours
        //   new: { units: [ { unitId, hours }, ... ] }          — per-unit hours
        // Normalize to a single list of { unitId, hours }, where hours is a
        // positive integer or null. hours is OPTIONAL: a missing/zero/negative/
        // non-numeric value becomes null, never a 400.
        const coerceHours = (h) => {
            const n = Number(h);
            return Number.isInteger(n) && n > 0 ? n : null;
        };
        let entries;
        if (Array.isArray(req.body.units) && req.body.units.length > 0) {
            entries = req.body.units.map(u => ({ unitId: u && u.unitId, hours: coerceHours(u && u.hours) }));
        } else if (Array.isArray(req.body.unitIds) && req.body.unitIds.length > 0) {
            entries = req.body.unitIds.map(id => ({ unitId: id, hours: null }));
        } else {
            entries = [];
        }

        if (!trainerId || !isValidId(trainerId) || entries.length === 0) {
            return res.status(400).json({ message: 'Trainer ID and unit IDs are required' });
        }

        // Academic period: prefer numeric values explicitly sent in the body,
        // otherwise derive from system_settings. (The HOD UI sends neither.)
        const period = await resolveAcademicPeriod();
        const bodyYear = Number(req.body.academicYear);
        const bodySem = Number(req.body.semester);
        const academicYear = Number.isInteger(bodyYear) && bodyYear > 0 ? bodyYear : period.academicYear;
        const semester = Number.isInteger(bodySem) && bodySem > 0 ? bodySem : period.semester;

        // Dedupe by unitId (first occurrence wins for hours), keeping only valid ids.
        const hoursByUnit = new Map();
        for (const e of entries) {
            if (!isValidId(e.unitId)) continue;
            if (!hoursByUnit.has(e.unitId)) hoursByUnit.set(e.unitId, e.hours);
        }
        const uniqueUnitIds = [...hoursByUnit.keys()];

        // Fetch the candidate units WITH their is_common flag and owning
        // department (units → programs → departments). Used both to skip
        // invalid/soft-deleted ids and to enforce the allocation rules below.
        const validUnits = uniqueUnitIds.length
            ? await db
                .select({
                    id: schema.units.id,
                    isCommon: schema.units.is_common,
                    deptCode: schema.departments.code,
                })
                .from(schema.units)
                .leftJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
                .leftJoin(schema.departments, eq(schema.departments.id, schema.programs.department_id))
                .where(and(inArray(schema.units.id, uniqueUnitIds), isNull(schema.units.deleted_at)))
            : [];
        const validSet = new Set(validUnits.map(u => u.id));
        const unitById = new Map(validUnits.map(u => [u.id, u]));

        // ---- Allocation rules -------------------------------------------------
        // 1. Common units are NEVER assigned through this route — they go through
        //    the common-unit allocation flow (any HOD → any trainer). Reject them
        //    here regardless of role so the two flows stay cleanly separated.
        // 2. For an HOD (admin bypasses), a non-common unit may only be assigned
        //    when BOTH the unit's department AND the trainer's department match
        //    the HOD's own department.
        const commonInBatch = validUnits.filter(u => u.isCommon).map(u => u.id);
        if (commonInBatch.length) {
            return res.status(400).json({
                message: 'Common units cannot be assigned here. Use the common-unit allocation flow instead.',
                code: 'COMMON_UNIT_NOT_ALLOWED',
                unitIds: commonInBatch,
            });
        }

        if (req.user.role === 'hod') {
            const hodDept = await getUserDepartment(req.user.userId);
            if (!hodDept) {
                return res.status(403).json({ message: 'Your account has no department set; cannot assign units.', code: 'NO_DEPARTMENT' });
            }
            const hodShort = DEPT_TEXT_TO_SHORT[hodDept];

            // (a) every requested unit must belong to the HOD's department
            const foreignUnits = [...validSet].filter(id => unitById.get(id).deptCode !== hodShort);
            if (foreignUnits.length) {
                return res.status(403).json({
                    message: 'You can only assign units that belong to your own department.',
                    code: 'UNIT_OUT_OF_DEPARTMENT',
                    unitIds: foreignUnits,
                });
            }

            // (b) the trainer must belong to the HOD's department
            const trainerDept = await getUserDepartment(trainerId);
            if (trainerDept !== hodDept) {
                return res.status(403).json({
                    message: 'You can only assign units to trainers in your own department.',
                    code: 'TRAINER_OUT_OF_DEPARTMENT',
                });
            }
        }

        // Duplicate guard: trainer_assignments has NO unique constraint on
        // (trainer_id, unit_id, academic_year, semester) — only a non-unique
        // index — so onConflictDoNothing is not possible. Pre-check existing rows
        // for this trainer/period and skip unit_ids already assigned.
        const existing = uniqueUnitIds.length
            ? await db
                .select({ unitId: schema.trainerAssignments.unit_id })
                .from(schema.trainerAssignments)
                .where(and(
                    eq(schema.trainerAssignments.trainer_id, trainerId),
                    eq(schema.trainerAssignments.academic_year, academicYear),
                    eq(schema.trainerAssignments.semester, semester),
                    inArray(schema.trainerAssignments.unit_id, uniqueUnitIds),
                ))
            : [];
        const existingSet = new Set(existing.map(r => r.unitId));

        const toInsert = uniqueUnitIds
            .filter(id => validSet.has(id) && !existingSet.has(id))
            .map(unitId => ({
                trainer_id: trainerId,
                unit_id: unitId,
                academic_year: academicYear,
                semester,
                hours: hoursByUnit.get(unitId),   // integer or null
            }));

        let assignments = [];
        if (toInsert.length > 0) {
            assignments = await db.insert(schema.trainerAssignments).values(toInsert).returning();
        }

        res.json({
            message: 'Units assigned successfully',
            assignments
        });
    } catch (error) {
        console.error('Error assigning units:', error);
        res.status(500).json({ message: 'Failed to assign units' });
    }
});

// Unassign units
router.post('/assignments/unassign', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { unitIds } = req.body;

        if (!unitIds || !Array.isArray(unitIds) || unitIds.length === 0) {
            return res.status(400).json({ message: 'Unit IDs are required' });
        }

        const uniqueUnitIds = [...new Set(unitIds.filter(isValidId))];
        if (uniqueUnitIds.length === 0) {
            return res.json({ message: 'Units unassigned successfully' });
        }

        // Scope the delete to the CURRENT academic period so historical
        // assignments from prior years/semesters are preserved. This is per-unit
        // (matches the UI): it removes whoever currently holds the unit this period.
        const { academicYear, semester } = await resolveAcademicPeriod();
        await db
            .delete(schema.trainerAssignments)
            .where(and(
                inArray(schema.trainerAssignments.unit_id, uniqueUnitIds),
                eq(schema.trainerAssignments.academic_year, academicYear),
                eq(schema.trainerAssignments.semester, semester),
            ));

        res.json({
            message: 'Units unassigned successfully'
        });
    } catch (error) {
        console.error('Error unassigning units:', error);
        res.status(500).json({ message: 'Failed to unassign units' });
    }
});

module.exports = router;
