const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull } = require('drizzle-orm');
const { verifyToken, authorize, verifyOwnership, signToken, setAuthCookie, setCsrfCookie, generateCsrfToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { isValidId } = require('../utils/validators');
const { hodDepartmentDisplayName } = require('../utils/formatters');
const userService = require('../services/userService');
const { HOD } = require('../db/models');

// Get trainers from all departments for common unit assignment
router.get('/trainers/all-departments', verifyToken, authorize('admin', 'hod', 'registrar', 'deputy', 'finance'), async (req, res) => {
    try {
        // A trainer is a users row with role = 'trainer'. Select only real
        // columns (the old V1 select referenced a field that has no column).
        // Finance lists these to pick whose payslips to generate, then posts
        // the ids to /api/payslips/generate.
        const trainers = await db
            .select({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                department: schema.users.department,
            })
            .from(schema.users)
            .where(and(
                eq(schema.users.role, 'trainer'),
                eq(schema.users.is_active, true),
            ))
            .orderBy(schema.users.department, schema.users.name);

        // Group by department. Trainers with no department land under 'Unassigned'.
        const trainersByDepartment = trainers.reduce((acc, trainer) => {
            const dept = trainer.department || 'Unassigned';
            if (!acc[dept]) {
                acc[dept] = [];
            }
            acc[dept].push(trainer);
            return acc;
        }, {});

        res.json({
            success: true,
            trainers: trainers,
            trainersByDepartment: trainersByDepartment,
            departments: Object.keys(trainersByDepartment).sort()
        });
    } catch (error) {
        console.error('Error fetching trainers from all departments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching trainers'
        });
    }
});

// HOD & Trainer Management API Routes

// HOD Authentication
router.post('/hod/login', authLimiter, async (req, res) => {
    try {
        const { department, password } = req.body;

        if (!department || !password) {
            return res.status(400).json({ message: 'Department and password are required' });
        }

        const genericFail = { message: 'Invalid department or password' };

        // V2 Path B: direct Drizzle via userService.
        const hod = await userService.findActiveByDepartmentAndRole(String(department), 'hod');
        if (!hod) {
            return res.status(401).json(genericFail);
        }

        const isValidPassword = await userService.comparePassword(hod, password);
        if (!isValidPassword) {
            return res.status(401).json(genericFail);
        }

        await userService.updateLastLogin(hod.id);

        const token = signToken({
            userId: String(hod.id),
            email: hod.email,
            role: 'hod',
            tokenVersion: hod.token_version || 0 // SEV-H-013
        });

        setAuthCookie(res, token);
        setCsrfCookie(res, generateCsrfToken());
        res.json({
            message: 'Login successful',
            token,
            user: {
                _id: hod.id,                              // V1-compat alias
                department: hod.department,
                departmentName: hodDepartmentDisplayName(hod.department),
                name: hod.name,
                email: hod.email
            }
        });
    } catch (error) {
        console.error('HOD login error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update HOD profile (email and phone)
router.put('/hod/:hodId/profile', verifyToken, authorize('admin', 'hod'), verifyOwnership('hodId'), async (req, res) => {
    try {
        const { hodId } = req.params;
        const { email, phone } = req.body;

        // Validate HOD ID format
        if (!isValidId(hodId)) {
            return res.status(400).json({ message: 'Invalid HOD ID format' });
        }

        // Find HOD
        // SEV-H-018: load select:false password so the hod.save() below does
        // not fail required-field validation on profile update.
        const hod = await HOD.findById(hodId).select('+password');
        if (!hod) {
            return res.status(404).json({ message: 'HOD not found' });
        }

        // Update fields if provided
        if (email && email !== hod.email) {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }

            // Check if email is already in use
            const existingHOD = await HOD.findOne({ email: email, _id: { $ne: hodId } });
            if (existingHOD) {
                return res.status(400).json({ message: 'Email address is already in use' });
            }
            hod.email = email;
        }

        if (phone !== undefined) {
            hod.phone = phone || null;
        }

        hod.updatedAt = new Date();
        await hod.save();

        console.log(`✅ Updated profile for HOD: ${hod.name}`);

        res.json({
            message: 'Profile updated successfully',
            hod: {
                _id: hod._id,
                name: hod.name,
                email: hod.email,
                phone: hod.phone,
                department: hod.department,
                departmentName: HOD.getDepartmentDisplayName(hod.department)
            }
        });
    } catch (error) {
        console.error('Error updating HOD profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get departments for HOD login
router.get('/hod/departments', (req, res) => {
    const departments = [
        { code: 'applied_science',       name: 'Applied Science' },
        { code: 'agriculture',           name: 'Agriculture' },
        { code: 'building_civil',        name: 'Building & Civil Engineering' },
        { code: 'electromechanical',     name: 'Electromechanical Engineering' },
        { code: 'hospitality',           name: 'Hospitality' },
        { code: 'business_liberal',      name: 'Business & Liberal Studies' },
        { code: 'computing_informatics', name: 'Computing & Informatics' },
    ];
    res.json(departments);
});

// Get trainers by department
router.get('/trainers/department/:department', verifyToken, authorize('admin', 'hod', 'registrar', 'deputy'), async (req, res) => {
    try {
        const { department } = req.params;
        const rows = await db
            .select({
                _id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                department: schema.users.department,
                phone: schema.users.phone,
            })
            .from(schema.users)
            .where(and(
                eq(schema.users.role, 'trainer'),
                eq(schema.users.department, department),
                eq(schema.users.is_active, true),
                isNull(schema.users.deleted_at),
            ))
            .orderBy(schema.users.name);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching trainers:', error);
        res.status(500).json({ message: 'Failed to fetch trainers' });
    }
});

module.exports = router;
