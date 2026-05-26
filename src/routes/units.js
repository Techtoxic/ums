const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, isNull } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const { DEPT_TEXT_TO_SHORT, formatCourseNameServer } = require('../utils/formatters');
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
        // Modeled on the GET /api/units/department/:department endpoint below.
        const unitRows = await db
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
            .where(and(
                eq(schema.programs.code, courseCode.toUpperCase()),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.units.year, schema.units.code);

        // Registration status — only when an admission number is supplied.
        // studentId arrives as an admission number; resolve it to the student uuid,
        // then collect the unit_id uuids the student is registered for. A unit counts
        // as registered if any registration row exists for that student + unit.
        let registeredUnitIds = new Set();
        if (studentId) {
            const student = await Student.findOne({ admissionNumber: studentId });
            if (student) {
                const regs = await StudentUnitRegistration.find({ studentId: student.id });
                registeredUnitIds = new Set(regs.map(r => r.unitId));
            }
        }

        // Common units are just units rows with is_common = true (already included above).
        const units = unitRows.map(u => ({
            ...u,
            department: u.isCommon ? 'common' : 'department',
            type: u.isCommon ? 'common' : 'department',
            isRegistered: registeredUnitIds.has(u._id),
        }));

        if (units.length === 0) {
            return res.status(404).json({ message: 'No units found for this course' });
        }

        res.json({
            success: true,
            courseCode: courseCode,
            totalUnits: units.length,
            departmentUnits: units.filter(u => !u.isCommon).length,
            commonUnits: units.filter(u => u.isCommon).length,
            registeredUnits: units.filter(u => u.isRegistered).length,
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

// Get all courses
router.get('/courses', async (req, res) => {
    try {
        const { courseUnits } = require('../data/courseUnits');
        const courses = Object.keys(courseUnits).map(courseCode => ({
            code: courseCode,
            name: formatCourseNameServer(courseCode),
            department: courseUnits[courseCode].department,
            level: courseUnits[courseCode].level
        }));
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ message: 'Error fetching courses' });
    }
});

module.exports = router;
