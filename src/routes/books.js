// routes/books.js — Book Resource pipeline.
//
// Trainers (the spec's "lecturers") search open libraries and approve books for
// the units they teach; students see the books approved for the units they are
// registered in. Mounted under '/api', so routes below are '/books/...'.
//
// Authorization model (enforced server-side, never trust the client):
//   search / detail        → trainer, admin
//   approve / remove       → trainer who OWNS the unit, or admin
//   view books for a unit  → student registered in it, the unit's trainer, admin
//   my-books               → student (own registrations only)

const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, desc, inArray, isNull, or } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const bookSearch = require('../services/bookSearch');

// ---------------------------------------------------------------------------
// Ownership helpers
// ---------------------------------------------------------------------------

// A trainer "owns" a unit if it is assigned to them via either the regular
// trainer_assignments table or the common_unit_assignments table (active).
async function trainerOwnsUnit(trainerId, unitId) {
    const direct = await db
        .select({ id: schema.trainerAssignments.id })
        .from(schema.trainerAssignments)
        .where(and(
            eq(schema.trainerAssignments.trainer_id, trainerId),
            eq(schema.trainerAssignments.unit_id, unitId),
        ))
        .limit(1);
    if (direct.length) return true;

    const common = await db
        .select({ id: schema.commonUnitAssignments.id })
        .from(schema.commonUnitAssignments)
        .where(and(
            eq(schema.commonUnitAssignments.trainer_id, trainerId),
            eq(schema.commonUnitAssignments.unit_id, unitId),
            eq(schema.commonUnitAssignments.status, 'active'),
            isNull(schema.commonUnitAssignments.deleted_at),
        ))
        .limit(1);
    return common.length > 0;
}

// A student is enrolled in a unit if they have a unit_registrations row for it.
async function studentRegisteredInUnit(studentId, unitId) {
    const rows = await db
        .select({ id: schema.unitRegistrations.id })
        .from(schema.unitRegistrations)
        .where(and(
            eq(schema.unitRegistrations.student_id, studentId),
            eq(schema.unitRegistrations.unit_id, unitId),
        ))
        .limit(1);
    return rows.length > 0;
}

// Shape a DB row into the API book shape.
function rowToBook(r) {
    return {
        id: r.id,
        unitId: r.unit_id,
        externalId: r.external_id,
        source: r.source,
        title: r.title,
        authors: r.authors || [],
        coverUrl: r.cover_url,
        description: r.description,
        subject: r.subject,
        pdfUrl: r.pdf_url,
        previewUrl: r.preview_url,
        language: r.language,
        approvedBy: r.approved_by,
        approvedAt: r.approved_at,
        isActive: r.is_active,
    };
}

// ---------------------------------------------------------------------------
// GET /books/search — dual-provider search (trainer/admin)
// ---------------------------------------------------------------------------
router.get('/books/search', verifyToken, authorize('trainer', 'admin'), async (req, res) => {
    try {
        const { q = '', subject, language, source, yearFrom, yearTo, page } = req.query;
        const data = await bookSearch.searchBooks(String(q).trim(), {
            subject, language, source, yearFrom, yearTo, page,
        });
        return res.json({ success: true, ...data });
    } catch (error) {
        console.error('GET /books/search failed:', error);
        return res.status(500).json({ success: false, message: 'Book search failed' });
    }
});

// ---------------------------------------------------------------------------
// GET /books/detail?source=&id= — full detail for one external book
// ---------------------------------------------------------------------------
router.get('/books/detail', verifyToken, authorize('trainer', 'admin'), async (req, res) => {
    try {
        const { source, id } = req.query;
        if (!source || !id) {
            return res.status(400).json({ success: false, message: 'source and id are required' });
        }
        const book = await bookSearch.getBookDetail(String(source), String(id));
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
        return res.json({ success: true, book });
    } catch (error) {
        console.error('GET /books/detail failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load book detail' });
    }
});

// ---------------------------------------------------------------------------
// POST /books/approve — approve a book for a unit (owning trainer or admin)
// ---------------------------------------------------------------------------
router.post('/books/approve', verifyToken, authorize('trainer', 'admin'), async (req, res) => {
    try {
        const b = req.body || {};
        const required = ['unit_id', 'external_id', 'source', 'title'];
        const missing = required.filter((k) => !b[k]);
        if (missing.length) {
            return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });
        }

        // Ownership: admins bypass; trainers must own the unit.
        if (req.user.role !== 'admin') {
            const owns = await trainerOwnsUnit(req.user.userId, b.unit_id);
            if (!owns) {
                return res.status(403).json({ success: false, message: 'You do not teach this unit.' });
            }
        }

        const authors = Array.isArray(b.authors)
            ? b.authors
            : (typeof b.authors === 'string' && b.authors ? [b.authors] : []);

        const values = {
            unit_id: b.unit_id,
            approved_by: req.user.userId,
            external_id: String(b.external_id),
            source: String(b.source),
            title: String(b.title),
            authors,
            cover_url: b.cover_url || null,
            description: b.description || null,
            subject: b.subject || null,
            pdf_url: b.pdf_url || null,
            preview_url: b.preview_url || null,
            language: b.language || 'en',
        };

        try {
            const [saved] = await db.insert(schema.unitBooks).values(values).returning();
            return res.status(201).json({ success: true, book: rowToBook(saved) });
        } catch (err) {
            // Unique (unit_id, external_id, source) violation → already approved.
            if (err && err.code === '23505') {
                // Re-activate a previously removed book rather than erroring.
                const [existing] = await db
                    .update(schema.unitBooks)
                    .set({ is_active: true, updated_at: new Date(), approved_by: req.user.userId })
                    .where(and(
                        eq(schema.unitBooks.unit_id, b.unit_id),
                        eq(schema.unitBooks.external_id, String(b.external_id)),
                        eq(schema.unitBooks.source, String(b.source)),
                    ))
                    .returning();
                return res.status(200).json({ success: true, book: rowToBook(existing), reactivated: true });
            }
            throw err;
        }
    } catch (error) {
        console.error('POST /books/approve failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to approve book' });
    }
});

// ---------------------------------------------------------------------------
// DELETE /books/approve/:bookId — soft-remove a book from a unit
// ---------------------------------------------------------------------------
router.delete('/books/approve/:bookId', verifyToken, authorize('trainer', 'admin'), async (req, res) => {
    try {
        const { bookId } = req.params;
        const [book] = await db
            .select()
            .from(schema.unitBooks)
            .where(eq(schema.unitBooks.id, bookId))
            .limit(1);
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        if (req.user.role !== 'admin') {
            const owns = await trainerOwnsUnit(req.user.userId, book.unit_id);
            if (!owns) {
                return res.status(403).json({ success: false, message: 'You do not teach this unit.' });
            }
        }

        await db
            .update(schema.unitBooks)
            .set({ is_active: false, updated_at: new Date() })
            .where(eq(schema.unitBooks.id, bookId));
        return res.json({ success: true, message: 'Book removed from unit' });
    } catch (error) {
        console.error('DELETE /books/approve failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to remove book' });
    }
});

// ---------------------------------------------------------------------------
// GET /books/unit/:unitId — active books for a unit
//   students must be registered; the unit's trainer or admin may also view.
// ---------------------------------------------------------------------------
router.get('/books/unit/:unitId', verifyToken, async (req, res) => {
    try {
        const { unitId } = req.params;
        const role = req.user.role;

        if (role === 'admin') {
            // allowed
        } else if (role === 'trainer') {
            const owns = await trainerOwnsUnit(req.user.userId, unitId);
            if (!owns) return res.status(403).json({ success: false, message: 'You do not teach this unit.' });
        } else if (role === 'student') {
            const enrolled = await studentRegisteredInUnit(req.user.userId, unitId);
            if (!enrolled) return res.status(403).json({ success: false, message: 'You are not registered for this unit.' });
        } else {
            return res.status(403).json({ success: false, message: 'Not permitted.' });
        }

        const rows = await db
            .select()
            .from(schema.unitBooks)
            .where(and(eq(schema.unitBooks.unit_id, unitId), eq(schema.unitBooks.is_active, true)))
            .orderBy(desc(schema.unitBooks.approved_at));
        return res.json({ success: true, books: rows.map(rowToBook) });
    } catch (error) {
        console.error('GET /books/unit failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load unit books' });
    }
});

// ---------------------------------------------------------------------------
// GET /books/my-books — a student's books, grouped by registered unit
// ---------------------------------------------------------------------------
router.get('/books/my-books', verifyToken, authorize('student'), async (req, res) => {
    try {
        const studentId = req.user.userId;

        // Units the student is registered for.
        const regs = await db
            .select({ unitId: schema.unitRegistrations.unit_id })
            .from(schema.unitRegistrations)
            .where(eq(schema.unitRegistrations.student_id, studentId));
        const unitIds = [...new Set(regs.map((r) => r.unitId))];
        if (!unitIds.length) return res.json({ success: true, groups: [] });

        // Active books for those units + the unit metadata, in two indexed reads.
        const [books, units] = await Promise.all([
            db.select()
                .from(schema.unitBooks)
                .where(and(inArray(schema.unitBooks.unit_id, unitIds), eq(schema.unitBooks.is_active, true)))
                .orderBy(desc(schema.unitBooks.approved_at)),
            db.select({
                id: schema.units.id,
                name: schema.units.name,
                code: schema.units.code,
            }).from(schema.units).where(inArray(schema.units.id, unitIds)),
        ]);

        const unitById = new Map(units.map((u) => [u.id, u]));
        const groupsByUnit = new Map();
        for (const row of books) {
            if (!groupsByUnit.has(row.unit_id)) {
                const u = unitById.get(row.unit_id) || { id: row.unit_id, name: 'Unit', code: '' };
                groupsByUnit.set(row.unit_id, { unit: { id: u.id, name: u.name, code: u.code }, books: [] });
            }
            groupsByUnit.get(row.unit_id).books.push(rowToBook(row));
        }
        // Only return units that actually have books.
        return res.json({ success: true, groups: [...groupsByUnit.values()] });
    } catch (error) {
        console.error('GET /books/my-books failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to load your books' });
    }
});

module.exports = router;
