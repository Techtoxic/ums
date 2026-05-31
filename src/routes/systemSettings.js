const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const { SystemSettings, Unit, TrainerAssignment } = require('../db/models');
const { getCurrentAcademicYearLabel } = require('../utils/academicPeriod');

// Keys a finance officer (not just admin) may update, with validation. The
// academic year is computed dynamically and is NOT editable here.
const FINANCE_EDITABLE_KEYS = new Set(['fee_threshold', 'current_intake', 'current_semester', 'registration_enabled']);
const VALID_INTAKES = new Set(['january', 'may', 'september']);

function validateSettingValue(key, value) {
    if (key === 'fee_threshold') {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return 'Fee threshold must be a non-negative number';
        return null;
    }
    if (key === 'current_intake') {
        if (!VALID_INTAKES.has(String(value).toLowerCase())) return 'Intake must be January, May or September';
        return null;
    }
    if (key === 'current_academic_year') {
        return 'Academic year is calculated automatically (September–August) and cannot be set manually';
    }
    return null;
}

// Overlay the dynamically-computed academic year onto a settings list/object so
// every consumer sees the live September–August value regardless of what is
// stored in the table.
function withDynamicAcademicYear(settings) {
    const label = getCurrentAcademicYearLabel();
    if (Array.isArray(settings)) {
        const out = settings.map((s) => (s.key === 'current_academic_year' ? { ...s, value: label } : s));
        if (!out.some((s) => s.key === 'current_academic_year')) {
            out.push({ key: 'current_academic_year', value: label });
        }
        return out;
    }
    return settings;
}


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
            settings = await SystemSettings.find({});
        }

        res.json(withDynamicAcademicYear(settings));
    } catch (error) {
        console.error('Error fetching system settings:', error);
        res.status(500).json({ message: 'Error fetching system settings' });
    }
});

// Get a specific system setting
router.get('/system-settings/:key', verifyToken, authorize('admin', 'registrar', 'finance', 'dean', 'deputy', 'cibec', 'ilo', 'student', 'hod', 'trainer'), async (req, res) => {
    try {
        const { key } = req.params;
        if (key === 'current_academic_year') {
            return res.json({ key, value: getCurrentAcademicYearLabel() });
        }
        const setting = await SystemSettings.findOne({ key });

        if (!setting) {
            return res.status(404).json({ message: 'Setting not found' });
        }

        res.json(setting);
    } catch (error) {
        console.error('Error fetching system setting:', error);
        res.status(500).json({ message: 'Error fetching system setting' });
    }
});

// Update system setting. Admin may set any key; finance may set the
// finance-editable whitelist (fee threshold, current intake, registration
// toggle). Values are validated so the threshold (which gates unit
// registration) can never be stored as garbage.
router.put('/system-settings/:key', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;

        if (value === undefined) {
            return res.status(400).json({ message: 'Value is required' });
        }

        if (req.user.role === 'finance' && !FINANCE_EDITABLE_KEYS.has(key)) {
            return res.status(403).json({ message: 'You are not allowed to change this setting.' });
        }

        const validationError = validateSettingValue(key, value);
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        // Normalise typed values for the keys we own.
        let storedValue = value;
        if (key === 'fee_threshold') storedValue = Math.round(Number(value));
        if (key === 'current_intake') storedValue = String(value).toLowerCase();

        const setting = await SystemSettings.setSetting(key, storedValue, description, req.user.userId || null);
        res.json({ message: 'Setting updated successfully', setting });
    } catch (error) {
        console.error('Error updating system setting:', error);
        res.status(500).json({ message: 'Error updating system setting' });
    }
});

module.exports = router;
