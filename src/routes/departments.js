const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { verifyToken } = require('../middleware/auth');
const { DEPT_SHORT_TO_TEXT } = require('../utils/formatters');

// Get all departments - authenticated (used by every portal's department
// dropdowns and label lookups; Rule 7: no hardcoded department lists frontend).
//
// `textCode` is the snake_case key stored on students.department / users.department
// (reverse of DEPT_TEXT_TO_SHORT) — dropdowns emit it as the option value so the
// existing SQL joins and finance grouping keep working.
router.get('/departments', verifyToken, async (req, res) => {
    try {
        const rows = await db
            .select({
                id: schema.departments.id,
                code: schema.departments.code,
                name: schema.departments.name,
            })
            .from(schema.departments)
            .orderBy(schema.departments.name);

        const departments = rows.map(d => ({
            id: d.id,
            code: d.code,
            name: d.name,
            textCode: DEPT_SHORT_TO_TEXT[d.code] || null,
        }));
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ message: 'Error fetching departments' });
    }
});

module.exports = router;
