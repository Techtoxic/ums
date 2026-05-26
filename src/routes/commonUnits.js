const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull } = require('drizzle-orm');
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
        const commonUnit = await CommonUnit.findByCode(unitCode);

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

        // Check if unit code already exists
        const existingUnit = await CommonUnit.findOne({
            unitCode: commonUnitData.unitCode.toUpperCase()
        });

        if (existingUnit) {
            return res.status(400).json({
                success: false,
                message: 'Common unit with this code already exists'
            });
        }

        const commonUnit = new CommonUnit(commonUnitData);
        await commonUnit.save();

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

// Get all common unit assignments
router.get('/common-unit-assignments', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { status = 'active', department, trainerId, commonUnitId } = req.query;

        let query = { status };
        if (department) query.assignedByDepartment = department;
        if (trainerId) query.trainerId = trainerId;
        if (commonUnitId) query.commonUnitId = commonUnitId;

        const assignments = await CommonUnitAssignment.find(query)
            .populate('commonUnitId')
            .populate('trainerId', 'name email department')
            .populate('assignedBy', 'name department')
            .sort({ assignedAt: -1 });

        res.json({
            success: true,
            assignments: assignments,
            total: assignments.length
        });
    } catch (error) {
        console.error('Error fetching common unit assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching common unit assignments'
        });
    }
});

// Get common unit assignments by trainer
router.get('/common-unit-assignments/trainer/:trainerId', verifyToken, authorize('admin', 'registrar', 'hod', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { status = 'active' } = req.query;

        const assignments = await CommonUnitAssignment.getAssignmentsByTrainer(trainerId, status);

        res.json({
            success: true,
            assignments: assignments,
            total: assignments.length
        });
    } catch (error) {
        console.error('Error fetching trainer common unit assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching trainer assignments'
        });
    }
});

// Get common unit assignments by department
router.get('/common-unit-assignments/department/:department', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { department } = req.params;
        const { status = 'active' } = req.query;

        const assignments = await CommonUnitAssignment.getAssignmentsByDepartment(department, status);

        res.json({
            success: true,
            assignments: assignments,
            total: assignments.length
        });
    } catch (error) {
        console.error('Error fetching department common unit assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching department assignments'
        });
    }
});

// Create new common unit assignment
router.post('/common-unit-assignments', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { commonUnitId, trainerId, assignedBy, assignedByDepartment, trainerDepartment, notes } = req.body;

        console.log('📝 Common unit assignment request body:', req.body);
        console.log('🔍 Field validation:');
        console.log('  commonUnitId:', commonUnitId ? '✅' : '❌');
        console.log('  trainerId:', trainerId ? '✅' : '❌');
        console.log('  assignedBy:', assignedBy ? '✅' : '❌');
        console.log('  assignedByDepartment:', assignedByDepartment ? '✅' : '❌');
        console.log('  trainerDepartment:', trainerDepartment ? '✅' : '❌');

        // Validate required fields
        if (!commonUnitId || !trainerId || !assignedBy || !assignedByDepartment || !trainerDepartment) {
            console.log('❌ Validation failed - missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Check if assignment already exists
        const existingAssignment = await CommonUnitAssignment.findOne({
            commonUnitId,
            trainerId,
            status: 'active'
        });

        if (existingAssignment) {
            return res.status(400).json({
                success: false,
                message: 'This common unit is already assigned to this trainer'
            });
        }

        // Verify common unit exists
        const commonUnit = await CommonUnit.findById(commonUnitId);
        if (!commonUnit) {
            return res.status(404).json({
                success: false,
                message: 'Common unit not found'
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

        // Create assignment
        const assignment = new CommonUnitAssignment({
            commonUnitId,
            trainerId,
            assignedBy,
            assignedByDepartment,
            trainerDepartment,
            notes
        });

        await assignment.save();

        // Populate the assignment for response
        await assignment.populate('commonUnitId');
        await assignment.populate('trainerId', 'name email department');
        await assignment.populate('assignedBy', 'name department');

        res.status(201).json({
            success: true,
            assignment: assignment,
            message: 'Common unit assignment created successfully'
        });
    } catch (error) {
        console.error('Error creating common unit assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating assignment'
        });
    }
});

// Update common unit assignment
router.put('/common-unit-assignments/:assignmentId', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const updateData = req.body;

        const assignment = await CommonUnitAssignment.findById(assignmentId);
        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        if (!assignment.canModify()) {
            return res.status(400).json({
                success: false,
                message: 'This assignment cannot be modified'
            });
        }

        Object.assign(assignment, updateData);
        await assignment.save();

        await assignment.populate('commonUnitId');
        await assignment.populate('trainerId', 'name email department');
        await assignment.populate('assignedBy', 'name department');

        res.json({
            success: true,
            assignment: assignment,
            message: 'Assignment updated successfully'
        });
    } catch (error) {
        console.error('Error updating common unit assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating assignment'
        });
    }
});

// Delete/deactivate common unit assignment
router.delete('/common-unit-assignments/:assignmentId', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { assignmentId } = req.params;

        const assignment = await CommonUnitAssignment.findByIdAndUpdate(
            assignmentId,
            { status: 'inactive' },
            { new: true }
        );

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        res.json({
            success: true,
            message: 'Assignment deactivated successfully'
        });
    } catch (error) {
        console.error('Error deactivating common unit assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deactivating assignment'
        });
    }
});

module.exports = router;
