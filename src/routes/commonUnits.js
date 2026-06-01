const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull, desc, inArray } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { CommonUnit, CommonUnitAssignment, Trainer } = require('../db/models');

// Get all common units
router.get('/common-units', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const rows = await db
            .select({
                _id: schema.units.id,
                unitCode: schema.units.code,
                unitName: schema.units.name,
                year: schema.units.year,
                semester: schema.units.semester,
            })
            .from(schema.units)
            .where(and(
                eq(schema.units.is_common, true),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.units.code);
        res.json({
            success: true,
            commonUnits: rows,
            total: rows.length,
        });
    } catch (error) {
        console.error('Error fetching common units:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching common units' });
    }
});

// Get common unit by code
router.get('/common-units/:unitCode', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { unitCode } = req.params;
        const commonUnit = await CommonUnit.findOne({ code: unitCode });

        if (!commonUnit) {
            return res.status(404).json({
                success: false,
                message: 'Common unit not found'
            });
        }

        res.json({
            success: true,
            commonUnit: commonUnit
        });
    } catch (error) {
        console.error('Error fetching common unit:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching common unit'
        });
    }
});

// Create new common unit (admin only)
router.post('/common-units', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const commonUnitData = req.body;

        // Map the V1 payload to the lean `units` columns. code + name are the
        // genuinely client-supplied fields; year/semester are structural NOT NULL
        // columns that aren't meaningful for a common (cross-program) unit, so
        // they default to 1 when omitted (mirrors the seeded common units).
        const code = String(commonUnitData.code || commonUnitData.unitCode || '').trim().toUpperCase();
        const name = String(commonUnitData.name || commonUnitData.unitName || '').trim();
        const year = Number.isFinite(parseInt(commonUnitData.year, 10)) ? parseInt(commonUnitData.year, 10) : 1;
        const semester = Number.isFinite(parseInt(commonUnitData.semester, 10)) ? parseInt(commonUnitData.semester, 10) : 1;

        const missing = [];
        if (!code) missing.push('code');
        if (!name) missing.push('name');
        if (missing.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required field(s): ${missing.join(', ')}`
            });
        }

        // Duplicate check by the real `code` column (not the non-existent unit_code).
        const existingUnit = await CommonUnit.findOne({ code });
        if (existingUnit) {
            return res.status(400).json({
                success: false,
                message: 'Common unit with this code already exists'
            });
        }

        const commonUnit = await CommonUnit.create({
            code,
            name,
            year,
            semester,
            isCommon: true,
            programId: null,
        });

        res.status(201).json({
            success: true,
            commonUnit: commonUnit,
            message: 'Common unit created successfully'
        });
    } catch (error) {
        console.error('Error creating common unit:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating common unit'
        });
    }
});

// Update common unit (admin only)
router.put('/common-units/:unitCode', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { unitCode } = req.params;
        const updateData = req.body;

        const commonUnit = await CommonUnit.findOneAndUpdate(
            { unitCode: unitCode.toUpperCase(), isActive: true },
            updateData,
            { new: true, runValidators: true }
        );

        if (!commonUnit) {
            return res.status(404).json({
                success: false,
                message: 'Common unit not found'
            });
        }

        res.json({
            success: true,
            commonUnit: commonUnit,
            message: 'Common unit updated successfully'
        });
    } catch (error) {
        console.error('Error updating common unit:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating common unit'
        });
    }
});

// Delete common unit (admin only)
router.delete('/common-units/:unitCode', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { unitCode } = req.params;

        const commonUnit = await CommonUnit.findOneAndUpdate(
            { unitCode: unitCode.toUpperCase() },
            { isActive: false },
            { new: true }
        );

        if (!commonUnit) {
            return res.status(404).json({
                success: false,
                message: 'Common unit not found'
            });
        }

        res.json({
            success: true,
            message: 'Common unit deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating common unit:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deactivating common unit'
        });
    }
});

// Common Unit Assignment API Routes
// Rewritten for the V2 Postgres schema (Drizzle). The legacy Mongoose-style
// model methods (.populate/.find/.canModify) are not available on the shim, so
// these endpoints query the common_unit_assignments table directly and shape the
// nested { commonUnitId, trainerId, assignedBy } objects the HOD UI expects.

const trainerUsers = alias(schema.users, 'cua_trainer');
const assignerUsers = alias(schema.users, 'cua_assigner');

function shapeAssignment(r) {
    return {
        _id: r.id,
        status: r.status,
        notes: r.notes,
        trainerDepartment: r.trainerDepartment,
        assignedByDepartment: r.assignedByDepartment,
        createdAt: r.createdAt,
        commonUnitId: { _id: r.unitId, unitName: r.unitName, unitCode: r.unitCode },
        trainerId: { _id: r.trainerId, name: r.trainerName, email: r.trainerEmail, department: r.trainerDept },
        assignedBy: { _id: r.assignedBy, name: r.assignerName, department: r.assignerDept },
    };
}

const ASSIGNMENT_COLUMNS = {
    id: schema.commonUnitAssignments.id,
    status: schema.commonUnitAssignments.status,
    notes: schema.commonUnitAssignments.notes,
    trainerDepartment: schema.commonUnitAssignments.trainer_department,
    assignedByDepartment: schema.commonUnitAssignments.assigned_by_department,
    createdAt: schema.commonUnitAssignments.created_at,
    unitId: schema.commonUnitAssignments.unit_id,
    assignedBy: schema.commonUnitAssignments.assigned_by,
    trainerId: schema.commonUnitAssignments.trainer_id,
    unitName: schema.units.name,
    unitCode: schema.units.code,
    trainerName: trainerUsers.name,
    trainerEmail: trainerUsers.email,
    trainerDept: trainerUsers.department,
    assignerName: assignerUsers.name,
    assignerDept: assignerUsers.department,
};

function baseAssignmentQuery() {
    return db
        .select(ASSIGNMENT_COLUMNS)
        .from(schema.commonUnitAssignments)
        .leftJoin(schema.units, eq(schema.units.id, schema.commonUnitAssignments.unit_id))
        .leftJoin(trainerUsers, eq(trainerUsers.id, schema.commonUnitAssignments.trainer_id))
        .leftJoin(assignerUsers, eq(assignerUsers.id, schema.commonUnitAssignments.assigned_by));
}

// Get all common unit assignments (optionally filtered).
router.get('/common-unit-assignments', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { status = 'active', department, trainerId, commonUnitId } = req.query;
        const conds = [isNull(schema.commonUnitAssignments.deleted_at)];
        if (status) conds.push(eq(schema.commonUnitAssignments.status, status));
        if (department) conds.push(eq(schema.commonUnitAssignments.assigned_by_department, department));
        if (trainerId) conds.push(eq(schema.commonUnitAssignments.trainer_id, trainerId));
        if (commonUnitId) conds.push(eq(schema.commonUnitAssignments.unit_id, commonUnitId));

        const rows = await baseAssignmentQuery()
            .where(and(...conds))
            .orderBy(desc(schema.commonUnitAssignments.created_at));

        const assignments = rows.map(shapeAssignment);
        res.json({ success: true, assignments, total: assignments.length });
    } catch (error) {
        console.error('Error fetching common unit assignments:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching common unit assignments' });
    }
});

// Get common unit assignments by trainer.
router.get('/common-unit-assignments/trainer/:trainerId', verifyToken, authorize('admin', 'registrar', 'hod', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { status = 'active' } = req.query;
        const conds = [isNull(schema.commonUnitAssignments.deleted_at), eq(schema.commonUnitAssignments.trainer_id, trainerId)];
        if (status) conds.push(eq(schema.commonUnitAssignments.status, status));

        const rows = await baseAssignmentQuery()
            .where(and(...conds))
            .orderBy(desc(schema.commonUnitAssignments.created_at));

        const assignments = rows.map(shapeAssignment);
        res.json({ success: true, assignments, total: assignments.length });
    } catch (error) {
        console.error('Error fetching trainer common unit assignments:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching trainer assignments' });
    }
});

// Get common unit assignments by department (the assigning HOD's department).
router.get('/common-unit-assignments/department/:department', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { department } = req.params;
        const { status = 'active' } = req.query;
        const conds = [isNull(schema.commonUnitAssignments.deleted_at), eq(schema.commonUnitAssignments.assigned_by_department, department)];
        if (status) conds.push(eq(schema.commonUnitAssignments.status, status));

        const rows = await baseAssignmentQuery()
            .where(and(...conds))
            .orderBy(desc(schema.commonUnitAssignments.created_at));

        const assignments = rows.map(shapeAssignment);
        res.json({ success: true, assignments, total: assignments.length });
    } catch (error) {
        console.error('Error fetching department common unit assignments:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching department assignments' });
    }
});

// Create a new common unit assignment (assign a common unit to a trainer).
router.post('/common-unit-assignments', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { commonUnitId, trainerId, assignedBy, assignedByDepartment, trainerDepartment, notes } = req.body;

        if (!commonUnitId || !trainerId || !assignedBy || !assignedByDepartment || !trainerDepartment) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Verify the unit exists AND is actually flagged common. A non-common
        // (department-owned) unit must be assigned through the department-scoped
        // /assignments/assign flow, not here — this keeps the two flows separate.
        const [unit] = await db.select({ id: schema.units.id, isCommon: schema.units.is_common }).from(schema.units)
            .where(and(eq(schema.units.id, commonUnitId), isNull(schema.units.deleted_at))).limit(1);
        if (!unit) {
            return res.status(404).json({ success: false, message: 'Common unit not found' });
        }
        if (!unit.isCommon) {
            return res.status(400).json({ success: false, message: 'That unit is not a common unit. Use the department unit-allocation flow instead.', code: 'NOT_A_COMMON_UNIT' });
        }

        // Verify the trainer exists.
        const [trainer] = await db.select({ id: schema.users.id }).from(schema.users)
            .where(eq(schema.users.id, trainerId)).limit(1);
        if (!trainer) {
            return res.status(404).json({ success: false, message: 'Trainer not found' });
        }

        // Prevent duplicate active assignment of the same unit to the same trainer.
        const [existing] = await db.select({ id: schema.commonUnitAssignments.id })
            .from(schema.commonUnitAssignments)
            .where(and(
                eq(schema.commonUnitAssignments.unit_id, commonUnitId),
                eq(schema.commonUnitAssignments.trainer_id, trainerId),
                eq(schema.commonUnitAssignments.status, 'active'),
                isNull(schema.commonUnitAssignments.deleted_at),
            )).limit(1);
        if (existing) {
            return res.status(400).json({ success: false, message: 'This common unit is already assigned to this trainer' });
        }

        const [created] = await db.insert(schema.commonUnitAssignments).values({
            unit_id: commonUnitId,
            trainer_id: trainerId,
            assigned_by: assignedBy,
            assigned_by_department: assignedByDepartment,
            trainer_department: trainerDepartment,
            notes: notes || null,
            status: 'active',
        }).returning({ id: schema.commonUnitAssignments.id });

        const [row] = await baseAssignmentQuery().where(eq(schema.commonUnitAssignments.id, created.id)).limit(1);
        res.status(201).json({ success: true, assignment: shapeAssignment(row), message: 'Common unit assignment created successfully' });
    } catch (error) {
        console.error('Error creating common unit assignment:', error);
        res.status(500).json({ success: false, message: 'Server error while creating assignment' });
    }
});

// Update a common unit assignment (notes / status / trainer).
router.put('/common-unit-assignments/:assignmentId', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { notes, status, trainerId, trainerDepartment } = req.body;

        const [existing] = await db.select({ id: schema.commonUnitAssignments.id })
            .from(schema.commonUnitAssignments)
            .where(and(eq(schema.commonUnitAssignments.id, assignmentId), isNull(schema.commonUnitAssignments.deleted_at))).limit(1);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        const updates = { updated_at: new Date() };
        if (notes !== undefined) updates.notes = notes;
        if (status !== undefined) updates.status = status;
        if (trainerId !== undefined) updates.trainer_id = trainerId;
        if (trainerDepartment !== undefined) updates.trainer_department = trainerDepartment;

        await db.update(schema.commonUnitAssignments).set(updates).where(eq(schema.commonUnitAssignments.id, assignmentId));
        const [row] = await baseAssignmentQuery().where(eq(schema.commonUnitAssignments.id, assignmentId)).limit(1);
        res.json({ success: true, assignment: shapeAssignment(row), message: 'Assignment updated successfully' });
    } catch (error) {
        console.error('Error updating common unit assignment:', error);
        res.status(500).json({ success: false, message: 'Server error while updating assignment' });
    }
});

// Deactivate (soft-delete) a common unit assignment.
router.delete('/common-unit-assignments/:assignmentId', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const rows = await db.update(schema.commonUnitAssignments)
            .set({ status: 'inactive', deleted_at: new Date(), updated_at: new Date() })
            .where(and(eq(schema.commonUnitAssignments.id, assignmentId), isNull(schema.commonUnitAssignments.deleted_at)))
            .returning({ id: schema.commonUnitAssignments.id });
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        res.json({ success: true, message: 'Assignment deactivated successfully' });
    } catch (error) {
        console.error('Error deactivating common unit assignment:', error);
        res.status(500).json({ success: false, message: 'Server error while deactivating assignment' });
    }
});

module.exports = router;
