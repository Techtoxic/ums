const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, or, isNull, ilike, sql, desc, asc } = require('drizzle-orm');
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { escapeRegex } = require('../utils/validators');
const { getCourseDisplayName, getCourseCode, getDepartmentDisplayName } = require('../utils/courseCodes');
const { Student, StudentNote, Notification } = require('../db/models');

// Get all students for Dean Portal (PAGINATED).
//
// Returns the same { students, total, page, totalPages, limit } envelope the
// main /students endpoint uses, plus the dean-specific filters (department,
// module, intake, course, search). Set `?all=1` to fetch everything in one go
// (used by the dean dashboard's per-module breakdown widget).
router.get('/dean/students', verifyToken, authorize('admin', 'dean', 'registrar'), async (req, res) => {
    try {
        const {
            course,
            department,
            module: moduleField,
            intake,
            search,
            page: pageParam,
            limit: limitParam,
            all,
        } = req.query;

        const conds = [isNull(schema.students.deleted_at)];
        if (course) conds.push(eq(schema.students.course, course));
        if (department) conds.push(eq(schema.students.department, department));
        if (moduleField) {
            const n = parseInt(moduleField, 10);
            if (Number.isFinite(n)) conds.push(eq(schema.students.module, n));
        }
        if (intake) conds.push(eq(schema.students.intake, String(intake).toLowerCase()));
        if (search && String(search).trim()) {
            const needle = '%' + String(search).trim().replace(/[%_]/g, m => '\\' + m) + '%';
            conds.push(or(
                ilike(schema.students.name, needle),
                ilike(schema.students.admission_number, needle),
                ilike(schema.students.id_number, needle),
                ilike(schema.students.email, needle),
                ilike(schema.students.phone_number, needle),
            ));
        }
        const where = and(...conds);

        const allFlag = String(all || limitParam || '').toLowerCase() === 'all' || all === '1' || all === 'true';
        let page = parseInt(pageParam, 10);
        if (!Number.isFinite(page) || page < 1) page = 1;
        let limit = parseInt(limitParam, 10);
        if (!Number.isFinite(limit) || limit < 1) limit = 20;
        if (limit > 200) limit = 200;

        const countRows = await db.select({ c: sql`count(*)` }).from(schema.students).where(where);
        const total = Number(countRows[0]?.c || 0);

        let q = db.select({
            _id: schema.students.id,
            id: schema.students.id,
            admissionNumber: schema.students.admission_number,
            name: schema.students.name,
            idNumber: schema.students.id_number,
            course: schema.students.course,
            department: schema.students.department,
            module: schema.students.module,
            intake: schema.students.intake,
            intakeYear: schema.students.intake_year,
            phoneNumber: schema.students.phone_number,
            email: schema.students.email,
            kcseGrade: schema.students.kcse_grade,
            createdAt: schema.students.created_at,
        }).from(schema.students).where(where).orderBy(asc(schema.students.name));

        if (!allFlag) q = q.limit(limit).offset((page - 1) * limit);
        const rows = await q;

        const decorated = rows.map(r => ({
            ...r,
            courseName: getCourseDisplayName(r.course),
            courseCode: getCourseCode(r.course) || r.course,
            departmentName: getDepartmentDisplayName(r.department),
        }));

        const effectiveLimit = allFlag ? Math.max(total, 1) : limit;
        const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

        res.json({
            students: decorated,
            total,
            page,
            limit: effectiveLimit,
            totalPages,
        });
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

        const note = await StudentNote.create({
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
