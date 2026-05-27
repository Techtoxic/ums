const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const { SystemSettings, Unit, TrainerAssignment } = require('../db/models');

// Diagnostic: Get units without trainer assignments
router.get('/diagnostics/unassigned-units', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        // Get all active units
        const allUnits = await Unit.find({ isActive: true }).select('unitCode unitName courseCode department');

        // Get all trainer assignments
        const assignments = await TrainerAssignment.find({ status: 'active' }).select('unitId');
        const assignedUnitIds = assignments.map(a => a.unitId.toString());

        // Find units without assignments
        const unassignedUnits = allUnits.filter(unit =>
            !assignedUnitIds.includes(unit._id.toString())
        );

        console.log(`Diagnostic: ${unassignedUnits.length} units without trainer assignments:`,
            unassignedUnits.map(u => ({ unitCode: u.unitCode, unitName: u.unitName }))
        );

        res.json({
            totalUnits: allUnits.length,
            assignedUnits: assignedUnitIds.length,
            unassignedUnits: unassignedUnits.length,
            unassignedUnitsList: unassignedUnits.map(unit => ({
                unitId: unit._id,
                unitCode: unit.unitCode,
                unitName: unit.unitName,
                courseCode: unit.courseCode,
                department: unit.department
            }))
        });

    } catch (error) {
        console.error('Error in diagnostics:', error);
        res.status(500).json({ message: 'Diagnostic failed' });
    }
});

// Get all system settings
router.get('/system-settings', verifyToken, authorize('admin', 'registrar', 'student', 'finance'), async (req, res) => {
    try {
        const { category } = req.query;
        let settings;

        if (category) {
            settings = await SystemSettings.getSettingsByCategory(category);
        } else {
            settings = await SystemSettings.find({ isActive: true }).sort({ category: 1, key: 1 });
        }

        res.json(settings);
    } catch (error) {
        console.error('Error fetching system settings:', error);
        res.status(500).json({ message: 'Error fetching system settings' });
    }
});

// Get a specific system setting
router.get('/system-settings/:key', verifyToken, authorize('admin', 'registrar', 'finance', 'dean', 'deputy', 'cibec', 'ilo'), async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await SystemSettings.findOne({ key, isActive: true });

        if (!setting) {
            return res.status(404).json({ message: 'Setting not found' });
        }

        res.json(setting);
    } catch (error) {
        console.error('Error fetching system setting:', error);
        res.status(500).json({ message: 'Error fetching system setting' });
    }
});

// Update system setting
router.put('/system-settings/:key', verifyToken, authorize('admin'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;

        if (value === undefined) {
            return res.status(400).json({ message: 'Value is required' });
        }

        const setting = await SystemSettings.setSetting(key, value, description);
        res.json({ message: 'Setting updated successfully', setting });
    } catch (error) {
        console.error('Error updating system setting:', error);
        res.status(500).json({ message: 'Error updating system setting' });
    }
});

module.exports = router;
