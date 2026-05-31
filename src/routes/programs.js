const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { verifyToken, authorize } = require('../middleware/auth');
const { toDecimal128, DEPT_TEXT_TO_SHORT } = require('../utils/formatters');
const { Program } = require('../db/models');

// Create a new program
router.post('/programs', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { programName, programCost, department } = req.body;

        if (!programName || programCost === undefined || !department) {
            return res.status(400).json({ message: 'Please provide program name, cost, and department' });
        }

        if (isNaN(programCost) || programCost <= 0) {
            return res.status(400).json({ message: 'Program cost must be a positive number' });
        }

        const existingProgram = await Program.findOne({ programName });
        if (existingProgram) {
            return res.status(400).json({ message: 'A program with this name already exists' });
        }

        const program = await Program.create({
            programName,
            programCost: toDecimal128(programCost), // SEV-H-016: store exact money
            department
        });

        res.status(201).json({
            message: 'Program created successfully',
            program
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: messages.join(', ') });
        }

        if (error.code === 11000) {
            return res.status(400).json({ message: 'A program with this name already exists' });
        }

        console.error('Error creating program:', error);
        res.status(500).json({ message: 'Error creating program' });
    }
});

// Get all programs - authenticated (catalog metadata for portal dropdowns).
router.get('/programs', verifyToken, async (req, res) => {
    try {
        const programs = await Program.find().sort({ createdAt: -1 });
        // V2: programs carry departmentId (UUID) but no department name. Attach
        // departmentName via a read-only lookup so the finance dashboard (and any
        // other consumer) can display it without a second round trip. Existing
        // fields are preserved — departmentName is purely additive.
        const deptRows = await db
            .select({ id: schema.departments.id, name: schema.departments.name, code: schema.departments.code })
            .from(schema.departments);
        // Reverse the snake_case → 2-letter map so we can attach the snake_case
        // department key (e.g. 'applied_science') that students/users store and
        // that the frontend dropdowns must emit as option values.
        const shortToText = {};
        for (const [text, short] of Object.entries(DEPT_TEXT_TO_SHORT)) shortToText[short] = text;
        const deptById = {};
        for (const d of deptRows) deptById[d.id] = d;
        const enriched = programs.map((p) => {
            const obj = (typeof p.toJSON === 'function') ? p.toJSON() : { ...p };
            const dept = deptById[obj.departmentId];
            obj.departmentName = dept ? dept.name : null;
            obj.departmentCode = dept ? (shortToText[dept.code] || null) : null;
            return obj;
        });
        res.json(enriched);
    } catch (error) {
        console.error('Error fetching programs:', error);
        res.status(500).json({ message: 'Error fetching programs' });
    }
});

// Get a specific program
router.get('/programs/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const program = await Program.findById(req.params.id);

        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        res.json(program);
    } catch (error) {
        console.error('Error fetching program:', error);
        res.status(500).json({ message: 'Error fetching program' });
    }
});

// Update a program
router.put('/programs/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { programName, programCost, department } = req.body;
        const { id } = req.params;

        if (!programName || programCost === undefined || !department) {
            return res.status(400).json({ message: 'Please provide program name, cost, and department' });
        }

        if (isNaN(programCost) || programCost <= 0) {
            return res.status(400).json({ message: 'Program cost must be a positive number' });
        }

        const program = await Program.findById(id);
        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        const existingProgram = await Program.findOne({ programName, _id: { $ne: id } });
        if (existingProgram) {
            return res.status(400).json({ message: 'A program with this name already exists' });
        }

        const updatedProgram = await Program.findByIdAndUpdate(
            id,
            { programName, programCost: toDecimal128(programCost), department }, // SEV-H-016
            { new: true, runValidators: true }
        );

        res.json({
            message: 'Program updated successfully',
            program: updatedProgram
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: messages.join(', ') });
        }

        console.error('Error updating program:', error);
        res.status(500).json({ message: 'Error updating program' });
    }
});

// Delete a program
router.delete('/programs/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const program = await Program.findByIdAndDelete(req.params.id);

        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        res.json({ message: 'Program deleted successfully' });
    } catch (error) {
        console.error('Error deleting program:', error);
        res.status(500).json({ message: 'Error deleting program' });
    }
});

module.exports = router;
