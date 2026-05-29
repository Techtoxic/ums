const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, sql, desc, isNull } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const { toMoneyNumber } = require('../utils/formatters');
const { getCourseCode, getCourseDisplayName, getDepartmentDisplayName } = require('../utils/courseCodes');

// ---------------------------------------------------------------------------
// Build a course -> program-cost resolver from the loaded programs. Matches on
// the canonical display name first, then the registration code (the programs
// table and course-code config disagree on some short codes, so name wins).
// ---------------------------------------------------------------------------
function buildCostResolver(programs) {
    const byName = new Map();
    const byCode = new Map();
    for (const p of programs) {
        if (p.name) byName.set(String(p.name).toLowerCase(), toMoneyNumber(p.program_cost));
        if (p.code) byCode.set(String(p.code).toLowerCase(), toMoneyNumber(p.program_cost));
    }
    return (course) => {
        const name = getCourseDisplayName(course);
        if (name && byName.has(name.toLowerCase())) return byName.get(name.toLowerCase());
        const code = getCourseCode(course);
        if (code && byCode.has(code.toLowerCase())) return byCode.get(code.toLowerCase());
        return 0;
    };
}

// ===========================================================================
// REVENUE — non-tuition institutional income (farm sales, bus rental, ...)
// ===========================================================================

// Record a revenue entry.
router.post('/revenue', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { note, amount, source } = req.body;
        if (!note || String(note).trim() === '') {
            return res.status(400).json({ message: 'A note describing the revenue source is required' });
        }
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }
        const [row] = await db.insert(schema.revenueEntries).values({
            note: String(note).trim(),
            amount: String(amt),
            source: source ? String(source).trim() : null,
            recorded_by: req.user.userId || null,
        }).returning();
        res.status(201).json({ message: 'Revenue recorded successfully', entry: row });
    } catch (error) {
        console.error('Error recording revenue:', error);
        res.status(500).json({ message: 'Error recording revenue' });
    }
});

// List revenue entries + small analytics.
router.get('/revenue', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const rows = await db
            .select({
                id: schema.revenueEntries.id,
                note: schema.revenueEntries.note,
                amount: schema.revenueEntries.amount,
                source: schema.revenueEntries.source,
                createdAt: schema.revenueEntries.created_at,
                recordedByName: schema.users.name,
            })
            .from(schema.revenueEntries)
            .leftJoin(schema.users, eq(schema.users.id, schema.revenueEntries.recorded_by))
            .where(isNull(schema.revenueEntries.deleted_at))
            .orderBy(desc(schema.revenueEntries.created_at));

        const entries = rows.map((r) => ({ ...r, amount: toMoneyNumber(r.amount) }));
        const total = entries.reduce((s, e) => s + e.amount, 0);

        // Group by month for a small trend.
        const byMonth = {};
        for (const e of entries) {
            const d = new Date(e.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            byMonth[key] = (byMonth[key] || 0) + e.amount;
        }
        const monthlyTrend = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }));

        res.json({
            entries,
            summary: { total, count: entries.length, monthlyTrend },
        });
    } catch (error) {
        console.error('Error fetching revenue:', error);
        res.status(500).json({ message: 'Error fetching revenue' });
    }
});

// Soft-delete a revenue entry.
router.delete('/revenue/:id', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await db.update(schema.revenueEntries)
            .set({ deleted_at: new Date(), updated_at: new Date() })
            .where(eq(schema.revenueEntries.id, id)).returning();
        if (!rows.length) return res.status(404).json({ message: 'Revenue entry not found' });
        res.json({ message: 'Revenue entry deleted' });
    } catch (error) {
        console.error('Error deleting revenue:', error);
        res.status(500).json({ message: 'Error deleting revenue' });
    }
});

// ===========================================================================
// FINANCE ANALYTICS — accurate aggregates straight from the database.
// ===========================================================================
router.get('/finance/analytics', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        // Pull the raw data once.
        const [students, programs, payments, revenueRows] = await Promise.all([
            db.select({
                id: schema.students.id,
                course: schema.students.course,
                department: schema.students.department,
                module: schema.students.module,
            }).from(schema.students).where(isNull(schema.students.deleted_at)),
            db.select({ code: schema.programs.code, name: schema.programs.name, program_cost: schema.programs.program_cost }).from(schema.programs),
            db.select({
                studentId: schema.payments.student_id,
                amount: schema.payments.amount,
                mode: schema.payments.payment_mode,
                date: schema.payments.payment_date,
            }).from(schema.payments),
            db.select({ amount: schema.revenueEntries.amount, source: schema.revenueEntries.source, createdAt: schema.revenueEntries.created_at })
                .from(schema.revenueEntries).where(isNull(schema.revenueEntries.deleted_at)),
        ]);

        const costOf = buildCostResolver(programs);

        // Payments grouped by student (student_id is a UUID).
        const paidByStudent = new Map();
        let tuitionRevenue = 0;
        const modeStats = {};
        const monthly = {};
        for (const p of payments) {
            const amt = toMoneyNumber(p.amount);
            tuitionRevenue += amt;
            paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) || 0) + amt);
            const mode = p.mode || 'unknown';
            if (!modeStats[mode]) modeStats[mode] = { count: 0, amount: 0 };
            modeStats[mode].count++; modeStats[mode].amount += amt;
            const d = new Date(p.date || Date.now());
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthly[key] = (monthly[key] || 0) + amt;
        }

        // Per-student expected (program cost x module, matching the student portal)
        // and the department roll-up.
        let expectedRevenue = 0;
        let fullyPaid = 0;
        let withBalance = 0;
        const deptMap = {};
        for (const s of students) {
            const cost = costOf(s.course) * (Number(s.module) || 1);
            const paid = paidByStudent.get(s.id) || 0;
            expectedRevenue += cost;
            const bal = cost - paid;
            if (cost > 0 && paid >= cost) fullyPaid++;
            else if (bal > 0) withBalance++;

            const dept = s.department || 'unknown';
            if (!deptMap[dept]) deptMap[dept] = { department: dept, departmentName: getDepartmentDisplayName(dept), students: 0, expected: 0, actual: 0, outstanding: 0 };
            deptMap[dept].students++;
            deptMap[dept].expected += cost;
            deptMap[dept].actual += paid;
            deptMap[dept].outstanding += Math.max(0, bal);
        }

        // Other (non-tuition) revenue.
        let otherRevenue = 0;
        const revBySource = {};
        for (const r of revenueRows) {
            const amt = toMoneyNumber(r.amount);
            otherRevenue += amt;
            const src = r.source || 'Other';
            revBySource[src] = (revBySource[src] || 0) + amt;
        }

        // Monthly trend over the last 12 calendar months (zero-filled).
        const trend = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
            trend.push({ month: key, label, amount: monthly[key] || 0 });
        }

        const totalRevenue = tuitionRevenue + otherRevenue;
        const collectionRate = expectedRevenue > 0 ? Number(((tuitionRevenue / expectedRevenue) * 100).toFixed(1)) : 0;

        res.json({
            totals: {
                tuitionRevenue,
                otherRevenue,
                totalRevenue,
                expectedRevenue,
                outstandingBalance: Math.max(0, expectedRevenue - tuitionRevenue),
                collectionRate,
                studentsTotal: students.length,
                fullyPaid,
                withBalance,
                paymentsCount: payments.length,
            },
            paymentModes: Object.entries(modeStats).map(([mode, v]) => ({ mode, count: v.count, amount: v.amount })),
            monthlyTrend: trend,
            departmentBreakdown: Object.values(deptMap).sort((a, b) => b.actual - a.actual),
            revenueStreams: [
                { label: 'Tuition', amount: tuitionRevenue },
                ...Object.entries(revBySource).map(([label, amount]) => ({ label, amount })),
            ],
        });
    } catch (error) {
        console.error('Error building finance analytics:', error);
        res.status(500).json({ message: 'Error building finance analytics' });
    }
});

// ===========================================================================
// FINANCE REPORTS — per-student financial detail for report generation.
// Powers the Outstanding Balances + full student financial reports (PDF/Excel).
// ===========================================================================
router.get('/finance/reports/students', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const [students, programs, payments] = await Promise.all([
            db.select({
                id: schema.students.id,
                admissionNumber: schema.students.admission_number,
                name: schema.students.name,
                course: schema.students.course,
                department: schema.students.department,
                module: schema.students.module,
                intake: schema.students.intake,
                intakeYear: schema.students.intake_year,
            }).from(schema.students).where(isNull(schema.students.deleted_at)),
            db.select({ code: schema.programs.code, name: schema.programs.name, program_cost: schema.programs.program_cost }).from(schema.programs),
            db.select({ studentId: schema.payments.student_id, amount: schema.payments.amount }).from(schema.payments),
        ]);

        const costOf = buildCostResolver(programs);
        const paidByStudent = new Map();
        for (const p of payments) {
            paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) || 0) + toMoneyNumber(p.amount));
        }

        const rows = students.map((s) => {
            const expected = costOf(s.course) * (Number(s.module) || 1);
            const paid = paidByStudent.get(s.id) || 0;
            const balance = Math.max(0, expected - paid);
            return {
                admissionNumber: s.admissionNumber,
                name: s.name,
                course: getCourseDisplayName(s.course) || s.course,
                department: getDepartmentDisplayName(s.department) || s.department,
                module: Number(s.module) || 1,
                intake: s.intake || null,
                intakeYear: s.intakeYear || null,
                expected,
                paid,
                balance,
                status: expected > 0 && paid >= expected ? 'Fully Paid' : (balance > 0 ? 'Outstanding' : 'No Charge'),
            };
        }).sort((a, b) => b.balance - a.balance);

        res.json({ students: rows, generatedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Error building finance student report:', error);
        res.status(500).json({ message: 'Error building finance student report' });
    }
});

module.exports = router;