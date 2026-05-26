const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { escapeRegex } = require('../utils/validators');
const { Student, StudentNote, Notification } = require('../db/models');

// Get all students for Dean Portal
router.get('/dean/students', verifyToken, authorize('admin', 'dean', 'registrar'), async (req, res) => {
    try {
        const { course, department, year, intake, search } = req.query;

        let query = {};
        if (course) query.course = course;
        if (department) query.department = department;
        if (year) query.year = parseInt(year);
        if (intake) query.intake = intake;

        if (search) {
            // SEV-H-019: search comes from req.query; escape regex metachars.
            const safeSearch = escapeRegex(search);
            query.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { admissionNumber: { $regex: safeSearch, $options: 'i' } },
                { idNumber: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const students = await Student.find(query)
            .select('-password')
            .sort({ name: 1 });

        res.json(students);
    } catch (error) {
        console.error('Error fetching students for dean:', error);
        res.status(500).json({ message: 'Error fetching students' });
    }
});

// Add note to student
router.post('/dean/students/:studentId/notes', verifyToken, authorize('admin', 'dean'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { noteType, title, content, category, priority, createdBy } = req.body;

        if (!noteType || !title || !content || !createdBy) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const note = new StudentNote({
            studentId,
            studentName: student.name,
            admissionNumber: student.admissionNumber,
            noteType,
            title,
            content,
            category: category || 'general',
            priority: priority || 'medium',
            createdBy
        });

        await note.save();

        // If public note, create notification
        if (noteType === 'public') {
            await Notification.create({
                recipientId: studentId,
                recipientType: 'student',
                title: `New Note: ${title}`,
                message: content,
                type: 'general',
                relatedId: note._id.toString(),
                priority: priority || 'medium'
            });
        }

        res.json({
            success: true,
            message: 'Note added successfully',
            note
        });
    } catch (error) {
        console.error('Error adding student note:', error);
        res.status(500).json({ message: 'Error adding note', error: error.message });
    }
});

// Get student notes
router.get('/dean/students/:studentId/notes', verifyToken, authorize('admin', 'dean', 'registrar'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { noteType } = req.query;

        const notes = await StudentNote.getStudentNotes(studentId, noteType);
        res.json(notes);
    } catch (error) {
        console.error('Error fetching student notes:', error);
        res.status(500).json({ message: 'Error fetching notes' });
    }
});

// Get student's public notes (for student portal)
router.get('/students/:studentId/public-notes', verifyToken, authorize('student'), async (req, res) => {
    try {
        const { studentId } = req.params;

        // Public notes should be visible to all students, not just the assigned student
        // Remove studentId filter to show all public notes
        const notes = await StudentNote.find({
            noteType: 'public'
        }).sort({ createdAt: -1 });

        res.json({ notes });
    } catch (error) {
        console.error('Error fetching public notes:', error);
        res.status(500).json({ message: 'Error fetching public notes' });
    }
});

// Mark note as read
router.put('/students/:studentId/notes/:noteId/read', verifyToken, authorize('admin', 'dean', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { noteId } = req.params;

        const note = await StudentNote.findById(noteId);
        if (!note) {
            return res.status(404).json({ message: 'Note not found' });
        }

        note.isRead = true;
        note.readAt = new Date();
        await note.save();

        res.json({ success: true, message: 'Note marked as read' });
    } catch (error) {
        console.error('Error marking note as read:', error);
        res.status(500).json({ message: 'Error updating note' });
    }
});

module.exports = router;
